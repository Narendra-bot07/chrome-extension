"""Architectural enforcement: catches a NEW direct DeepSeek import before
it ships, rather than relying on developers remembering to route through
AIGovernanceGateway. See docs/AI_GOVERNANCE.md 'Central Middleware
Enforcement'.

This is a snapshot/allowlist test, not yet a hard "zero exceptions" rule --
the ~12 live call sites identified in the 2026-08-07 audit still import
DeepSeekProvider/get_llm/get_provider directly, and stay on this allowlist
until each is migrated to the gateway (Phase 12+, one feature at a time).
What this test DOES enforce today: the allowlist cannot grow silently. A
new direct import anywhere not on this list fails the test immediately,
forcing a deliberate choice -- either route it through the gateway (the
correct answer for anything new) or add it here with a comment explaining
why, which a reviewer will see in the diff.

Once every live call site has migrated, delete the allowlist entirely and
this becomes the real Phase 17 "prohibit direct provider imports" rule.
"""
from __future__ import annotations

import re
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent

_DIRECT_IMPORT_PATTERN = re.compile(
    r"(?:^\s*from\s+app\.llm\.deepseek_provider\s+import|"
    r"^\s*import\s+app\.llm\.deepseek_provider|"
    r"^\s*from\s+app\.ai_service\s+import\s+.*\b(?:get_provider|get_llm)\b|"
    r"\bDeepSeekProvider\s*\()",
    re.MULTILINE,
)

# Pre-existing call sites as of the 2026-08-07 audit (docs/AI_GOVERNANCE.md
# "Audit"). Every one of these is a KNOWN, accepted-for-now direct import,
# not a new bypass -- see the module docstring above.
_ALLOWED_DIRECT_IMPORT_FILES = {
    "app/ai_service.py",  # owns get_provider()/get_llm() -- everything else's indirection point
    "app/llm/deepseek_provider.py",  # the provider itself
    "app/services/skill_categorizer_service.py",
    "services/resume_intelligence/semantic.py",
    "services/job_extraction/agents.py",
    "services/cover_letter/generation.py",
    "services/cover_letter/intelligence.py",
    "services/ai_governance/gateway.py",  # the gateway's own controlled call site
}

_SKIP_DIRS = {"__pycache__", ".git", "node_modules", "venv", ".venv"}


def _iter_python_files():
    for path in BACKEND_ROOT.rglob("*.py"):
        if any(part in _SKIP_DIRS for part in path.parts):
            continue
        yield path


def test_no_new_direct_deepseek_imports_outside_allowlist():
    offenders = []
    for path in _iter_python_files():
        rel = path.relative_to(BACKEND_ROOT).as_posix()
        if rel in _ALLOWED_DIRECT_IMPORT_FILES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if _DIRECT_IMPORT_PATTERN.search(text):
            offenders.append(rel)

    assert not offenders, (
        "New direct DeepSeek/provider import(s) found outside the AI governance "
        f"allowlist: {offenders}. Route this through services.ai_governance.gateway."
        "AIGovernanceGateway instead -- see docs/AI_GOVERNANCE.md 'Adding a new AI "
        "feature'. If this really is an intentional, reviewed exception, add it to "
        "_ALLOWED_DIRECT_IMPORT_FILES in this test with a comment explaining why."
    )


def test_allowlist_has_no_stale_entries():
    """Catches the opposite drift: a file on the allowlist that no longer
    imports the provider at all (e.g. after a feature migrates to the
    gateway) should be removed from the allowlist, tightening enforcement
    as migration progresses instead of leaving a permanent stale exception."""
    stale = []
    for rel in sorted(_ALLOWED_DIRECT_IMPORT_FILES):
        path = BACKEND_ROOT / rel
        if not path.exists():
            continue  # Deleted file -- fine, just means the entry is dead weight; not this test's job to flag deletions.
        text = path.read_text(encoding="utf-8")
        if not _DIRECT_IMPORT_PATTERN.search(text):
            stale.append(rel)

    assert not stale, (
        f"These allowlist entries no longer import DeepSeek directly: {stale}. "
        "Remove them from _ALLOWED_DIRECT_IMPORT_FILES to tighten enforcement now "
        "that they've migrated to the gateway."
    )
