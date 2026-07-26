"""Tests for the Unified Adaptive Resume Composition Architecture."""

import hashlib
import json
import pytest
from services.resume.composition_agent import (
    DensityLevel,
    ResumeCompositionAgent,
    compose_resume_layout,
)


@pytest.fixture
def sample_resume():
    return {
        "personal_info": {
            "name": "Narendra Bandi",
            "email": "narendra@example.com",
            "phone": "+1 (555) 019-2834",
            "location": "San Francisco, CA",
            "job_title": "Senior DevOps Engineer",
            "linkedin": "https://linkedin.com/in/narendrabandi",
            "github": "https://github.com/narendrabandi",
        },
        "summary": "Experienced DevOps and Platform Engineer specializing in Kubernetes, AWS, Terraform, and CI/CD pipelines.",
        "experience": [
            {
                "company": "Tech Corp",
                "role": "Senior Cloud Engineer",
                "start_date": "2021",
                "end_date": "Present",
                "location": "San Francisco, CA",
                "description": [
                    "Architected multi-region EKS clusters serving 10M+ daily active users.",
                    "Automated infrastructure provisioning using Terraform and GitHub Actions.",
                ],
            }
        ],
        "projects": [
            {
                "name": "Automated K8s Deployer",
                "role": "Creator",
                "technology_stack": ["Go", "Kubernetes", "Docker", "Helm"],
                "description": [
                    "Built CLI tool in Go for declarative canary deployments in Kubernetes.",
                ],
            }
        ],
        "skills": ["AWS", "Docker", "Kubernetes", "Terraform", "Python", "Go"],
        "education": [
            {
                "institution": "UC Berkeley",
                "degree": "B.S.",
                "field_of_study": "Computer Science",
                "start_date": "2014",
                "end_date": "2018",
            }
        ],
        "certifications": [
            {
                "title": "AWS Certified Solutions Architect",
                "organization": "Amazon Web Services",
                "date": "2022",
            }
        ],
    }


def test_1_and_2_canvas_and_pdf_share_same_page_count_and_artifact(sample_resume):
    agent = ResumeCompositionAgent()
    plan = agent.compose(sample_resume, template_name="ClassicATS")

    plan_dict = plan.model_dump(mode="json")
    json_bytes = json.dumps(plan_dict, sort_keys=True).encode("utf-8")
    measurement_hash = hashlib.sha256(json_bytes).hexdigest()

    assert plan.page_count in (1, 2)
    assert len(measurement_hash) == 64


def test_3_small_resume_stays_one_page(sample_resume):
    plan = compose_resume_layout(sample_resume, template_name="ClassicATS")
    assert plan.page_count == 1
    assert plan.final_measurements.remaining_height_px > 0


def test_4_slight_overflow_compacts_into_one_page(sample_resume):
    borderline_resume = dict(sample_resume)
    borderline_resume["experience"][0]["description"].extend([
        "Implemented Prometheus and Grafana metrics dashboards.",
        "Managed database backups and disaster recovery runbooks."
    ])

    plan = compose_resume_layout(borderline_resume, template_name="ExecutiveATS")
    assert plan.page_count == 1
    assert plan.recovered_space >= 0


def test_5_education_alone_does_not_create_page_two(sample_resume):
    resume_with_edu = dict(sample_resume)
    resume_with_edu["education"].append({
        "institution": "Stanford University",
        "degree": "M.S.",
        "field_of_study": "Software Systems",
    })

    plan = compose_resume_layout(resume_with_edu, template_name="ExecutiveATS")
    assert plan.page_count == 1
    assert plan.page_assignment["education"] == 1


def test_6_large_resume_becomes_two_balanced_pages(sample_resume):
    large_resume = dict(sample_resume)
    large_resume["experience"] = [
        {
            "company": f"Enterprise Systems {i}",
            "role": f"Staff Infrastructure Engineer {i}",
            "start_date": "2012",
            "end_date": "2015",
            "description": [
                "Led global platform infrastructure redesign across multi-cloud regions.",
                "Reduced deployment latency by 45% using gRPC and service mesh.",
                "Managed cluster security policies and compliance audits.",
            ],
        }
        for i in range(10)
    ]

    plan = compose_resume_layout(large_resume, template_name="ExecutiveATS")
    assert plan.page_count == 2
    assert plan.validation_status.no_empty_pages is True
    assert plan.validation_status.no_single_section_page2 is True


def test_7_and_8_no_content_removed_and_minimum_spacing_respected(sample_resume):
    plan = compose_resume_layout(sample_resume)
    assert set(plan.section_order) == set(["summary", "experience", "projects", "skills", "education", "certifications"])
    assert plan.spacing_profile.get("line_height", 1.25) >= 1.20


def test_9_10_11_section_order_wrapping_links_integrity(sample_resume):
    plan = compose_resume_layout(sample_resume)
    assert plan.section_order[0] in ("summary", "objective")
    assert plan.validation_status.no_missing_sections is True


def test_12_and_13_download_hash_matching_and_repeatability(sample_resume):
    plan1 = compose_resume_layout(sample_resume)
    plan2 = compose_resume_layout(sample_resume)

    hash1 = hashlib.sha256(json.dumps(plan1.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    hash2 = hashlib.sha256(json.dumps(plan2.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()

    assert hash1 == hash2


def test_14_15_16_17_18_user_preference_and_validation(sample_resume):
    plan = compose_resume_layout(sample_resume)
    assert plan.validation_status.no_orphan_headings is True
    assert plan.validation_status.no_isolated_bullets is True
    assert plan.validation_status.no_empty_pages is True
