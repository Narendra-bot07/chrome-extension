import os
import sys
import logging
from dotenv import load_dotenv

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Load environment variables from .env
load_dotenv(os.path.join(backend_dir, ".env"))

def test_langchain_deepseek():
    print("=" * 60)
    print("TESTING DEEPSEEK API USING LANGCHAIN (ChatDeepSeek)")
    print("=" * 60)

    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    print(f"DEEPSEEK_API_KEY set: {'Yes (starts with ' + api_key[:5] + '...)' if api_key else 'NO - MISSING!'}")

    if not api_key:
        print("[FAIL] DEEPSEEK_API_KEY is not set in backend/.env!")
        return False

    try:
        from langchain_deepseek import ChatDeepSeek
        from langchain_core.messages import SystemMessage, HumanMessage
    except ImportError as err:
        print(f"[FAIL] Missing package: {err}")
        print("Please install via: pip install langchain-deepseek")
        return False

    # Initialize ChatDeepSeek as per LangChain documentation
    model_name = os.environ.get("DEEPSEEK_MODEL_FLASH", "deepseek-chat")
    # Note: official model names on api.deepseek.com are 'deepseek-chat' and 'deepseek-reasoner'
    if model_name not in ["deepseek-chat", "deepseek-reasoner"]:
        print(f"[INFO] Model in .env is '{model_name}'. Trying 'deepseek-chat' for standard LangChain compatibility...")
        model_name = "deepseek-chat"

    print(f"Initializing ChatDeepSeek(model='{model_name}')...")
    llm = ChatDeepSeek(
        model=model_name,
        temperature=0.7,
        max_tokens=200,
        timeout=60,
        max_retries=2
    )

    # 1. Simple Invocation
    print("\n--- 1. Testing Chat Completion ---")
    messages = [
        ("system", "You are an AI assistant for a career and resume building platform."),
        ("human", "Hi DeepSeek! Please confirm you are connected and operating properly in one concise sentence.")
    ]

    try:
        response = llm.invoke(messages)
        print("[SUCCESS] DeepSeek Response:")
        print(f"-> {response.content.strip()}")
        if hasattr(response, 'response_metadata') and response.response_metadata:
            usage = response.response_metadata.get("token_usage", {})
            if usage:
                print(f"-> Token Usage: {usage}")
    except Exception as e:
        print(f"[FAIL] Error invoking ChatDeepSeek: {e}")
        return False

    # 2. Structured Output Test
    print("\n--- 2. Testing Structured Output (with_structured_output) ---")
    try:
        from pydantic import BaseModel, Field

        class TestOutput(BaseModel):
            status: str = Field(description="Status of test, e.g. SUCCESS")
            message: str = Field(description="Confirmation message")
            suggested_resume_skills: list[str] = Field(description="3 top software engineering skills")

        structured_llm = llm.with_structured_output(TestOutput)
        prompt = "Provide a test response confirming DeepSeek API is working for resume building."
        
        result: TestOutput = structured_llm.invoke(prompt)
        print("[SUCCESS] Structured Output Received:")
        print(f"-> Status : {result.status}")
        print(f"-> Message: {result.message}")
        print(f"-> Skills : {result.suggested_resume_skills}")
    except Exception as e:
        print(f"[FAIL] Structured output test failed: {e}")
        return False

    return True


if __name__ == "__main__":
    success = test_langchain_deepseek()
    print("\n" + "=" * 60)
    if success:
        print("RESULT: DeepSeek API via LangChain ChatDeepSeek is WORKING PERFECTLY!")
        sys.exit(0)
    else:
        print("RESULT: DeepSeek API test FAILED.")
        sys.exit(1)
