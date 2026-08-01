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
from api.v1.plans import router as plans_router
from api.v1.subscription import router as subscription_router
from api.v1.usage import router as usage_router
from api.v1.admin_subscriptions import router as admin_subscriptions_router
from api.v1.job_preferences import router as job_preferences_router
from api.v1.workflows import router as workflows_router
from app.billing.routers.billing import router as billing_router
from api.v1.notifications import router as notifications_router, reminder_router
from api.v1.admin_abuse import router as admin_abuse_router

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
api_router.include_router(plans_router)
api_router.include_router(subscription_router)
api_router.include_router(usage_router)
api_router.include_router(admin_subscriptions_router)
api_router.include_router(job_preferences_router)
api_router.include_router(workflows_router)
api_router.include_router(billing_router)
api_router.include_router(notifications_router)
api_router.include_router(reminder_router)
api_router.include_router(admin_abuse_router)
