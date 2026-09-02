from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.endpoints import router as api_router
from app.config import settings

app = FastAPI(title="PlanCount Backend")

# CORS is a defense-in-depth layer here, not the access-control mechanism —
# `verify_token` (see auth_service.py) is. `localhost:4200` is always
# allowed so `ng serve`'s dev proxy keeps working regardless of what
# CORS_ALLOWED_ORIGIN is set to.
_DEV_ORIGIN = "http://localhost:4200"
app.add_middleware(
    CORSMiddleware,
    allow_origins=list({settings.cors_allowed_origin, _DEV_ORIGIN}),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": "Missing or invalid file field"})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
