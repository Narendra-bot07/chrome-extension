import requests
data = {
    "resume": {
        "personal_info": {"name": "Test User"},
        "summary": "This is a summary",
        "skills": ["Python"]
    },
    "template_name": "ModernProATS"
}
try:
    response = requests.post("http://localhost:8000/api/download-pdf?company_name=Test", json=data)
    print(response.status_code)
except Exception as e:
    print(e)
