import os
import json
import time
import logging
import threading
from contextlib import contextmanager
from functools import lru_cache
from typing import Dict, Any, Optional, List, Type
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("deepseek_provider")

# Was a threading.Lock() (capacity 1) held for the FULL DURATION of every
# DeepSeek call (see invoke_structured below), not just around the spacing
# check its name implies -- meaning every single LLM call across the whole
# backend, for every user and every pipeline step, was fully serialized
# process-wide. Under any real concurrent traffic this compounds badly: two
# users' calls, or even two calls within one user's own JD-extraction ->
# tailoring -> cover-letter pipeline, queue strictly one-at-a-time behind
# whichever call happened to be in flight. A bounded semaphore allows real
# concurrency up to a safety cap instead of hard-serializing everything.
_MAX_CONCURRENT_AI_REQUESTS = max(
    1,
    int(os.getenv("DEEPSEEK_MAX_CONCURRENT_REQUESTS", "8")),
)
_AI_REQUEST_SEMAPHORE = threading.BoundedSemaphore(_MAX_CONCURRENT_AI_REQUESTS)


@contextmanager
def _ai_request_slot(timeout_seconds: Optional[float] = None):
    acquired = (
        _AI_REQUEST_SEMAPHORE.acquire(timeout=max(0.0, timeout_seconds))
        if timeout_seconds is not None
        else _AI_REQUEST_SEMAPHORE.acquire()
    )
    if not acquired:
        raise TimeoutError("AI request queue is currently saturated.")
    try:
        yield
    finally:
        _AI_REQUEST_SEMAPHORE.release()


def _inline_schema_refs(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively replace Pydantic's $ref/$defs pointers with the actual
    nested schema inline, so a model reading this JSON Schema top-to-bottom
    never has to resolve an indirection to find a nested object's required
    fields."""
    defs = schema.get("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref_name = node["$ref"].rsplit("/", 1)[-1]
                return resolve(defs.get(ref_name, {}))
            return {key: resolve(value) for key, value in node.items() if key != "$defs"}
        if isinstance(node, list):
            return [resolve(item) for item in node]
        return node

    return resolve(schema)


@lru_cache(maxsize=64)
def _serialized_inline_schema(schema_cls: Type[BaseModel]) -> str:
    """Build each Pydantic response schema once per process.

    Schema expansion used to run for every cache miss and every retry path.
    The schemas are immutable class metadata, so rebuilding and serializing
    them adds CPU and allocations without changing the request.
    """
    return json.dumps(
        _inline_schema_refs(schema_cls.model_json_schema()),
        ensure_ascii=False,
        separators=(",", ":"),
    )


class _TimeoutNotSpecified:
    """Sentinel distinguishing "caller didn't pass timeout_seconds at all"
    (use this provider's own class-level default, self.timeout) from an
    explicit `timeout_seconds=None` (no timeout at all -- wait indefinitely
    for this specific call). Plain `None` can't do both jobs at once."""

    def __repr__(self) -> str:
        return "<timeout not specified>"


_TIMEOUT_NOT_SPECIFIED = _TimeoutNotSpecified()


class DeepSeekProvider:
    """
    Provider-neutral DeepSeek LLM client adapter using the OpenAI-compatible API protocol.
    Maintains strict zero-hallucination contracts, structured JSON validation, and automatic
    escalation from deepseek-v4-flash to deepseek-v4-pro on schema validation retries.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        flash_model: Optional[str] = None,
        pro_model: Optional[str] = None,
        timeout: float = 60.0
    ):
        from core.config import settings
        self.api_key = (api_key or settings.DEEPSEEK_API_KEY or os.environ.get("DEEPSEEK_API_KEY", "")).strip()
        self.base_url = (base_url or settings.DEEPSEEK_BASE_URL or "https://api.deepseek.com").rstrip("/")
        self.flash_model = flash_model or settings.DEEPSEEK_MODEL_FLASH or "deepseek-v4-flash"
        self.pro_model = pro_model or settings.DEEPSEEK_MODEL_PRO or "deepseek-v4-pro"
        self.timeout = timeout or settings.DEEPSEEK_TIMEOUT_SECONDS

        if not self.api_key:
            logger.warning("[DEEPSEEK_PROVIDER] DEEPSEEK_API_KEY is missing! Direct API calls will fail unless mocked in tests.")

        try:
            from openai import OpenAI
            self.client = OpenAI(
                api_key=self.api_key or "mock_key",
                base_url=self.base_url,
                timeout=self.timeout,
                max_retries=0
            )
        except Exception as err:
            logger.error(f"[DEEPSEEK_PROVIDER] Error initializing OpenAI SDK client: {err}")
            self.client = None

    def invoke_structured(
        self,
        prompt: str,
        schema_cls: Type[BaseModel],
        system_instruction: Optional[str] = None,
        temperature: float = 0.0,
        escalate_on_error: bool = True,
        timeout_seconds: Any = _TIMEOUT_NOT_SPECIFIED,
        max_tokens: Optional[int] = None,
        queue_timeout_seconds: Optional[float] = None,
    ) -> BaseModel:
        """
        Invokes DeepSeek model with structured JSON response_format and validates output against Pydantic schema_cls.
        """
        queue_started = time.perf_counter()
        with _ai_request_slot(queue_timeout_seconds):
            queue_ms = round((time.perf_counter() - queue_started) * 1000)
            if queue_ms >= 100:
                logger.info(
                    "[DEEPSEEK_QUEUE] waited_ms=%s capacity=%s schema=%s",
                    queue_ms,
                    _MAX_CONCURRENT_AI_REQUESTS,
                    getattr(schema_cls, "__name__", "unknown"),
                )
            sys_msg = system_instruction or (
                "You are an expert AI resume strategist and ATS optimization engine. "
                "Output valid JSON matching the specified JSON schema strictly. Ensure all JSON is well-formed."
            )

            # The instruction above only ever *said* "matching the specified
            # schema" without ever including that schema anywhere in the
            # request — the model had to guess field names/nesting from
            # prose alone. That's unreliable for anything beyond a flat
            # schema (e.g. a schema requiring top-level keys like
            # original/current/potential, each itself a nested object, has
            # no way to be inferred from context). Always attach the real
            # JSON Schema so required keys and nesting are explicit.
            try:
                # Pydantic emits nested models as $ref pointers into $defs.
                # DeepSeek's json_object mode has no constrained decoding, so
                # the model has to *mentally* dereference those pointers —
                # inline them so every required field is spelled out exactly
                # where it's needed, with no indirection to drop along the way.
                schema_json = _serialized_inline_schema(schema_cls)
                sys_msg = (
                    f"{sys_msg}\n\nRespond with a single JSON object that strictly matches this "
                    f"JSON Schema. Every field listed in every \"required\" array — at every level "
                    f"of nesting, not just the top level — MUST be present with a value (not merely "
                    f"omitted from the object). Do not omit a required field inside a nested object "
                    f"just because other fields were easier to determine. A field whose schema type "
                    f"includes \"null\", or that is absent from its object's \"required\" array, is "
                    f"genuinely optional: when the source material has no real value for it, set it "
                    f"to null (or [] for arrays) rather than inventing a placeholder word like "
                    f"\"Unavailable\", \"Not Available\", \"N/A\", \"Unknown\", or \"TBD\" — those "
                    f"placeholder strings are worse than an honest null because they render to users "
                    f"as if they were real extracted data:\n{schema_json}"
                )
            except Exception:
                pass

            # Build messages array
            messages = [
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": prompt}
            ]

            # Attempt 1: Primary Model (deepseek-v4-flash)
            flash_err: Exception = ValueError("unreachable")
            for flash_attempt in range(2):
                try:
                    raw_json = self._chat_completion(
                        model=self.flash_model,
                        messages=messages,
                        temperature=temperature,
                        timeout_seconds=timeout_seconds,
                        max_tokens=max_tokens,
                        # Some DeepSeek-compatible gateways intermittently
                        # return an empty message specifically in json_object
                        # mode. The schema is already embedded in the system
                        # prompt, so retry that exact request once without the
                        # transport hint instead of treating an empty body as
                        # permission to manufacture fields locally.
                        json_mode=flash_attempt == 0,
                    )
                    return self._parse_json_schema(raw_json, schema_cls)
                except Exception as attempt_err:
                    flash_err = attempt_err
                    # "DeepSeek returned empty content" is an anomalous,
                    # non-deterministic response shape confirmed via direct
                    # repro: the SAME request, retried moments later,
                    # sometimes succeeds -- worth exactly one quick
                    # same-model retry. Any other error (timeout, network,
                    # genuine API failure) is NOT retried here; it falls
                    # straight through to the escalate-or-raise handling
                    # below unchanged, since retrying those would just
                    # repeat the same failure at the cost of extra latency.
                    if flash_attempt == 0 and "empty content" in str(attempt_err).casefold():
                        logger.warning(
                            f"[DEEPSEEK_EMPTY_CONTENT_RETRY] {self.flash_model} "
                            "returned empty content; retrying once with prompt-enforced JSON"
                        )
                        continue
                    break

            logger.warning(f"[DEEPSEEK_FAILOVER] Primary model ({self.flash_model}) failed: {flash_err}")
            # Escalation is only worth its cost for a FAST failure. "Empty
            # content" means the API answered quickly with nothing in it --
            # retrying that against a different model costs about a second.
            # A genuine TIMEOUT means the API never answered within the full
            # budget at all -- escalating to deepseek-v4-pro (typically
            # slower, not faster) just pays that same full timeout a second
            # time for very low odds of a different outcome. Confirmed live
            # and in production (2026-08-08, Disney/JPMC postings): flash
            # timed out, escalated anyway, and pro ALSO timed out on the
            # exact same request every time -- turning one ~20-45s failure
            # into a ~80-90s one for no benefit. Never escalate on a timeout;
            # fall straight back to the deterministic evidence path instead,
            # which is what actually reduces latency here.
            failure_text = str(flash_err).casefold()
            is_timeout = isinstance(flash_err, TimeoutError) or "timed out" in failure_text
            is_empty_content = "empty content" in failure_text
            if is_timeout or (not escalate_on_error and not is_empty_content):
                raise flash_err

            # Attempt 2: Escalation Model (deepseek-v4-pro)
            logger.info(f"[DEEPSEEK_ESCALATION] Attempting escalation to ({self.pro_model})...")
            time.sleep(1.0)
            try:
                raw_json_pro = self._chat_completion(
                    model=self.pro_model,
                    messages=messages,
                    temperature=temperature,
                    timeout_seconds=timeout_seconds,
                    max_tokens=max_tokens,
                )
                parsed_obj = self._parse_json_schema(raw_json_pro, schema_cls)
                return parsed_obj
            except Exception as pro_err:
                if "empty content" in str(pro_err).casefold():
                    logger.warning(
                        "[DEEPSEEK_ESCALATION_EMPTY_RETRY] %s returned empty content; "
                        "retrying with prompt-enforced JSON",
                        self.pro_model,
                    )
                    try:
                        raw_json_pro = self._chat_completion(
                            model=self.pro_model,
                            messages=messages,
                            temperature=temperature,
                            timeout_seconds=timeout_seconds,
                            max_tokens=max_tokens,
                            json_mode=False,
                        )
                        return self._parse_json_schema(raw_json_pro, schema_cls)
                    except Exception as final_err:
                        pro_err = final_err
                logger.error(f"[DEEPSEEK_ESCALATION_FAILED] Both flash and pro models failed: {pro_err}")
                raise pro_err

    def _chat_completion(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        timeout_seconds: Any = _TIMEOUT_NOT_SPECIFIED,
        max_tokens: Optional[int] = None,
        json_mode: bool = True,
    ) -> str:
        """Execute chat completion call via OpenAI-compatible SDK or HTTP fallback."""
        # timeout_seconds not specified -> this provider's own default
        # (self.timeout). timeout_seconds=None explicitly -> no timeout at
        # all for this call (both httpx and requests treat timeout=None as
        # "wait indefinitely"); a number -> that many seconds. `timeout_seconds
        # or self.timeout` used to collapse an explicit None into
        # self.timeout too, silently reintroducing a 60s cap for a caller
        # that asked for none.
        resolved_timeout = self.timeout if timeout_seconds is _TIMEOUT_NOT_SPECIFIED else timeout_seconds
        if self.client:
            request_kwargs = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "timeout": resolved_timeout,
            }
            if json_mode:
                request_kwargs["response_format"] = {"type": "json_object"}
            if max_tokens:
                request_kwargs["max_tokens"] = max_tokens
            response = self.client.chat.completions.create(
                **request_kwargs
            )
            content = response.choices[0].message.content
            if not content:
                mode = "response_format json_object" if json_mode else "prompt-enforced JSON"
                raise ValueError(f"DeepSeek returned empty content in {mode} mode.")
            return content
        else:
            # Fallback requests implementation if openai client fails
            import requests
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            if max_tokens:
                payload["max_tokens"] = max_tokens
            res = requests.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=resolved_timeout
            )
            if res.status_code != 200:
                raise ValueError(f"DeepSeek API HTTP error {res.status_code}: {res.text}")
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            if not content:
                raise ValueError("DeepSeek returned empty content.")
            return content

    def _parse_json_schema(self, raw_text: str, schema_cls: Type[BaseModel]) -> BaseModel:
        """Clean markdown codeblocks if present and validate against Pydantic schema."""
        cleaned = raw_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        data = json.loads(cleaned)
        if isinstance(data, dict):
            return schema_cls(**data)
        elif hasattr(schema_cls, "model_validate"):
            return schema_cls.model_validate(data)
        return schema_cls(**data)

class LangChainDeepSeekWrapper:
    """LangChain compatibility wrapper matching with_structured_output interface."""
    def __init__(self, provider: DeepSeekProvider, schema_cls: Type[BaseModel], **invoke_options: Any):
        self.provider = provider
        self.schema_cls = schema_cls
        self.invoke_options = invoke_options

    def invoke(self, input_data: Any, **kwargs: Any) -> BaseModel:
        if isinstance(input_data, str):
            prompt = input_data
        elif hasattr(input_data, "to_string"):
            prompt = input_data.to_string()
        elif hasattr(input_data, "text"):
            prompt = str(input_data.text)
        elif isinstance(input_data, list):
            prompt = "\n".join([str(m) for m in input_data])
        elif isinstance(input_data, dict):
            prompt = json.dumps(input_data)
        else:
            prompt = str(input_data)
        return self.provider.invoke_structured(
            prompt=prompt,
            schema_cls=self.schema_cls,
            **self.invoke_options,
        )

    def __call__(self, input_data: Any, **kwargs: Any) -> Any:
        return self.invoke(input_data, **kwargs)

    def __or__(self, other: Any) -> Any:
        return _RunnablePipe(self, other)

    def __ror__(self, other: Any) -> Any:
        return _RunnablePipe(other, self)

class _RunnablePipe:
    """Lightweight LCEL Runnable Pipe composing prompts with DeepSeek structured output."""
    def __init__(self, first: Any, second: Any):
        self.first = first
        self.second = second

    def invoke(self, input_data: Any, **kwargs: Any) -> Any:
        if hasattr(self.first, "invoke"):
            first_res = self.first.invoke(input_data, **kwargs)
        elif callable(self.first):
            first_res = self.first(input_data, **kwargs)
        else:
            first_res = self.first
        return self.second.invoke(first_res, **kwargs)

    def __or__(self, other: Any) -> Any:
        return _RunnablePipe(self, other)

    def __ror__(self, other: Any) -> Any:
        return _RunnablePipe(other, self)

class ResilientLLMWrapper:
    """Provider-neutral ResilientLLMWrapper providing backward compatibility for get_llm()."""
    def __init__(self, primary_llm: Any = None, fallback_llm: Optional[Any] = None, extra_llm: Optional[Any] = None):
        # A supplied provider owns a persistent OpenAI/httpx connection pool.
        # Reusing it avoids DNS, TCP and TLS setup on every cold-cache call.
        self.provider = primary_llm if isinstance(primary_llm, DeepSeekProvider) else DeepSeekProvider()

    def with_structured_output(self, schema: Type[BaseModel], **kwargs: Any) -> LangChainDeepSeekWrapper:
        return LangChainDeepSeekWrapper(self.provider, schema, **kwargs)

    def invoke(self, input_data: Any, **kwargs: Any) -> Any:
        wrapper = self.with_structured_output(BaseModel)
        return wrapper.invoke(input_data, **kwargs)
