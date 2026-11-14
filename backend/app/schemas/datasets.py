from typing import Literal, Optional
from pydantic import BaseModel

DatasetStatus = Literal["not_acquired", "acquired", "unavailable", "remote"]


class Dataset(BaseModel):

    id: str
    name: str
    provider: str
    role: str
    url: str
    status: DatasetStatus
    resolution_m: Optional[float] = None
    crs: Optional[str] = None
    vertical_reference: Optional[str] = None
    units: Optional[str] = None
    coverage: Optional[str] = None
    product_date: Optional[str] = None
    processing_steps: list[str] = []
    file: Optional[str] = None
    extra_files: list[str] = []
    data_subdir: str = "dem"
    notes: Optional[str] = None


class DatasetList(BaseModel):
    datasets: list[Dataset]
    acquired_count: int
    total_count: int
