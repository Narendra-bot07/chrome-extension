"""Deterministic salary/currency extraction.

A bounded-latency safety net alongside the LLM's own salary extraction (see
EXTRACTION_PROMPT's field description on ExtractedJob.salary) -- used by
_deterministic_job_from_evidence (LLM unavailable) and reviewer_agent (LLM
ran but left salary empty despite the evidence clearly stating a figure).

Regex + a currency symbol/code table, not a general NLP/NER model: real-world
salary text is highly formulaic (a currency marker near one or two numbers,
optionally a range, optionally a pay period), and a purpose-built pattern
matches that structure predictably. A generic NER model's MONEY entity type
(e.g. spaCy's en_core_web_sm) tends to mis-segment ranges, "k" abbreviations,
and non-USD currencies without a comparable amount of custom rule layering
on top of it anyway -- so it wouldn't remove this module's logic, only add a
large language-model-download dependency on top of it for no net gain on
this specific, well-known text shape.
"""
from __future__ import annotations

import re
from typing import Optional

from services.job_extraction.schemas import SalaryInfo

_CURRENCY_SYMBOLS: dict[str, str] = {
    "₹": "INR", "€": "EUR", "£": "GBP", "¥": "JPY", "₩": "KRW",
    "₽": "RUB", "₺": "TRY", "₪": "ILS", "₦": "NGN", "₫": "VND",
    "₱": "PHP", "฿": "THB", "₴": "UAH", "C$": "CAD", "A$": "AUD",
    "S$": "SGD", "HK$": "HKD", "R$": "BRL", "$": "USD",
}
_CURRENCY_CODES = {
    "usd", "eur", "gbp", "jpy", "inr", "cad", "aud", "sgd", "chf", "cny",
    "hkd", "nzd", "sek", "nok", "dkk", "zar", "brl", "mxn", "aed", "sar",
    "krw", "php", "thb", "idr", "myr", "vnd", "pln", "try", "ils", "rub",
}
_PERIOD_PATTERNS: tuple[tuple[str, "re.Pattern[str]"], ...] = (
    ("hourly", re.compile(r"/\s*hr\b|/\s*hour\b|per\s+hour|hourly", re.I)),
    ("weekly", re.compile(r"/\s*wk\b|/\s*week\b|per\s+week|weekly", re.I)),
    ("monthly", re.compile(r"/\s*mo\b|/\s*month\b|per\s+month|monthly", re.I)),
    ("yearly", re.compile(r"/\s*y(?:r|ear)\b|per\s+annum|per\s+year|annually|yearly", re.I)),
)

# Longest-first so multi-char symbols/codes ("HK$", "sgd") aren't shadowed by
# a shorter prefix ("$", "s") matching first in the alternation.
_SYMBOL_ALTERNATION = "|".join(re.escape(s) for s in sorted(_CURRENCY_SYMBOLS, key=len, reverse=True))
_CODE_ALTERNATION = "|".join(sorted(_CURRENCY_CODES, key=len, reverse=True))
_CURRENCY_MARKER = re.compile(rf"\b(?:{_CODE_ALTERNATION})\b|{_SYMBOL_ALTERNATION}", re.I)

# \d+(?:,\d{2,3})* naturally accepts BOTH Western 3-3-3 grouping
# ("140,400") and Indian 2-2-3 lakh/crore grouping ("12,00,000") without
# locale detection, since each comma-separated group is only required to be
# 2-3 digits wide rather than fixed at 3.
#
# Confirmed real-world bug: this used to be two alternatives joined by "|"
# -- a capped `\d{1,3}(?:,\d{2,3})*...` first, a plain `\d+...` second.
# Python's re module tries alternatives in ORDER and stops at the first one
# that matches AT ALL, not the one that matches the MOST -- so a flat,
# comma-less number like "106000" hit the first alternative, which greedily
# takes only its first 3 digits ("106") and then has nothing left to
# extend it (no comma follows), leaving "000" as a separate, unrelated
# match. That silently truncated any comma-less salary figure over 999
# (e.g. "€104000 - €106000", written with no thousands separators at all)
# down to its first 1-3 digits. A single unified pattern with an uncapped
# leading \d+ has no such alternative to fall back to -- it always
# consumes the full leading digit run first, whether or not a comma
# grouping follows.
_NUMBER = re.compile(r"\d+(?:,\d{2,3})*(?:\.\d+)?\s*[kK]?")

_PERIOD_MARKER = (
    r"/\s*(?:hr|hour|wk|week|mo|month|yr|year)\b|"
    r"per\s+(?:hour|week|month|year|annum)|hourly|weekly|monthly|yearly|annually"
)
_CURRENCY_TOKEN = rf"(?:{_CODE_ALTERNATION})\b|{_SYMBOL_ALTERNATION}"
# Real postings interleave currency markers AND pay-period markers around
# each number in either order ("$50/hr - $70/hr", "USD $140,400.00 - USD
# $372,300.00 /Yr") -- a fixed single-optional-token skip broke on both of
# these real examples (a repeated currency marker before the second number;
# a period marker sitting between the first number and the separator).
# Freely repeating over currency tokens, period tokens, and whitespace
# lets the range span both numbers regardless of how they're decorated,
# without ever being able to consume a digit itself (none of these
# alternatives can match one), so it can't accidentally skip past a real
# second number.
_INTER_TOKEN_SKIP = rf"(?:\s+|(?:{_CURRENCY_TOKEN})|(?:{_PERIOD_MARKER}))*"
_NUMBER_RANGE = re.compile(
    rf"(?P<n1>{_NUMBER.pattern}){_INTER_TOKEN_SKIP}(?:-|–|—|to|and){_INTER_TOKEN_SKIP}(?P<n2>{_NUMBER.pattern})",
    re.I,
)


def _to_number(raw: str) -> Optional[float]:
    raw = raw.strip()
    multiplier = 1.0
    if raw[-1:].lower() == "k":
        multiplier = 1000.0
        raw = raw[:-1].strip()
    try:
        return float(raw.replace(",", "")) * multiplier
    except ValueError:
        return None


def _resolve_currency(marker: str) -> Optional[str]:
    marker = marker.strip()
    if marker in _CURRENCY_SYMBOLS:
        return _CURRENCY_SYMBOLS[marker]
    if marker.lower() in _CURRENCY_CODES:
        return marker.upper()
    return None


def _currency_near(text: str, start: int, end: int, window: int = 20) -> Optional[str]:
    """Prefers a marker immediately before the number ("$140,000",
    "USD 140,000") since that's the dominant real-world convention, but
    falls back to one immediately after ("140,000 USD") when that's all
    that's present."""
    left = text[max(0, start - window):start]
    left_matches = list(_CURRENCY_MARKER.finditer(left))
    if left_matches:
        resolved = _resolve_currency(left_matches[-1].group(0))
        if resolved:
            return resolved
    right = text[end:end + window]
    right_match = _CURRENCY_MARKER.search(right)
    if right_match:
        return _resolve_currency(right_match.group(0))
    return None


def _detect_period(text: str, start: int, end: int, window: int = 30) -> Optional[str]:
    surrounding = text[max(0, start - window):end + window]
    for period, pattern in _PERIOD_PATTERNS:
        if pattern.search(surrounding):
            return period
    return None


def parse_salary_from_text(text: str) -> Optional[SalaryInfo]:
    """Best-effort deterministic salary extraction from free-form JD text.

    Returns None rather than guessing when no currency-anchored number is
    found -- a missing salary is honest; a fabricated one is not. Only
    ever returns a figure that has an actual currency marker nearby, so it
    can't mistake an unrelated number (years of experience, headcount,
    a percentage) for compensation.
    """
    if not text:
        return None

    for match in _NUMBER_RANGE.finditer(text):
        n1_start = match.start("n1")
        n1_end = n1_start + len(match.group("n1"))
        n2_start = match.start("n2")
        n2_end = n2_start + len(match.group("n2"))
        currency = _currency_near(text, n1_start, n1_end) or _currency_near(text, n2_start, n2_end)
        if not currency:
            continue
        minimum = _to_number(match.group("n1"))
        maximum = _to_number(match.group("n2"))
        if minimum is None or maximum is None:
            continue
        if minimum > maximum:
            minimum, maximum = maximum, minimum
        return SalaryInfo(
            minimum=minimum,
            maximum=maximum,
            currency=currency,
            period=_detect_period(text, match.start(), match.end()),
            raw=re.sub(r"\s+", " ", match.group(0)).strip(),
        )

    for match in _NUMBER.finditer(text):
        currency = _currency_near(text, match.start(), match.end())
        if not currency:
            continue
        value = _to_number(match.group(0))
        if value is None:
            continue
        return SalaryInfo(
            minimum=value,
            maximum=value,
            currency=currency,
            period=_detect_period(text, match.start(), match.end()),
            raw=re.sub(r"\s+", " ", match.group(0)).strip(),
        )
    return None
