import os
import json
import time
import logging
import threading
from typing import Dict, Any, Optional, List, Type
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("deepseek_provider")

_SINGLE_AI_REQUEST_LOCK = threading.Lock()
_LAST_AI_COMPLETED_TIME = 0.0
_MIN_AI_SPACING_SEC = 1.5

def throttle_ai_call():
    """Enforce a minimum spacing between consecutive API calls."""
    global _LAST_AI_COMPLETED_TIME
    now = time.time()
    elapsed = now - _LAST_AI_COMPLETED_TIME
    if elapsed < _MIN_AI_SPACING_SEC:
        time.sleep(_MIN_AI_SPACING_SEC - elapsed)

# Compatibility aliases
throttle_gemini_call = throttle_ai_call
throttle_groq_call = throttle_ai_call

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
        escalate_on_error: bool = True
    ) -> BaseModel:
        """
        Invokes DeepSeek model with structured JSON response_format and validates output against Pydantic schema_cls.
        """
        global _LAST_AI_COMPLETED_TIME
        with _SINGLE_AI_REQUEST_LOCK:
            now = time.time()
            elapsed = now - _LAST_AI_COMPLETED_TIME
            if elapsed < _MIN_AI_SPACING_SEC:
                time.sleep(_MIN_AI_SPACING_SEC - elapsed)

            sys_msg = system_instruction or (
                "You are an expert AI resume strategist and ATS optimization engine. "
                "Output valid JSON matching the specified JSON schema strictly. Ensure all JSON is well-formed."
            )

            # Build messages array
            messages = [
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": prompt}
            ]

            # Attempt 1: Primary Model (deepseek-v4-flash)
            try:
                raw_json = self._chat_completion(
                    model=self.flash_model,
                    messages=messages,
                    temperature=temperature
                )
                _LAST_AI_COMPLETED_TIME = time.time()
                parsed_obj = self._parse_json_schema(raw_json, schema_cls)
                return parsed_obj
            except Exception as flash_err:
                logger.warning(f"[DEEPSEEK_FAILOVER] Primary model ({self.flash_model}) failed: {flash_err}")
                if not escalate_on_error:
                    _LAST_AI_COMPLETED_TIME = time.time()
                    raise flash_err

                # Attempt 2: Escalation Model (deepseek-v4-pro)
                logger.info(f"[DEEPSEEK_ESCALATION] Attempting escalation to ({self.pro_model})...")
                time.sleep(1.0)
                try:
                    raw_json_pro = self._chat_completion(
                        model=self.pro_model,
                        messages=messages,
                        temperature=temperature
                    )
                    _LAST_AI_COMPLETED_TIME = time.time()
                    parsed_obj = self._parse_json_schema(raw_json_pro, schema_cls)
                    return parsed_obj
                except Exception as pro_err:
                    _LAST_AI_COMPLETED_TIME = time.time()
                    logger.error(f"[DEEPSEEK_ESCALATION_FAILED] Both flash and pro models failed: {pro_err}")
                    raise pro_err

    def _chat_completion(self, model: str, messages: List[Dict[str, str]], temperature: float) -> str:
        """Execute chat completion call via OpenAI-compatible SDK or HTTP fallback."""
        if self.client:
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                response_format={"type": "json_object"}
            )
            content = response.choices[0].message.content
            if not content:
                raise ValueError("DeepSeek returned empty content in response_format json_object mode.")
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
                "response_format": {"type": "json_object"}
            }
            res = requests.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=self.timeout
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
    def __init__(self, provider: DeepSeekProvider, schema_cls: Type[BaseModel]):
        self.provider = provider
        self.schema_cls = schema_cls

    def invoke(self, input_data: Any, **kwargs: Any) -> BaseModel:
        if isinstance(input_data, str):
            prompt = input_data
        elif hasattr(input_data, "to_string"):
            prompt = input_data.to_string()
        elif isinstance(input_data, list):
            prompt = "\n".join([str(m) for m in input_data])
        else:
            prompt = str(input_data)
        return self.provider.invoke_structured(prompt=prompt, schema_cls=self.schema_cls)

class ResilientLLMWrapper:
    """Provider-neutral ResilientLLMWrapper providing backward compatibility for get_llm()."""
    def __init__(self, primary_llm: Any = None, fallback_llm: Optional[Any] = None, extra_llm: Optional[Any] = None):
        self.provider = DeepSeekProvider()

    def with_structured_output(self, schema: Type[BaseModel], **kwargs: Any) -> LangChainDeepSeekWrapper:
        return LangChainDeepSeekWrapper(self.provider, schema)

    def invoke(self, input_data: Any, **kwargs: Any) -> Any:
        wrapper = self.with_structured_output(BaseModel)
        return wrapper.invoke(input_data, **kwargs)
