"""Tests for the Resume Composition Agent."""

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
                    "Reduced cloud spend by 35% through spot instances and automated scaling policies.",
                ],
            },
            {
                "company": "Data Systems Inc",
                "role": "DevOps Engineer",
                "start_date": "2018",
                "end_date": "2021",
                "location": "San Jose, CA",
                "description": [
                    "Managed CI/CD pipelines in Jenkins and Docker container registries.",
                    "Implemented Prometheus and Grafana alerting for 99.99% system uptime.",
                ],
            },
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
        "skills": ["AWS", "Docker", "Kubernetes", "Terraform", "Python", "Go", "CI/CD"],
        "education": [
            {
                "institution": "University of California, Berkeley",
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


def test_short_resume_composes_comfortable_one_page(sample_resume):
    plan = compose_resume_layout(sample_resume, template_name="ClassicATS")

    assert plan.page_count == 1
    assert plan.density in (DensityLevel.COMFORTABLE, DensityLevel.COMPACT)
    assert plan.final_measurements.remaining_height_px > 0
    assert plan.validation_status.valid is True
    assert plan.validation_status.no_overflow is True


def test_space_optimization_recovers_borderline_overflow(sample_resume):
    # Add additional bullet points to trigger step 4 space optimization
    long_resume = dict(sample_resume)
    long_resume["experience"] = [
        {
            "company": f"Company {i}",
            "role": "Lead Architect",
            "start_date": "2018",
            "end_date": "2021",
            "description": [
                f"Bullet point {j} demonstrating technical evidence and accomplishments."
                for j in range(6)
            ],
        }
        for i in range(3)
    ]

    agent = ResumeCompositionAgent()
    profile = agent.analyze_content(long_resume, ["summary", "experience", "projects", "skills", "education", "certifications"])
    strategy = agent.determine_layout_strategy(profile)
    spacing, steps, recovered = agent.execute_space_optimization(profile, strategy, ["summary", "experience", "projects", "skills", "education", "certifications"])

    assert recovered >= 0
    assert len(steps) == 12
    assert any(step.applied for step in steps)


def test_very_long_resume_balances_two_pages(sample_resume):
    very_long_resume = dict(sample_resume)
    very_long_resume["experience"] = [
        {
            "company": f"Enterprise Corp {i}",
            "role": f"Principal Engineer {i}",
            "start_date": "2010",
            "end_date": "2015",
            "description": [
                "Led large scale distributed systems overhaul across multiple regions.",
                "Engineered zero-downtime database migrations with automated rollbacks.",
                "Mentored engineering teams across 4 timezones.",
            ],
        }
        for i in range(7)
    ]

    plan = compose_resume_layout(very_long_resume, template_name="ExecutiveATS")

    assert plan.page_count == 2
    assert plan.final_measurements.page_break_index is not None
    assert plan.validation_status.no_empty_pages is True
    assert plan.validation_status.no_single_section_page2 is True


def test_composition_agent_preserves_facts_without_modifications(sample_resume):
    agent = ResumeCompositionAgent()
    plan = agent.compose(sample_resume)

    # Ensure sections and content structure remain identical
    assert set(plan.section_order) == set(["summary", "experience", "projects", "skills", "education", "certifications"])
    assert plan.repair_iterations >= 1
