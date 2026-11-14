import json
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse
from app.core.config import settings
from app.schemas.terrain import AreaSummary, HorizonResponse, MeshGrid, PointInfo, SiteInfo
from app.services import dem_service as dem
from app.services import terrain_analysis as ta
from app.services import terrain_service as ts

router = APIRouter(prefix="/terrain", tags=["terrain"])

_GLOBE_DIR = settings.data_dir / "cache" / "global_globe"
_GLOBE_ASSETS = {
    "wac_albedo_4k.jpg": "image/jpeg",
    "ldem_bump_2k.png": "image/png",
}


@router.get("/global/globe")
def global_globe_manifest() -> dict:
    """Browser Full Moon assets built from NASA/USGS WAC + LOLA LDEM_16."""
    man = _GLOBE_DIR / "manifest.json"
    if not man.is_file():
        raise HTTPException(
            404,
            "Global globe assets not built. Download WAC + LDEM into app/data/dem/global/ "
            "then run: python -m scripts.build_global_globe_assets",
        )
    data = json.loads(man.read_text(encoding="utf-8"))
    data["assets"] = {
        "albedo": "/api/terrain/global/globe/wac_albedo_4k.jpg",
        "bump": "/api/terrain/global/globe/ldem_bump_2k.png",
    }
    return data


@router.get("/global/globe/{name}")
def global_globe_asset(name: str) -> FileResponse:
    if name not in _GLOBE_ASSETS:
        raise HTTPException(404, f"Unknown globe asset '{name}'.")
    path = _GLOBE_DIR / name
    if not path.is_file():
        raise HTTPException(404, f"Globe asset missing: {name}. Run scripts.build_global_globe_assets.")
    return FileResponse(path, media_type=_GLOBE_ASSETS[name], headers={"Cache-Control": "public, max-age=86400"})



def thresholds(slope_caution_deg: float = 5.0, slope_high_deg: float = 10.0, roughness_caution_m: float = 0.25,
               roughness_high_m: float = 0.5, max_slope_uncertainty_deg: float = 5.0) -> ta.HazardThresholds:
    if slope_caution_deg >= slope_high_deg or roughness_caution_m >= roughness_high_m:
        raise HTTPException(422, "Caution thresholds must be lower than high-risk thresholds.")
    return ta.HazardThresholds(slope_caution_deg, slope_high_deg, roughness_caution_m, roughness_high_m, max_slope_uncertainty_deg)


def _guard(fn, *a, **k):
    try:
        return fn(*a, **k)
    except ts.SiteNotFound as e:
        raise HTTPException(404, f"No DEM for site '{e}'. Put the *_surf.tif (and optional layers) in {settings.dem_dir}.")
    except ts.OutsideCoverage as e:
        raise HTTPException(422, str(e))
    except dem.DEMError as e:
        raise HTTPException(500, f"DEM problem: {e}")
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/sites")
def sites() -> dict:
    try:
        ts.prepare_dems()
    except Exception as e:
        raise HTTPException(503, f"Could not fetch the Site01 DEM from NASA PGDA: {e}")
    ids = dem.list_site_ids(settings.dem_dir)
    return {"sites": [_guard(ts.site_info, i).model_dump() for i in ids], "count": len(ids)}


@router.get("/{site_id}/layer/{layer}.png")
def layer_png(site_id: str, layer: str, max_px: int = Query(1600, ge=200, le=3200),
              slope_caution_deg: float = 5.0, slope_high_deg: float = 10.0, roughness_caution_m: float = 0.25,
              roughness_high_m: float = 0.5, max_slope_uncertainty_deg: float = 5.0) -> Response:
    if layer not in ts.LAYERS:
        raise HTTPException(404, f"Unknown layer '{layer}'. Available: {', '.join(ts.LAYERS)}")
    t = thresholds(slope_caution_deg, slope_high_deg, roughness_caution_m, roughness_high_m, max_slope_uncertainty_deg)
    try:
        png = _guard(ts.render_layer, site_id, layer, max_px, t)
    except KeyError:
        raise HTTPException(404, f"Layer '{layer}' needs a file that is not loaded for site '{site_id}'.")
    return Response(png, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.get("/{site_id}/legend/{layer}")
def legend(site_id: str, layer: str) -> dict:
    return _guard(ts.layer_range, site_id, layer)


@router.get("/{site_id}/point", response_model=PointInfo)
def point(site_id: str, lat: float | None = None, lon: float | None = None, x: float | None = None, y: float | None = None,
          slope_caution_deg: float = 5.0, slope_high_deg: float = 10.0, roughness_caution_m: float = 0.25,
          roughness_high_m: float = 0.5, max_slope_uncertainty_deg: float = 5.0) -> PointInfo:
    t = thresholds(slope_caution_deg, slope_high_deg, roughness_caution_m, roughness_high_m, max_slope_uncertainty_deg)
    return _guard(ts.point_info, site_id, t, lat=lat, lon=lon, x=x, y=y)


@router.get("/{site_id}/summary", response_model=AreaSummary)
def summary(site_id: str, radius_m: float = Query(100.0, gt=0, le=5000), lat: float | None = None, lon: float | None = None,
            x: float | None = None, y: float | None = None, slope_caution_deg: float = 5.0, slope_high_deg: float = 10.0,
            roughness_caution_m: float = 0.25, roughness_high_m: float = 0.5, max_slope_uncertainty_deg: float = 5.0) -> AreaSummary:
    t = thresholds(slope_caution_deg, slope_high_deg, roughness_caution_m, roughness_high_m, max_slope_uncertainty_deg)
    return _guard(ts.area_summary, site_id, t, radius_m, lat=lat, lon=lon, x=x, y=y)


@router.get("/{site_id}/mesh", response_model=MeshGrid)
def mesh(site_id: str, max_dim: int = Query(160, ge=32, le=512)) -> dict:
    """Downsampled elevation grid for the interactive 3D terrain view."""
    return _guard(ts.mesh_grid, site_id, max_dim)


@router.get("/{site_id}/horizon", response_model=HorizonResponse)
def horizon(site_id: str, lat: float | None = None, lon: float | None = None, x: float | None = None, y: float | None = None,
            observer_height_m: float = Query(0.0, ge=0, le=100), az_step_deg: float = Query(1.0, ge=0.05, le=30),
            max_range_m: float = Query(20000.0, gt=0, le=60000), curvature: bool = True) -> HorizonResponse:
    return _guard(ts.horizon, site_id, observer_height_m, az_step_deg, max_range_m, curvature, lat=lat, lon=lon, x=x, y=y)
