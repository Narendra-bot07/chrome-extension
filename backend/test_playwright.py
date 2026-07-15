import os
from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )
        page = browser.new_page()
        
        page.on("console", lambda msg: print(f"Browser console: {msg.text.encode('ascii', 'ignore').decode('ascii')}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err}"))
        
        try:
            url = "http://localhost:5173/#/print?template=ModernProATS"
            print(f"Navigating to {url}")
            response = page.goto(url, wait_until="networkidle")
            
            if response and response.status == 504:
                print("Got 504 from Vite. Reloading...")
                page.wait_for_timeout(1000)
                page.reload(wait_until="networkidle")
            
            resume_data = '{"personal_info": {"name": "Narendra Bandi"}, "summary": "AI Engineer", "skills": ["Python"]}'
            page.evaluate("data => { window.__INJECTED_RESUME_DATA__ = JSON.parse(data); }", resume_data)
            page.evaluate("window.dispatchEvent(new Event('resumeDataReady'));")
            
            page.wait_for_timeout(2000)
            
            print("DOM Body:")
            print(page.evaluate("document.body.innerHTML")[:500])
        except Exception as e:
            print("Exception:", e)
        finally:
            browser.close()

if __name__ == "__main__":
    test()
