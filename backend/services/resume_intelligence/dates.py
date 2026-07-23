"""Deterministic resume date parsing and overlap-safe duration calculation."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from .models import DateValue, ExperienceCalculation, ExperienceEntry, confidence


MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def parse_date(value: str | None) -> DateValue | None:
    original = (value or "").strip()
    if not original:
        return None
    if re.search(r"\b(present|current|now|ongoing)\b", original, re.I):
        now = datetime.now(timezone.utc)
        return DateValue(
            original=original,
            year=now.year,
            month=now.month,
            is_present=True,
            confidence=confidence(0.98, "explicit current-date marker"),
        )
    month_match = re.search(
        r"\b(" + "|".join(MONTHS) + r")\b[\s,./-]*(\d{4})",
        original,
        re.I,
    )
    if month_match:
        return DateValue(
            original=original,
            year=int(month_match.group(2)),
            month=MONTHS[month_match.group(1).lower()],
            confidence=confidence(0.98, "month and year parsed"),
        )
    numeric = re.search(r"\b(0?[1-9]|1[0-2])[/-](\d{4})\b", original)
    if numeric:
        return DateValue(
            original=original,
            year=int(numeric.group(2)),
            month=int(numeric.group(1)),
            confidence=confidence(0.95, "numeric month and year parsed"),
        )
    year = re.search(r"\b((?:19|20)\d{2})\b", original)
    if year:
        return DateValue(
            original=original,
            year=int(year.group(1)),
            month=None,
            confidence=confidence(0.72, "year-only date"),
        )
    return DateValue(original=original, confidence=confidence(0, "unparseable date"))


def month_index(value: DateValue | None, *, end: bool = False) -> int | None:
    if not value or value.year is None:
        return None
    month = value.month or (12 if end else 1)
    return value.year * 12 + month - 1


def calculate_experience(entries: list[ExperienceEntry]) -> ExperienceCalculation:
    professional_months: set[int] = set()
    internship_months: set[int] = set()
    uncertain = 0
    included: list[str] = []
    excluded: list[str] = []
    warnings: list[str] = []
    all_ranges: list[tuple[int, int]] = []

    for entry in entries:
        start = month_index(entry.start_date)
        end = month_index(entry.end_date, end=True)
        if start is None or end is None:
            excluded.append(entry.id)
            warnings.append(f"{entry.id} excluded: incomplete date range")
            uncertain += entry.duration_months or 0
            continue
        if end < start:
            excluded.append(entry.id)
            warnings.append(f"{entry.id} excluded: end date precedes start date")
            continue
        months = set(range(start, end + 1))
        included.append(entry.id)
        all_ranges.append((start, end))
        if (entry.employment_type or "").lower() == "internship" or "intern" in (
            entry.role_title or ""
        ).lower():
            internship_months.update(months)
        else:
            professional_months.update(months)

    combined = professional_months | internship_months
    total_calendar = (
        max(end for _, end in all_ranges) - min(start for start, _ in all_ranges) + 1
        if all_ranges
        else 0
    )
    score = 0.95 if included and not excluded else 0.65 if included else 0
    return ExperienceCalculation(
        total_calendar_months=total_calendar,
        non_overlapping_professional_months=len(professional_months),
        internship_months=len(internship_months - professional_months),
        uncertain_months=uncertain,
        calculation_confidence=confidence(score, "deterministic non-overlapping month union"),
        included_entries=included,
        excluded_entries=excluded,
        warnings=warnings,
    )
