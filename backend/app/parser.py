import io
from pypdf import PdfReader
import docx2txt

def extract_text_from_pdf(content: bytes) -> str:
    try:
        pdf_file = io.BytesIO(content)
        reader = PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        raise RuntimeError(f"Error parsing PDF file: {str(e)}")

def extract_text_from_docx(content: bytes) -> str:
    try:
        docx_file = io.BytesIO(content)
        text = docx2txt.process(docx_file)
        return text.strip()
    except Exception as e:
        raise RuntimeError(f"Error parsing DOCX file: {str(e)}")

def extract_text(content: bytes, filename: str) -> str:
    ext = filename.split(".")[-1].lower()
    if ext == "pdf":
        return extract_text_from_pdf(content)
    elif ext in ["docx", "doc"]:
        return extract_text_from_docx(content)
    elif ext in ["txt", "md"]:
        return content.decode("utf-8", errors="ignore").strip()
    else:
        raise ValueError(f"Unsupported file format '.{ext}'. Please upload PDF, DOCX, or TXT.")
