import asyncio
import json
from app.playwright_pdf import generate_pdf_via_playwright

def main():
    resume_data = {
        "personal_info": {"name": "Test User"}
    }
    resume_str = json.dumps(resume_data)
    
    try:
        res = generate_pdf_via_playwright(resume_str, "ProfessionalATS")
        if res:
            print("PDF Generated successfully!")
        else:
            print("Failed to generate PDF.")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    main()
