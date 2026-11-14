# LUNARIS: Lunar Navigation, Illumination, and Risk Intelligence System

Team Alpha 8 · NASA Space Apps Challenge 2026 · "Lunar Landing Site Navigator".
Not an official NASA tool or certification.

## Status: Phase 2 (LOLA terrain engine)

Phase 2 adds: loader for the PGDA LOLA 5 m/px Site GeoTIFFs (CRS verified, grids cross-checked), slope/aspect/hillshade/roughness/relief,
configurable hazard classification, point and area queries, PNG layers, and the Lunar Explorer page.
Place the Site01 files in `backend/app/data/dem/` (surf is required; ldec, toterr, slperr, slp are optional).
`python scripts/inspect_dem.py` prints the real metadata of whatever is there.

Phase 1: FastAPI backend (`/api/health`, `/api/datasets`), dataset registry, Next.js dashboard shell with the six sections,
mission-configuration form (client-side validation only), and a Data and Methodology page driven by the registry.

Not implemented yet: horizon, Sun/Earth geometry, scoring, 3D, reports.
Pages and indicators for those show "Not computed" or "Not built yet" on purpose. No simulated results are displayed.

## Run

Backend (Python 3.11+):

    cd backend
    python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    cp .env.example .env
    uvicorn app.main:app --reload --port 8000
    pytest -q app/tests

Frontend (Node 18.17+):

    cd frontend
    cp .env.example .env.local
    npm install
    npm run dev          # http://localhost:3000
    npm run lint         # TypeScript check
    npm run build

## Layout

    backend/app/{api/routes,core,services,schemas,models,data,tests}
    frontend/{app,components,hooks,services,types,utils}
    docs/

Large data (DEMs, SPICE kernels) goes in `backend/app/data/{dem,kernels}` and is gitignored.
Dataset facts live in `backend/app/data/datasets.json`. Fields stay `null` until read from the real files.

## Next: Phase 3 (terrain horizon engine)
