from langchain_core.prompts import ChatPromptTemplate

class PromptBuilder:
    @staticmethod
    def get_resume_parsing_prompt() -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages([
            ("system", "You are an expert ATS-parsing assistant. Analyze the unstructured resume text and extract it into the structured JSON schema format. Capture all experiences, education, skills, projects, and certifications. If a section is missing, fill with default empty values."),
            ("human", "{text}")
        ])

    @staticmethod
    def get_job_analysis_prompt() -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages([
            ("system", """You are an expert job description analyzer. Extract key details into the structured format (title, company, location, salary, job_type, work_mode, experience_required, highlights, qualifications, required_skills, preferred_skills, responsibilities, keywords, ats_keywords, seniority).
            
            To be classified as job-related (is_job_related = true), the text MUST satisfy at least TWO of the following rules:
            1. It explicitly states a job role, title, hiring status, or recruitment context.
            2. It contains a list of professional skills or requirements.
            3. It outlines specific job duties or tasks.
            
            Be highly strict. If there is no clear intent of recruiting or describing a professional role, set `is_job_related` to false."""),
            ("human", "{text}")
        ])
