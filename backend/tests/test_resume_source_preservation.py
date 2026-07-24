from io import BytesIO

from pypdf import PdfWriter

from services.resume.parser import ResumeParser
from services.resume.source_preservation import restore_source_evidence


RAW = """
KOTHA SHRAVYA YADAV
Achievements & Certifications
Crayon'd Hackathon Finalist Selected as one of the 25 participants to resources and deep-dive with company tasks.
$300 Zscaler voucher for completing Zero Trust Architecture (ZTA) training and related learning resources.
Competitive Programming Solved 500+ problems and attended contests in leetcode[Top-18%] and smartinterviews.
Find Leader in You (FLY) scholar from Competitiveness Mindset Institute, USA. Taking initiative, innovativeness.
EPAM Scholarship From Top 100 selected in India, organized by Nirmaan Organization.
TTPOC-STUDENT VOLUNTEER Volunteered at CAREERNEXUS SUMMIT-2024 and 2025.
"""


def test_restores_full_descriptions_from_original_combined_section():
    parsed = {
        "achievements": [
            "Competitive Programming",
            {"title": "Find Leader in You (FLY)"},
        ],
        "certifications": [
            {"name": "$300 Zscaler voucher"},
        ],
    }
    result = restore_source_evidence(parsed, RAW)
    assert "500+ problems" in result["achievements"][0]
    assert "Taking initiative" in result["achievements"][1]["description"]
    assert "Zero Trust Architecture" in result["certifications"][0]["description"]


def test_preserves_source_annotation_urls_in_links():
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    writer.add_uri(0, "https://leetcode.com/shravya", (10, 10, 100, 30))
    writer.add_uri(0, "https://smartinterviews.in/profile/shravya", (10, 40, 100, 60))
    buffer = BytesIO()
    writer.write(buffer)

    links = ResumeParser.extract_links_from_pdf(buffer.getvalue())
    assert "https://leetcode.com/shravya" in links.values()
    assert "https://smartinterviews.in/profile/shravya" in links.values()


def test_source_links_merge_without_overwriting_parser_links():
    result = restore_source_evidence(
        {"links": {"portfolio": "https://example.com"}},
        RAW,
        {"leetcode_com": "https://leetcode.com/shravya"},
    )
    assert result["links"] == {
        "portfolio": "https://example.com",
        "leetcode_com": "https://leetcode.com/shravya",
    }


def test_replaces_nonempty_duplicated_parser_descriptions_with_unique_source_evidence():
    duplicated = "Selected as one of the 25 participants."
    parsed = {
        "achievements": [
            {"title": "Crayon'd Hackathon Finalist", "description": duplicated},
            {"title": "Competitive Programming", "description": duplicated},
            {"title": "EPAM Scholarship", "description": duplicated},
        ],
        "certifications": [],
    }
    result = restore_source_evidence(parsed, RAW)
    descriptions = [item["description"] for item in result["achievements"]]
    assert len(set(descriptions)) == 3
    assert "500+ problems" in descriptions[1]
    assert "Top 100" in descriptions[2]
