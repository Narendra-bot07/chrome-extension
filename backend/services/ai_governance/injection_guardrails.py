"""Deterministic prompt-injection, jailbreak, and abuse-category
classification. Runs before any LLM call.

Critical rule (docs/AI_GOVERNANCE.md, and repeated here because it's the
single easiest way to get this wrong): DO NOT naive-substring-block every
resume/JD containing security terminology. A resume legitimately containing
"penetration testing", "exploit mitigation", "malware analysis", "SOC",
"red teaming" etc. must remain fully allowed. What matters is whether the
text is DATA ABOUT a topic (a resume bullet describing past work) vs a
DIRECT IMPERATIVE REQUEST asking the assistant to produce operational harm
("give me a working exploit for..."). The heuristics below key off sentence
shape/framing, not keyword presence alone.

This module never sees which underlying task is being classified -- it's
pure text-in, decision-out. The gateway is responsible for deciding what a
BLOCK/ALLOW_WITH_RESTRICTIONS decision means for a given task.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum


class GuardrailDecision(str, Enum):
    ALLOW = "ALLOW"
    ALLOW_WITH_RESTRICTIONS = "ALLOW_WITH_RESTRICTIONS"
    BLOCK = "BLOCK"


class AbuseCategory(str, Enum):
    SAFE_PRODUCT_TASK = "SAFE_PRODUCT_TASK"
    PROMPT_INJECTION = "PROMPT_INJECTION"
    JAILBREAK = "JAILBREAK"
    CREDENTIAL_THEFT = "CREDENTIAL_THEFT"
    SECRET_EXTRACTION = "SECRET_EXTRACTION"
    PHISHING = "PHISHING"
    MALWARE = "MALWARE"
    RANSOMWARE = "RANSOMWARE"
    DESTRUCTIVE_EXPLOITATION = "DESTRUCTIVE_EXPLOITATION"
    UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS"
    DATA_EXFILTRATION = "DATA_EXFILTRATION"
    SEXUAL_CONTENT = "SEXUAL_CONTENT"
    HATE_OR_HARASSMENT = "HATE_OR_HARASSMENT"
    VIOLENCE = "VIOLENCE"
    SELF_HARM = "SELF_HARM"
    ILLEGAL_ACTIVITY = "ILLEGAL_ACTIVITY"
    OTHER_UNSUPPORTED_TASK = "OTHER_UNSUPPORTED_TASK"


@dataclass(frozen=True)
class ClassificationResult:
    decision: GuardrailDecision
    categories: tuple[AbuseCategory, ...] = (AbuseCategory.SAFE_PRODUCT_TASK,)
    confidence: float = 1.0
    reason_code: str = "safe"
    safe_message: str = ""


_SAFE = ClassificationResult(decision=GuardrailDecision.ALLOW)


# --- Prompt injection: attempts to make embedded document/instruction text
# override the system-level task, rather than be treated as data. ---
_INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in (
        r"ignore (?:all )?(?:the )?(?:previous|prior|above|earlier) instructions",
        r"disregard (?:the )?(?:previous|prior|above|earlier) instructions",
        r"forget (?:the )?(?:previous|prior|above|earlier) instructions",
        r"reveal (?:your |the )?system prompt",
        r"print (?:your |the )?(?:hidden|system) (?:instructions|prompt)",
        r"show (?:me )?(?:your |the )?(?:hidden|system) (?:instructions|prompt)",
        r"what (?:is|are) your (?:system )?(?:instructions|prompt)",
        r"override (?:the )?application rules",
        r"bypass (?:the )?(?:safety|application) (?:rules|checks|restrictions)",
        r"you (?:are|'re) now (?:in )?(?:an? )?unrestricted",
        r"act as an? unrestricted",
        r"simulate an? unrestricted model",
        r"\bnew instructions?:\s",
        r"\bsystem:\s*override\b",
        r"end of (?:document|resume|job description)[.,]?\s*(?:new|now) (?:instructions?|task)",
    )
]

# --- Jailbreak: attempts to get the model to shed its behavioral
# constraints entirely, independent of any specific task. ---
_JAILBREAK_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in (
        r"\bdeveloper mode\b",
        r"\bDAN\b(?:\s+mode)?",
        r"pretend you have no restrictions",
        r"pretend (?:you're|you are) an? AI (?:with|that has) no (?:rules|restrictions|filters)",
        r"you have no (?:rules|restrictions|filters|guidelines) (?:anymore|now)",
        r"do anything now",
        r"jailbreak(?:ed)?",
        r"roleplay(?:\s*:)? (?:as an? |you are an? |you're an? )?(?:AI|assistant)(?: with| that has)? no (?:restrictions|rules|filters)",
        r"(?:you are|you're) (?:now )?an? (?:AI|assistant) with no (?:rules|restrictions|filters|limitations)",
    )
]

# --- Instruction smuggling shapes: nested/obfuscated instructions inside
# structured content, which legitimate resume/JD text has no reason to
# contain. ---
_SMUGGLING_PATTERNS = [
    re.compile(p, re.IGNORECASE | re.DOTALL) for p in (
        r"<!--\s*(?:instruction|system|ignore|override)[s:]?",  # HTML comment instructions
        r"```(?:system|instructions?)\b",  # fenced-block instruction smuggling
        r'"role"\s*:\s*"system"',  # JSON instruction smuggling
        r"\[/?INST\]",  # common chat-template delimiter smuggling
        r"<\|(?:system|im_start|im_end)\|>",  # chat-template token smuggling
    )
]

# --- Direct security/credential/secret extraction attempts. ---
_SECRET_EXTRACTION_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in (
        r"reveal (?:the )?(?:api key|secret|password|token|credential)",
        r"output (?:the )?(?:api key|secret|password|token|credential)s?",
        r"what is the (?:api key|database url|connection string)",
        r"give me (?:the |your )?(?:api key|password|secret|credentials?)",
    )
]

# --- Operational-harm request detection. Keyed on IMPERATIVE REQUEST
# framing directed at the assistant to PRODUCE something harmful, not on
# keyword presence alone -- "Performed penetration testing using Burp
# Suite" must never match this. ---
_IMPERATIVE_PREFIX = re.compile(
    r"\b(?:give me|write me|create|generate|build me|make me|show me how to|"
    r"help me (?:to )?|teach me (?:how )?to|i need|i want|please (?:write|create|give|generate|build)|"
    r"how (?:do|can) i)\b",
    re.IGNORECASE,
)
# A resume/JD "data" shape: past-tense achievement bullets. If the sentence
# containing a dangerous keyword matches this shape, it's evidence of DATA,
# not a request, and weighs against blocking.
_RESUME_BULLET_SHAPE = re.compile(
    r"^\s*(?:[-*•]\s*)?(?:performed|conducted|led|built|developed|"
    r"implemented|designed|managed|executed|delivered|responsible for|"
    r"experience (?:in|with)|proficient (?:in|with)|skilled (?:in|at))\b",
    re.IGNORECASE,
)

_CATEGORY_KEYWORDS: dict[AbuseCategory, re.Pattern] = {
    AbuseCategory.MALWARE: re.compile(
        r"\b(?:working (?:virus|malware|trojan)|functional (?:virus|malware)|"
        r"malware (?:that|to)|virus (?:that|to)|keylogger (?:that|to build|for)|"
        r"remote access trojan)\b", re.IGNORECASE,
    ),
    AbuseCategory.RANSOMWARE: re.compile(r"\bransomware\b.*\b(?:build|create|write|deploy)\b|\b(?:build|create|write|deploy)\b.*\bransomware\b", re.IGNORECASE),
    AbuseCategory.CREDENTIAL_THEFT: re.compile(
        r"\b(?:crack|steal|brute[- ]?force|bypass) (?:this |the |a )?(?:password|login|authentication|2fa|mfa)\b",
        re.IGNORECASE,
    ),
    AbuseCategory.PHISHING: re.compile(
        r"\bphishing (?:email|page|kit|site)\b.*\b(?:write|create|build|generate)\b|"
        r"\b(?:write|create|build|generate)\b.*\bphishing (?:email|page|kit|site)\b",
        re.IGNORECASE,
    ),
    AbuseCategory.UNAUTHORIZED_ACCESS: re.compile(
        r"\b(?:hack|compromise|break into|gain (?:unauthorized )?access to)\b.*\b(?:server|account|system|network|database)\b",
        re.IGNORECASE,
    ),
    AbuseCategory.DESTRUCTIVE_EXPLOITATION: re.compile(
        r"\bworking exploit\b|\b(?:0[- ]?day|zero[- ]?day) exploit\b.*\b(?:for|against)\b",
        re.IGNORECASE,
    ),
    AbuseCategory.DATA_EXFILTRATION: re.compile(
        r"\b(?:exfiltrate|extract|dump) (?:all )?(?:the )?(?:user|customer|database) data\b",
        re.IGNORECASE,
    ),
    AbuseCategory.SELF_HARM: re.compile(
        r"\b(?:how to|ways to) (?:kill myself|end my life|self[- ]?harm)\b", re.IGNORECASE,
    ),
    AbuseCategory.VIOLENCE: re.compile(
        r"\bhow (?:do|to) (?:i )?(?:make|build) (?:a )?(?:bomb|explosive|weapon)\b", re.IGNORECASE,
    ),
}


def _matches_any(patterns: list[re.Pattern], text: str) -> re.Match | None:
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match
    return None


def classify_request(text: str) -> ClassificationResult:
    """Runs every deterministic check against one piece of untrusted text
    (a resume, a JD, a user instruction, etc.) and returns the most severe
    decision found. Cheap -- pure regex, no I/O, safe to call on every
    field of every request."""
    if not text or not text.strip():
        return _SAFE

    if _matches_any(_JAILBREAK_PATTERNS, text):
        return ClassificationResult(
            decision=GuardrailDecision.BLOCK,
            categories=(AbuseCategory.JAILBREAK,),
            reason_code="jailbreak_signature",
            safe_message="This request cannot be processed by the AI editing feature.",
        )

    if _matches_any(_SECRET_EXTRACTION_PATTERNS, text):
        return ClassificationResult(
            decision=GuardrailDecision.BLOCK,
            categories=(AbuseCategory.SECRET_EXTRACTION,),
            reason_code="secret_extraction_attempt",
            safe_message="This request cannot be processed by the AI editing feature.",
        )

    if _matches_any(_SMUGGLING_PATTERNS, text):
        return ClassificationResult(
            decision=GuardrailDecision.BLOCK,
            categories=(AbuseCategory.PROMPT_INJECTION,),
            reason_code="instruction_smuggling",
            safe_message="This request cannot be processed by the AI editing feature.",
        )

    if _matches_any(_INJECTION_PATTERNS, text):
        return ClassificationResult(
            decision=GuardrailDecision.BLOCK,
            categories=(AbuseCategory.PROMPT_INJECTION,),
            reason_code="embedded_instruction_in_document",
            safe_message="This request cannot be processed by the AI editing feature.",
        )

    # Operational-harm category check: only fires when an imperative
    # request pattern co-occurs with a dangerous-intent keyword pattern IN
    # THE SAME sentence, and that sentence does not match the resume-bullet
    # "data" shape. This is the mechanism that keeps "Performed penetration
    # testing using Burp Suite" allowed while blocking "Give me a working
    # exploit to compromise this production server."
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
        stripped = sentence.strip()
        if not stripped or _RESUME_BULLET_SHAPE.match(stripped):
            continue
        if not _IMPERATIVE_PREFIX.search(stripped):
            continue
        for category, pattern in _CATEGORY_KEYWORDS.items():
            if pattern.search(stripped):
                return ClassificationResult(
                    decision=GuardrailDecision.BLOCK,
                    categories=(category,),
                    reason_code="operational_harm_request",
                    safe_message="This request is outside what the AI editing feature can help with.",
                )

    return _SAFE
