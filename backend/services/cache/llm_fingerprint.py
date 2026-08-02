import hashlib
import json
import re
import unicodedata
from typing import Any, Dict, List, Set, Union


class LLMFingerprintBuilder:
    """
    Deterministic Input Fingerprinting and Key Normalization for Tailr4U LLM Workflows.
    Converts raw text, Pydantic objects, and dicts into canonical SHA-256 fingerprints.
    """

    @staticmethod
    def normalize_text(text: str) -> str:
        """
        Normalize text inputs:
        - Normalize Unicode to NFC
        - Normalize CRLF and CR line endings to LF (\n)
        - Collapse multiple spaces/tabs per line
        - Strip leading/trailing whitespace
        """
        if not text:
            return ""
        # 1. Unicode NFC
        normalized = unicodedata.normalize("NFC", str(text))
        # 2. Line ending normalization
        normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
        # 3. Strip whitespace per line
        lines = [line.strip() for line in normalized.split("\n")]
        # 4. Filter empty lines if redundant
        cleaned = "\n".join(lines).strip()
        return cleaned

    @classmethod
    def canonical_value(cls, value: Any) -> Any:
        """
        Recursively convert value into a canonical form suitable for JSON serialization:
        - Dicts: Sort keys alphabetically
        - Sets: Convert to sorted lists
        - Strings: Apply normalize_text
        - Pydantic models: Use model_dump(mode='json')
        """
        if value is None:
            return None
        if isinstance(value, (int, float, bool)):
            return value
        if isinstance(value, str):
            return cls.normalize_text(value)
        if isinstance(value, set):
            return [cls.canonical_value(x) for x in sorted(value, key=lambda x: str(x))]
        if isinstance(value, list):
            return [cls.canonical_value(x) for x in value]
        if isinstance(value, dict):
            # Sort dictionary by key alphabetically
            return {
                str(k): cls.canonical_value(v)
                for k, v in sorted(value.items(), key=lambda x: str(x[0]))
            }
        if hasattr(value, "model_dump"):
            return cls.canonical_value(value.model_dump(mode="json"))
        if hasattr(value, "__dict__"):
            return cls.canonical_value(value.__dict__)
        return str(value)

    @classmethod
    def canonical_json(cls, payload: Any) -> str:
        """
        Serialize payload to canonical JSON string with sorted keys and zero extra whitespace.
        """
        canonical_obj = cls.canonical_value(payload)
        return json.dumps(canonical_obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

    @classmethod
    def build_fingerprint(cls, payload: Any) -> str:
        """
        Generate SHA-256 hex digest of the canonical JSON payload.
        """
        canonical_str = cls.canonical_json(payload)
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    @classmethod
    def build_cache_key(
        cls,
        *,
        namespace: str = "tailr4u",
        schema_version: str = "v1",
        provider: str = "deepseek",
        task: str,
        fingerprint: str
    ) -> str:
        """
        Build versioned Redis cache key without PII or raw text.
        Format: {namespace}:{schema_version}:{provider}:{task}:{fingerprint}
        """
        clean_task = re.sub(r"[^a-zA-Z0-9_]+", "_", task.lower()).strip("_")
        return f"{namespace}:{schema_version}:{provider}:{clean_task}:{fingerprint}"
