from fastapi import APIRouter, HTTPException
from app.schemas.datasets import DatasetList
from app.services.dataset_registry import load_registry

router = APIRouter(tags=["data"])


@router.get("/datasets", response_model=DatasetList)
def list_datasets() -> DatasetList:
    try:
        return load_registry()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="Dataset registry file datasets.json is missing.") from exc
