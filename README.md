# Ignis Track — Harmonization of MODIS and VIIRS Hot Spots

**NASA Space Apps Challenge 2026** &middot; **PRD v2.0**

Ignis Track is an authentic scientific web platform designed for emergency responders, land managers, and environmental scientists to harmonize, analyze, and visualize over two decades of satellite active-fire observations from NASA's MODIS (Terra/Aqua, 1 km) and VIIRS (Suomi-NPP/NOAA-20/NOAA-21, 375 m) sensor families.

---

## Key Features & Architecture

### 1. Scientific Thermal Palette & Design
- Grounded in cartography and thermal imaging rather than generic SaaS styles.
- **Background Slate:** `#111110` (warm charcoal, zero blue/purple tint).
- **Surface Panels:** `#1A1A18` solid opaque cards with crisp `1px solid #2C2C2A` borders.
- **Scientific Thermal Scale:**
  - Low Intensity: `#FACC15` (Warm Yellow)
  - Medium Intensity: `#F97316` (Vibrant Orange)
  - High Intensity: `#DC2626` (Deep Red)
- **Typography:** *IBM Plex Sans* for technical data tables and numbers, *Outfit* for clean display headings.

### 2. Multi-Sensor Disparity & Harmonization Engine
- **The Core Problem:** 1 VIIRS pixel (375 m) covers only ~14 ha, compared to 1 MODIS pixel (1 km) covering ~100 ha (~7x spatial area). VIIRS breaks a single wildfire into 2.5x–3.8x more detection cells.
- **Harmonization Scale:**
  - Common 0.01° (~1.1 km) shared spatial grid.
  - Primary metric: **Fire-Cell-Days** (`active_cells`).
  - Overlap ratio calibration ($k_{\text{month}} = \text{median}(\text{VIIRS} / \text{MODIS})$) during the 2012–2024 multi-sensor era.
  - Unified series on a single **MODIS-equivalent scale**.

### 3. The Burning Activity Calendar Heatmap
- High-density horizontal multi-year heatmap covering 2004–2024.
- Thermal intensity color ramp from `#141413` up to `#DC2626`.
- **Orbital Gaps vs. Zero Fires:** Explicit diagonal striped hatch pattern for `missing_data` (satellite blind spots) vs dark charcoal for `no_detection` (0 fires).
- Anomaly borders for elevated and unusual statistical fire spikes.
- **Interactive Isolation:** Clicking any day cell immediately filters the geospatial map and reveals isolated fire detections for that single date with a reset button.

### 4. Geospatial Hotspot Map
- Cartographic dark canvas using ESRI World Dark Gray basemap.
- Hotspots colored by sensor origin (MODIS Cyan vs VIIRS Green) and radiative intensity (High FRP in Red).
- Interactive scientific popup displaying:
  - Instrument & Satellite platform (Terra, Aqua, Suomi-NPP, NOAA-20)
  - Acquisition Date & UTC Time
  - Geographic Coordinates (Lat/Lon)
  - Fire Radiative Power (MW)
  - Brightness Temperature (K)
  - Standardized Confidence class (`low`, `nominal`, `high`)
  - Day/Night flag and pixel footprint

### 5. Multi-Sensor Time-Series Trajectory
- Multi-curve trajectory comparing raw MODIS, raw VIIRS, and the Harmonized MODIS-equivalent series.
- Day, Month, and Year temporal aggregation toggles.

### 6. Robust Z-Score Anomaly Detection
- Computed against seasonal baselines (same calendar month across 5+ prior observation years).
- Formula: $Z = (x - \text{median}) / (1.4826 \times \text{MAD})$
- Labels: `normal` (< 1.5), `elevated` (1.5 – 3.0), `unusual` (> 3.0).

---

## Running the Application

### Start the Server
```bash
# Navigate to the project directory
cd ignis-track

# Start the application server
npm start
# or: node server.js
```

### Open in Browser
Visit **`http://127.0.0.1:8080`** in any browser.
Start the server
