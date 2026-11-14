from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Service configuration, read from environment variables (prefix LUNARIS_)."""

    model_config = SettingsConfigDict(env_prefix="LUNARIS_", env_file=".env", extra="ignore")

    app_name: str = "LUNARIS API"
    version: str = "0.1.0"
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003"
    data_dir: Path = BASE_DIR / "data"
    spice_kernel_dir: Path | None = None   # defaults to data_dir/kernels
    # When true, missing DEM GeoTIFFs and SPICE kernels are downloaded from NASA/JPL into data_dir.
    remote_data: bool = True

    @property
    def dem_dir(self) -> Path:
        return self.data_dir / "dem"

    @property
    def kernel_dir(self) -> Path:
        return self.spice_kernel_dir or self.data_dir / "kernels"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
