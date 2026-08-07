from services.job_extraction.salary_parser import parse_salary_from_text


def test_currency_symbol_prefixed_range_with_repeated_code():
    result = parse_salary_from_text(
        "The base salary range for this job is USD $140,400.00 - USD $372,300.00 /Yr."
    )
    assert result is not None
    assert result.minimum == 140400.0
    assert result.maximum == 372300.0
    assert result.currency == "USD"
    assert result.period == "yearly"


def test_symbol_range_with_period_marker_between_number_and_separator():
    result = parse_salary_from_text("Pay range $50/hr - $70/hr")
    assert result is not None
    assert result.minimum == 50.0
    assert result.maximum == 70.0
    assert result.currency == "USD"
    assert result.period == "hourly"


def test_currency_code_suffix_range():
    result = parse_salary_from_text("Base pay of 90,000 - 120,000 USD annually")
    assert result is not None
    assert result.minimum == 90000.0
    assert result.maximum == 120000.0
    assert result.currency == "USD"
    assert result.period == "yearly"


def test_pound_symbol_range():
    result = parse_salary_from_text("Salary: £50,000 - £65,000 per annum")
    assert result is not None
    assert result.minimum == 50000.0
    assert result.maximum == 65000.0
    assert result.currency == "GBP"
    assert result.period == "yearly"


def test_indian_lakh_grouped_rupee_range():
    result = parse_salary_from_text("CTC: ₹12,00,000 - ₹18,00,000 per annum")
    assert result is not None
    assert result.minimum == 1200000.0
    assert result.maximum == 1800000.0
    assert result.currency == "INR"
    assert result.period == "yearly"


def test_k_suffix_range_with_decimals():
    result = parse_salary_from_text("$140.4k - $180.2k")
    assert result is not None
    assert result.minimum == 140400.0
    assert result.maximum == 180200.0
    assert result.currency == "USD"


def test_k_suffix_bare_range_currency_after():
    result = parse_salary_from_text("We offer 100k - 150k USD annually")
    assert result is not None
    assert result.minimum == 100000.0
    assert result.maximum == 150000.0
    assert result.currency == "USD"
    assert result.period == "yearly"


def test_between_and_separator():
    result = parse_salary_from_text("The role pays between $80K and $100K per year.")
    assert result is not None
    assert result.minimum == 80000.0
    assert result.maximum == 100000.0
    assert result.period == "yearly"


def test_single_figure_no_range():
    result = parse_salary_from_text("Salary: $90,000")
    assert result is not None
    assert result.minimum == 90000.0
    assert result.maximum == 90000.0
    assert result.currency == "USD"


def test_min_max_reordered_when_stated_backwards():
    result = parse_salary_from_text("Salary: $150,000 - $120,000 (negotiable by level)")
    assert result is not None
    assert result.minimum == 120000.0
    assert result.maximum == 150000.0


def test_no_currency_marker_returns_none():
    result = parse_salary_from_text(
        "This role has no salary info at all, just years of experience: 5-7 years required."
    )
    assert result is None


def test_unrelated_number_range_without_currency_is_not_a_false_positive():
    assert parse_salary_from_text("Team of 50-100 engineers globally.") is None
    assert parse_salary_from_text("Ages 5 and 6 are eligible.") is None


def test_empty_text_returns_none():
    assert parse_salary_from_text("") is None
    assert parse_salary_from_text(None) is None  # type: ignore[arg-type]


def test_singapore_dollar_code_range_with_to_separator():
    result = parse_salary_from_text("Compensation range: SGD 80,000 to SGD 120,000")
    assert result is not None
    assert result.minimum == 80000.0
    assert result.maximum == 120000.0
    assert result.currency == "SGD"
