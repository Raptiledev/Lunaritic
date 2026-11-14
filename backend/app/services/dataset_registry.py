import json
from app.core.config import settings
from app.schemas.datasets import Dataset, DatasetList
from app.services.remote_data import remote_url_for


def load_registry() -> DatasetList:
    """Registry entries come from datasets.json. Status is acquired only when every file is on disk.

    If remote fetch is on and a public URL is known, a missing product is "remote": it will be
    downloaded on use, and is not yet a local file.
    """
    path = settings.data_dir / "datasets.json"
    with path.open(encoding="utf-8") as f:
        items = [Dataset(**d) for d in json.load(f)]
    for d in items:
        if not d.file:
            continue
        names = (d.file, *d.extra_files)
        folder = settings.data_dir / d.data_subdir
        if all((folder / f).is_file() for f in names):
            d.status = "acquired"
        elif settings.remote_data and all(remote_url_for(f) for f in names):
            d.status = "remote"
        else:
            d.status = "not_acquired"
    acquired = sum(1 for d in items if d.status == "acquired")
    return DatasetList(datasets=items, acquired_count=acquired, total_count=len(items))
