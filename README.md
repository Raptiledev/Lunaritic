🌕 LUNARITIC
Lunar Navigation, Illumination & Risk Intelligence System

NASA Space Apps Challenge 2026 | Team Alpha 8
Challenge: Lunar Landing Site Navigator

🚀 About the Project

LUNARITIC is an interactive lunar landing site analysis and mission planning platform designed to help evaluate potential landing locations on the Moon.

It combines lunar terrain data, sunlight calculations, earth visibility analysis, and mission planning tools to help users understand the environmental conditions and potential risks associated with different lunar landing sites.

Our mission is to turn complex lunar data into clear, understandable insights for future lunar exploration.

✨ Key Features
Lunar Terrain Explorer: Explore elevation, slope, aspect, roughness, hillshade, and terrain hazards.
Sunlight Analysis: Analyze sunlight availability, darkness duration, sunrise, and sunset.
Earth Visibility: Evaluate when Earth is visible from a selected lunar location.
Mission Window Analysis: Analyze illumination and Earth visibility throughout a mission.
Landing Site Comparison: Compare and rank up to six candidate locations using explainable scoring.
Landing Date Planner: Evaluate alternative landing dates and nearby suitable locations.
3D Lunar Visualization: Explore the Moon and Site01 terrain in interactive 3D.
Mission Timeline: Visualize Sun and Earth visibility throughout the mission.
Mission Reports: Generate printable mission summaries.
Scientific Validation: Compare astronomical calculations with JPL Horizons reference data.
🛰️ Data Sources

LUNARITIC uses scientific datasets and tools from:

NASA LOLA: Lunar elevation and terrain data.
NASA/USGS LROC WAC: Lunar surface imagery.
NAIF SPICE: Sun and Earth position calculations.
JPL Horizons: Astronomical validation.

Primary terrain data:
https://core2.gsfc.nasa.gov/PGDA/LOLA_5mpp/

SPICE kernels:
https://naif.jpl.nasa.gov/pub/naif/generic_kernels/

🛠️ Technology Stack
Component	Technologies
Frontend	Next.js, React, TypeScript
Styling	Tailwind CSS
Backend	Python, FastAPI
Scientific Computing	NumPy, Rasterio, GDAL, SPICE
Data	LOLA DEM, GeoTIFF, SPICE Kernels
⚙️ Getting Started
Prerequisites
Python 3.10+ (compatible with project dependencies)
Node.js 18.17+
npm
Backend
bash
cd backend
python -m venv venv


Activate the environment and install dependencies:

bash
pip install -r requirements.txt
On Windows PowerShell, if incompatible GDAL/PROJ environment variables are set:
powershell
$env:PROJ_LIB=$null
$env:GDAL_DATA=$null


Start the backend:

bash
uvicorn app.main:app --reload --port 8001

Frontend

Create frontend/.env.local:

env
NEXT_PUBLIC_API_URL=http://localhost:8001


Then run:

bash
cd frontend
npm install
npm run dev

Open the application at:

http://localhost:3000


🚧 Current Limitations & Future Scope
Current high-resolution terrain analysis focuses on Site01.
Multi-tile and broader regional DEM coverage are not yet implemented.
PGDA illumination-map cross-validation is pending.
Some global 3D terrain representations use reference imagery and elevation data rather than a complete high-resolution global DEM.

Future improvements include expanded lunar terrain coverage, additional scientific validation, and enhanced mission planning capabilities.

👥 Team

Team Alpha 8
NASA Space Apps Challenge 2026

📜 Disclaimer

LUNARITIC is an independent educational and research prototype developed for NASA Space Apps Challenge 2026. It is not an official NASA product or a certified operational landing site assessment system.

🌑 LUNARITIC

Explore the Moon. Understand the Terrain. Plan with Confidence.
