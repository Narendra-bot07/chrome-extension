from fastapi import APIRouter
from api.v1.auth import router as auth_router
from api.v1.resume import router as resume_router
from api.v1.jobs import router as jobs_router
from api.v1.tailoring import router as tailoring_router
from api.v1.analytics import router as analytics_router
from api.v1.profile import router as profile_router
from api.v1.health import router as health_router
from api.v1.applications import router as applications_router
from api.v1.sessions import router as sessions_router
from api.v1.support import router as support_router
from app.billing.routers.billing import router as billing_router

api_router = APIRouter()

# Include version 1 routers
api_router.include_router(auth_router)
api_router.include_router(resume_router)
api_router.include_router(jobs_router)
api_router.include_router(tailoring_router)
api_router.include_router(analytics_router)
api_router.include_router(profile_router)
api_router.include_router(health_router)
api_router.include_router(applications_router)
api_router.include_router(sessions_router)
api_router.include_router(support_router)
api_router.include_router(billing_router)
