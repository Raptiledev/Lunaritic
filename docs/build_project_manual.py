"""Generate LUNARIS project documentation + user manual as a Word (.docx) file."""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

OUT = Path(__file__).resolve().parent / "LUNARIS_Project_Documentation_and_User_Manual.docx"


def set_run(run, *, bold=False, size=11, color=None):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = "Calibri"
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), "Calibri")
    if color:
        run.font.color.rgb = RGBColor(*color)


def h(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    return p


def p(doc, text, *, bold=False, size=11):
    para = doc.add_paragraph()
    run = para.add_run(text)
    set_run(run, bold=bold, size=size)
    para.paragraph_format.space_after = Pt(8)
    return para


def bullets(doc, items):
    for item in items:
        para = doc.add_paragraph(item, style="List Bullet")
        para.paragraph_format.space_after = Pt(3)


def numbered(doc, items):
    for item in items:
        para = doc.add_paragraph(item, style="List Number")
        para.paragraph_format.space_after = Pt(3)


def build() -> Path:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.9)
    section.bottom_margin = Inches(0.9)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

    # Title
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = title.add_run("LUNARIS")
    set_run(r, bold=True, size=28, color=(30, 30, 30))

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run("Lunar Navigation, Illumination, and Risk Intelligence System")
    set_run(r, bold=True, size=14)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = meta.add_run(
        "Team Alpha 8  ·  NASA Space Apps Challenge 2026\n"
        "Challenge: Lunar Landing Site Navigator\n"
        "Project Documentation, Achievements & User Manual"
    )
    set_run(r, size=11)

    note = doc.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = note.add_run("Not an official NASA tool or certification. Geometry-only analysis.")
    set_run(r, size=10, color=(90, 90, 90))

    doc.add_paragraph()

    # TOC-like overview
    h(doc, "1. Document purpose", 1)
    p(doc,
      "This document explains what the LUNARIS web application is, what the team built across the whole project, "
      "how to run the system, how to use every feature, and what each screen and number represents. "
      "It is written for judges, teammates, and new users.")

    h(doc, "2. What LUNARIS is", 1)
    p(doc,
      "LUNARIS helps assess candidate lunar south-pole landing sites using real NASA terrain and geometry. "
      "For a chosen target and mission window it estimates sunlight and Earth-in-view geometry over terrain, "
      "terrain hazard context, date-slip options, explainable scores, validation against JPL Horizons, "
      "and presentation tools (3D globe, timeline, printable report).")
    p(doc, "Core design rule: scientific honesty over polish. The app does not invent NASA results. "
           "Missing products show “Not computed” or “not acquired”.")

    h(doc, "3. What we achieved (project outcomes)", 1)
    bullets(doc, [
        "End-to-end web app: FastAPI science backend + Next.js 14 frontend.",
        "Real Site01 LOLA 5 m DEM loaded, verified CRS, slope/hazard layers, Explorer maps.",
        "Terrain horizon from DEM on a 1737.4 km lunar sphere (truncation flags when rays leave the tile).",
        "Sun/Earth ephemeris with NAIF SPICE (DE421, MOON_ME) and live JPL Horizons validation (~1e-5° sky agreement).",
        "Mission-window visibility: sunlight %, Earth-in-view %, longest darkness, periods, upper-bound honesty notes.",
        "Tile-wide mission maps at 100 m spacing (sunlight, darkness, Earth, both) plus top sunlit spots.",
        "Slip Planner: 120 landing dates + nearby alternatives that pass hard requirements.",
        "Explainable Compare scoring: hard gates + weighted soft scores (not a black-box AI score).",
        "Validation page: ephemeris agreement, LOLA uncertainty summary, pending-data honesty.",
        "3D: Full Moon globe (real WAC albedo + LDEM bump) and Site01 high-detail mesh.",
        "Animated Timeline from the real Analysis series; printable Mission Report (browser Print → PDF).",
        "Automated tests for core science paths; methodology and dataset registry pages.",
    ])

    h(doc, "4. Architecture overview", 1)
    p(doc, "Backend (Python / FastAPI)", bold=True)
    bullets(doc, [
        "Location: backend/",
        "API under /api (health, datasets, terrain, ephemeris, analysis, validation).",
        "Science services: DEM loader, terrain analysis, horizon, SPICE ephemeris, visibility, illumination maps, scoring, validation.",
        "Data: backend/app/data/dem (Site01 + global), kernels (SPICE), cache, validation fixtures.",
    ])
    p(doc, "Frontend (Next.js 14 App Router + Tailwind + Recharts + Three.js)", bold=True)
    bullets(doc, [
        "Location: frontend/",
        "Shared mission strip and analysis context so one “Run analysis” feeds Mission, Analysis, Timeline, Report.",
        "Pages: Mission, Explorer, 3D, Analysis, Slip Planner, Validation, Compare, Timeline, Report, Data & Method.",
    ])

    h(doc, "5. What we built — phase by phase", 1)

    phases = [
        ("Phase 1 — Foundation",
         "FastAPI health/datasets API, dataset registry, Next.js shell, mission form, Data & Methodology page."),
        ("Phase 2 — Terrain Explorer",
         "PGDA LOLA Site01 GeoTIFF loader (CRS checked), slope/aspect/hillshade/roughness/relief, hazard classes, "
         "point/area queries, PNG layers, Lunar Explorer UI."),
        ("Phase 3 — Terrain horizon",
         "Azimuth horizon profiles with observer height, sphere geometry, true-azimuth conversion, truncation flags, "
         "and disk-visibility helpers used later for Sun/Earth."),
        ("Phase 4 — SPICE ephemeris + UI redesign",
         "Topocentric Sun/Earth tracks in MOON_ME; Horizons validation fixture; Explorer horizon chart with Sun/Earth paths; "
         "mission strip; amber/blue meaning system."),
        ("Phase 5 — Visibility analysis",
         "Full mission-window sunlight and Earth-in-view fractions, longest darkness, event timing, periods; "
         "Analysis page + Mission indicators; upper-bound notes when horizon rays leave the DEM tile."),
        ("Phase 6 — Mission-window maps",
         "Precomputed 100 m horizon grid; tile maps for sun/dark/Earth/both; top sunlit spots; Explorer layers."),
        ("Phase 7 — Slip Planner",
         "120-day calendar from one long SPICE track; requirement filters; nearest favorable alternatives."),
        ("Phase 8 — Validation",
         "Live Horizons vs SPICE report, LOLA uncertainty summary, pending products listed honestly."),
        ("Phase 9 — Compare / explainable scoring",
         "Hard gates + weighted soft scores; Compare page; Mission Overall indicator."),
        ("Phase 10 — 3D, Timeline, Report",
         "Site01 3D mesh; Full Moon WAC/LDEM globe; animated Timeline; printable Report."),
        ("Global Moon data upgrade",
         "Downloaded LOLA LDEM_16/64 and USGS LROC WAC global mosaic; built browser 4k albedo + bump; "
         "Full Moon mode now looks like an Earth-style globe map while Site01 remains the high-res AOI."),
    ]
    for title, body in phases:
        h(doc, title, 2)
        p(doc, body)

    h(doc, "6. How to run the application", 1)
    h(doc, "6.1 Prerequisites", 2)
    bullets(doc, [
        "Windows PowerShell (documented path); Python 3.11+; Node.js 18.17+.",
        "Site01 LOLA GeoTIFFs in backend/app/data/dem/ (at least *_surf.tif).",
        "SPICE kernels in backend/app/data/kernels/ (see README list).",
        "Optional for Full Moon globe: global files already placed under backend/app/data/dem/global/ and assets built.",
    ])

    h(doc, "6.2 Backend", 2)
    p(doc, "On this project machine, clear PROJ_LIB/GDAL_DATA (PostGIS conflict) and use port 8001:")
    numbered(doc, [
        "cd backend",
        "python -m venv venv",
        ".\\venv\\Scripts\\Activate.ps1",
        "pip install -r requirements.txt",
        "$env:PROJ_LIB=$null; $env:GDAL_DATA=$null",
        "uvicorn app.main:app --reload --port 8001",
        "Optional tests: pytest -q app/tests",
    ])

    h(doc, "6.3 Frontend", 2)
    numbered(doc, [
        "Create frontend/.env.local with: NEXT_PUBLIC_API_URL=http://localhost:8001",
        "cd frontend",
        "npm install",
        "npm run dev",
        "Open http://localhost:3000",
    ])

    h(doc, "6.4 One-time science caches (optional but recommended)", 2)
    bullets(doc, [
        "Horizon grid for maps / Slip Planner alternatives: python -m scripts.build_horizon_grid --site site01 "
        "(~30–45 min once; writes app/data/cache/).",
        "Full Moon browser textures: python -m scripts.build_global_globe_assets "
        "(needs WAC mosaic + ldem_16 already in app/data/dem/global/).",
    ])

    h(doc, "7. User manual — page by page", 1)
    p(doc,
      "The top navigation opens each feature. A persistent mission strip shows the current mission name, "
      "target lat/lon, site id, and time window on every page.")

    # Mission
    h(doc, "7.1 Mission (Dashboard)", 2)
    p(doc, "Route: /dashboard", bold=True)
    p(doc, "Purpose: set the landing target and mission window, then run the main analysis.")
    p(doc, "How to use:")
    numbered(doc, [
        "Enter mission name, latitude, longitude (east-positive), UTC date/time, duration (days), observer height (m).",
        "Confirm the point is inside Site01 (or pick a point in Explorer → Set as mission target).",
        "Click Run analysis. Wait for visibility + score to finish.",
        "Read the four indicators: Sunlight, Direct-to-Earth, Terrain (favorable share nearby), Overall score.",
    ])
    p(doc, "What it represents:")
    bullets(doc, [
        "Sunlight / Earth indicators: geometry over the mission window (not electrical power; not a radio link).",
        "Terrain: share of Favorable 5 m pixels within ~100 m (illustrative slope/roughness thresholds).",
        "Overall: explainable weighted score; “fails X” means a hard gate failed even if the soft score looks high.",
        "≤ symbols mean upper-bound visibility when the DEM tile truncates the horizon.",
    ])

    # Explorer
    h(doc, "7.2 Explorer", 2)
    p(doc, "Route: /explorer", bold=True)
    p(doc, "Purpose: inspect the real Site01 LOLA tile and pick a target on the map.")
    p(doc, "How to use:")
    numbered(doc, [
        "Choose a layer: elevation, hillshade, slope, hazard, or Mission-window maps (after analysis/maps are available).",
        "Click the map to inspect a point (elevation, slope, hazard).",
        "Use Set as mission target to send coordinates to the mission strip.",
        "Optional: open the horizon chart with Sun/Earth paths for the selected point/time context.",
    ])
    p(doc, "What layers mean:")
    bullets(doc, [
        "Elevation / hillshade / slope: derived from NASA LOLA surface heights.",
        "Hazard: illustrative classes (Favorable / Caution / High risk / Insufficient data) from slope & roughness thresholds — not NASA certification.",
        "Mission-window layers: sunlight %, longest darkness, Earth-in-view %, Sun+Earth together for the chosen window across the tile.",
    ])

    # 3D
    h(doc, "7.3 3D terrain", 2)
    p(doc, "Route: /view3d", bold=True)
    p(doc, "Purpose: see geographic context (full Moon) and high-detail Site01 relief.")
    p(doc, "Modes:")
    bullets(doc, [
        "Full Moon: Earth-style globe using real LROC WAC photo mosaic + LOLA LDEM_16 bump; amber Site01 outline; optional AOI height patch; mission pin.",
        "Site01 tile: downsampled LOLA mesh (~100 m spacing), textured with live analysis layers, exaggerated vertically on purpose, lit from real Sun when ephemeris is available.",
    ])
    p(doc, "How to use:")
    numbered(doc, [
        "Open Full Moon to orient the south-pole AOI on the world; drag to orbit, scroll to zoom.",
        "Click Focus Site01 AOI to zoom to the science tile; adjust AOI relief slider.",
        "Switch to Site01 tile for the flat high-detail science mesh and layer textures.",
    ])
    p(doc, "Honesty: metre-scale science DEM is Site01 only. Global bump is ~1.9 km/px LDEM_16, not 5 m.")

    # Analysis
    h(doc, "7.4 Analysis", 2)
    p(doc, "Route: /analysis", bold=True)
    p(doc, "Purpose: detailed visibility results for the current mission after Run analysis.")
    p(doc, "What you see:")
    bullets(doc, [
        "Metric cards: sunlight fraction, Earth-in-view fraction, both, longest darkness / Earth gap, timing to next events.",
        "Visibility timeline bars across the mission window.",
        "Elevation-vs-horizon charts for Sun and Earth.",
        "Tables of visible/hidden periods.",
        "Notes: upper bounds, time-step resolution (~half step), geometry-only disclaimer.",
    ])

    # Planner
    h(doc, "7.5 Slip Planner", 2)
    p(doc, "Route: /planner", bold=True)
    p(doc, "Purpose: answer “What if the landing date moves?”")
    p(doc, "How to use:")
    numbered(doc, [
        "Set illustrative requirements (min sunlight %, max darkness hours, min Earth %, favorable ground %).",
        "Build/view the calendar of ~120 candidate landing dates coloured pass/fail.",
        "Read slip tolerance, next good date, and count of good dates.",
        "For a date, request alternatives: nearest 100 m cells within ~3 km that pass every gate.",
    ])
    p(doc, "What it represents: same visibility rules as Analysis, sliced across many start dates from one long SPICE track. "
           "Defaults are illustrative, not official NASA requirements.")

    # Validation
    h(doc, "7.6 Validation", 2)
    p(doc, "Route: /validation", bold=True)
    p(doc, "Purpose: show why the geometry can be trusted — and what is still missing.")
    bullets(doc, [
        "JPL Horizons vs LUNARIS SPICE: all checked epochs, max sky error, tolerance.",
        "LOLA confidence: returns fraction, height/slope uncertainty summaries from NASA layers when present.",
        "Pending: products not acquired (e.g. PGDA illumination maps, NASA Site01 slope GeoTIFF) listed openly.",
        "Method limits restated (tile truncation, geometry-only, cell size).",
    ])

    # Compare
    h(doc, "7.7 Compare", 2)
    p(doc, "Route: /comparison", bold=True)
    p(doc, "Purpose: rank up to six candidate points for the same mission window with transparent math.")
    p(doc, "How to use:")
    numbered(doc, [
        "Add candidates (lat/lon or from Explorer targets).",
        "Adjust weights for sunlight, darkness, Earth, terrain (normalised to 100%).",
        "Adjust hard requirements (gates).",
        "Run compare; read eligibility, overall score, factor scores, contributions (weight × score), gate pass/fail.",
    ])
    p(doc, "Important: a site can have a high overall soft score and still fail a gate (example: terrain Favorable 51% vs required 80%). "
           "Eligible sites pass every hard requirement; soft scores then rank among them.")

    # Timeline
    h(doc, "7.8 Timeline", 2)
    p(doc, "Route: /timeline", bold=True)
    p(doc, "Purpose: animate the Analysis time series so the Sun’s crawl along the horizon is visible.")
    p(doc, "How to use: Run analysis first → open Timeline → Play / Pause / scrub. "
           "Shows Sun & Earth height vs terrain horizon and a sky compass (amber Sun, blue Earth). "
           "Nothing is simulated for show — frames are the real Analysis steps.")

    # Report
    h(doc, "7.9 Report", 2)
    p(doc, "Route: /report", bold=True)
    p(doc, "Purpose: one-page printable summary for judges or teammates.")
    bullets(doc, [
        "Includes mission setup, visibility summary, explainable score table, validation snapshot.",
        "Click Print / Save PDF and use the browser Print dialog.",
        "Visibility/score fill only after Run analysis; validation loads independently.",
    ])

    # Methodology
    h(doc, "7.10 Data & Method", 2)
    p(doc, "Route: /methodology", bold=True)
    p(doc, "Purpose: dataset registry (acquired vs not acquired) and short method cards for every science step. "
           "Use this page when explaining honesty and limits.")

    h(doc, "8. Key metrics — what the numbers mean", 1)
    bullets(doc, [
        "Sunlight %: share of mission time with any of the solar disk above the local terrain horizon.",
        "Earth in view %: share of time Earth’s centre (disk rule as implemented) clears terrain.",
        "Both %: times when both conditions hold.",
        "Longest dark / longest Earth gap: longest continuous hidden interval (may be open-ended at window edges).",
        "Favorable % (terrain): fraction of 5 m pixels within ~100 m classed Favorable under illustrative thresholds (~5° / ~0.25 m).",
        "Overall score /100: 100 × sum(weight_i × score_i); not a mission success probability.",
        "Gate pass/fail: hard requirement check independent of the soft score.",
        "Horizons sky error: angular difference between SPICE and JPL Horizons reference epochs.",
    ])

    h(doc, "9. Suggested demo order (presentation)", 1)
    numbered(doc, [
        "Mission: set Ridge / Site01 target and window → Run analysis.",
        "Explorer: show hazard / sunlight map layers.",
        "3D Full Moon → Focus Site01 → Site01 tile mesh.",
        "Analysis: cards, charts, periods.",
        "Timeline: Play.",
        "Slip Planner: calendar + alternatives.",
        "Compare: two points, show gate vs soft score.",
        "Validation: Horizons agreement + pending data.",
        "Report: Print to PDF.",
    ])

    h(doc, "10. Data sources", 1)
    bullets(doc, [
        "NASA PGDA LOLA 5 m Site01 GeoTIFFs (south-pole candidate site tile).",
        "NAIF SPICE kernels (DE421, lunar frames, LSK/PCK).",
        "JPL Horizons reference fixture for validation.",
        "LOLA GDR LDEM_16 / LDEM_64 global heights (PDS).",
        "USGS LROC WAC global morphology mosaic (100 m) for Full Moon albedo.",
    ])

    h(doc, "11. Honest limits (say these aloud)", 1)
    bullets(doc, [
        "Not an official NASA tool or landing certification.",
        "Sunlight is not electrical power; Earth in view is not a guaranteed radio link.",
        "Site01 tile ends ~8–16 km away: distant terrain missing → sunlight/Earth figures are upper bounds when rays truncate.",
        "Hazard thresholds and scoring defaults are illustrative, not NASA requirements.",
        "Global WAC/LDEM_16 support geography and context; science-grade 5 m work remains Site01.",
        "Pending products (e.g. PGDA illumination cross-check) are marked not acquired — never fabricated.",
    ])

    h(doc, "12. Project folder map (for developers)", 1)
    bullets(doc, [
        "backend/app/api/routes — HTTP endpoints",
        "backend/app/services — science logic",
        "backend/app/data/dem — Site01 DEM; dem/global — global LDEM + WAC",
        "backend/app/data/cache — horizon grids, globe textures",
        "backend/app/data/kernels — SPICE",
        "backend/scripts — DEM inspect, horizon grid, globe asset build, Horizons fetch",
        "frontend/app — pages",
        "frontend/components — Explorer, 3D, planner, charts, UI",
        "frontend/context — mission + analysis state",
    ])

    h(doc, "13. Closing summary", 1)
    p(doc,
      "LUNARIS is a working lunar landing-site navigator for the NASA Space Apps Challenge: "
      "real LOLA terrain, real SPICE geometry, validated ephemeris, mission maps, slip planning, "
      "explainable scoring, validation honesty, and presentation tools (3D globe, timeline, printable report). "
      "The achievement is not a black-box “AI score”, but a transparent geometry workflow a judge can follow "
      "from DEM pixel to printable PDF.")

    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = footer.add_run("\n— End of document —\nTeam Alpha 8 · LUNARIS · NASA Space Apps Challenge 2026")
    set_run(r, size=10, color=(100, 100, 100))

    doc.save(OUT)
    return OUT


if __name__ == "__main__":
    path = build()
    print(path)
