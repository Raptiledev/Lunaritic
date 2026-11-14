from fastapi import APIRouter, HTTPException
from app.api.routes.terrain import _guard
from app.core.config import settings
from app.schemas.validation import ValidationReport
from app.services import terrain_service as ts
from app.services import validation as val

router = APIRouter(prefix="/validation", tags=["validation"])


@router.get("/report", response_model=ValidationReport)
def report(site_id: str = "site01") -> dict:
    """Live validation report: Horizons vs SPICE, terrain confidence, pending checks, method limits."""
    _guard(ts.get_site, site_id)          # 404 when the DEM is missing
    try:
        return val.report(settings.kernel_dir, settings.data_dir, site_id)
    except Exception as e:
        raise HTTPException(500, f"Validation report failed: {type(e).__name__}: {str(e).strip()[:300]}")
