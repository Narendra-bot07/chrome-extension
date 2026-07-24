import io
import re
from pypdf import PdfReader
import docx2txt
from core.exceptions import UnsupportedFileError
from urllib.parse import urlparse

class ResumeParser:
    @staticmethod
    def extract_links_from_pdf(content: bytes) -> dict[str, str]:
        """Preserve actual PDF annotation targets; text extraction omits them."""
        try:
            reader = PdfReader(io.BytesIO(content))
            urls: list[str] = []
            for page in reader.pages:
                for annotation_ref in page.get("/Annots") or []:
                    annotation = annotation_ref.get_object()
                    action = annotation.get("/A")
                    uri = str(action.get("/URI") or "").strip() if action else ""
                    if uri and uri not in urls:
                        urls.append(uri)
            links: dict[str, str] = {}
            for index, url in enumerate(urls, 1):
                host = urlparse(url if "://" in url else f"https://{url}").netloc
                label = re.sub(r"[^a-z0-9]+", "_", host.lower()).strip("_") or f"source_link_{index}"
                key = label
                suffix = 2
                while key in links:
                    key, suffix = f"{label}_{suffix}", suffix + 1
                links[key] = url
            return links
        except Exception as exc:
            raise RuntimeError(f"Error extracting PDF links: {str(exc)}")

    @staticmethod
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

    @staticmethod
    def extract_text_from_docx(content: bytes) -> str:
        try:
            docx_file = io.BytesIO(content)
            text = docx2txt.process(docx_file)
            return text.strip()
        except Exception as e:
            raise RuntimeError(f"Error parsing DOCX file: {str(e)}")

    @classmethod
    def extract_text(cls, content: bytes, filename: str) -> str:
        ext = filename.split(".")[-1].lower()
        if ext == "pdf":
            return cls.extract_text_from_pdf(content)
        elif ext in ["docx", "doc"]:
            return cls.extract_text_from_docx(content)
        elif ext in ["txt", "md"]:
            return content.decode("utf-8", errors="ignore").strip()
        else:
            raise UnsupportedFileError(f"Unsupported file format '.{ext}'. Please upload PDF or DOCX.")

    @classmethod
    def extract_links(cls, content: bytes, filename: str) -> dict[str, str]:
        return cls.extract_links_from_pdf(content) if filename.lower().endswith(".pdf") else {}
