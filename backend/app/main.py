from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import analysis, datasets, ephemeris, health, terrain, validation
from app.core.config import settings

app = FastAPI(title=settings.app_name, version=settings.version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(datasets.router, prefix="/api")
app.include_router(terrain.router, prefix="/api")
app.include_router(ephemeris.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(validation.router, prefix="/api")
