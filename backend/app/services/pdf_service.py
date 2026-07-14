from typing import Optional
from app.pdf_generator import (
    generate_pdf,
    generate_latex_code,
    compile_latex_to_pdf,
    generate_cover_letter_pdf
)
from app.schemas import ResumeStructure, CoverLetterResult

class PDFService:
    def generate_resume_pdf(self, resume: ResumeStructure, template_name: str = "modern") -> bytes:
        return generate_pdf(resume, template_name)

    def generate_latex(self, resume: ResumeStructure, template_name: str = "modern") -> str:
        return generate_latex_code(resume, template_name)

    def compile_latex(self, latex_code: str) -> Optional[bytes]:
        return compile_latex_to_pdf(latex_code)

    def generate_cover_letter_pdf(self, cover_letter: CoverLetterResult) -> bytes:
        return generate_cover_letter_pdf(cover_letter)
