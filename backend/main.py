from dotenv import load_dotenv
load_dotenv()

import sys
import asyncio
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from core.config import settings
from core.exceptions import global_exception_handler
from core.middleware import RequestLoggingMiddleware
from api.router import api_router
from app.routers.api import router as legacy_api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="3.0.0",
    description="Enterprise production-grade clean architecture for AI Resume Tailoring engine."
)

# Custom exception handler
app.add_exception_handler(Exception, global_exception_handler)

# Middlewares
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register v1 routes
app.include_router(api_router, prefix=settings.API_V1_STR)

# Register legacy route for backward compatibility with existing frontends
app.include_router(legacy_api_router)

# Mount templates directory for static preview images
templates_dir = os.path.join(os.path.dirname(__file__), "templates")
os.makedirs(templates_dir, exist_ok=True)
app.mount("/templates", StaticFiles(directory=templates_dir), name="templates")

@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": "3.0.0",
        "layer": "Enterprise Clean Architecture"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
