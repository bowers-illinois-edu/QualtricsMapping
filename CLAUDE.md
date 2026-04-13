# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Instructions

Follow `CLAUDE_CODING.md` in this repo. Key points that apply here:

- **Read broadly before acting.** Understand the surrounding code and the *point* of the code before making changes. When in doubt about purpose, ask.
- **Boring code over clever code.** Prioritize readability and maintainability.
- **Comment why, not what.**
- **Write tests before implementation** that verify the substantive point of the code, not just that it runs. Do not remove failing tests -- fix the source or ask for clarification.
- **Pause for review** at checkpoints: (1) after writing tests, before implementation; (2) after implementation, before final checks; (3) whenever a design decision arises that the plan does not resolve.
- **File organization:** One file per coherent unit, ~300 lines max. Split when a function serves a different purpose or abstraction layer.

## Project Purpose

Embed interactive maps into Qualtrics surveys for experimental research. Respondents can draw polygons on a map (e.g., "their community"), and researchers can randomly assign map treatments (overlays, zoom, map type) and measure effects on survey responses. The tool supports multi-country, multi-language deployment on diverse devices including phones.

## Architecture

### Source modules (`src/`)

Platform-agnostic JavaScript modules, each using the UMD pattern (work as CommonJS in Node for testing and as browser globals in Qualtrics):

- **`coordinates.js`** -- Serialize/deserialize polygon coordinate strings, GeoJSON export, CRS metadata
- **`drawing.js`** -- Create interactive Google Map, polygon drawing/deletion/reset, button controls
- **`display.js`** -- Read-only review map showing previously drawn polygons
- **`overlays.js`** -- GeoJSON boundary display, Google Maps layers (traffic), point-in-polygon lookup (ray casting), randomized condition assignment
- **`randomization.js`** -- Seeded PRNG (xorshift32), random int/choice, center offset, hash seed from ResponseID, experimental design records
- **`geocode.js`** -- Geocode addresses with country restriction
- **`i18n.js`** -- UI label translations (English, Spanish, custom overrides), Maps API locale URL builder
- **`layout.js`** -- Mobile-friendly canvas/button sizing (44px touch targets), scroll/gesture options
- **`qualtrics-integration.js`** -- Store results in Qualtrics embedded data, parse piped text values

### Analysis code

- **`R/parse_map_data.R`** -- Parse coordinate strings to sf objects, merge with survey responses, spatial descriptives, visualization
- **`R/overlay_setup.R`** -- Convert sf boundary data to GeoJSON for the survey, point-in-polygon lookup
- **`python/parse_map_data.py`** -- Same analysis pipeline in Python (geopandas/shapely)

### Legacy files (original implementation)

- **`lookfeelheader.html`**, **`geocode.js`** (root), **`mapinquestion.js`**, **`showmap.js`** -- Original monolithic scripts that were copy-pasted into Qualtrics. The `src/` modules replace these.

### Data flow

```
geocode  -->  sets embedded data: lat, lon
                     |
drawing  -->  reads lat, lon; uses randomization for zoom/mapType/overlay
             |  stores MapDrawing, zoom, MapAssignments, overlayCondition
                     |
display  -->  reads MapDrawing; shows polygons on static review map
                     |
Qualtrics CSV export  -->  R or Python analysis code
```

### Polygon coordinate format

`"lon lat,lon lat,lon lat;lon lat,lon lat,lon lat"` -- commas between vertices, semicolons between polygons. **Longitude first, latitude second.** CRS is WGS84 (EPSG:4326).

### Key conventions

- All `src/` modules use UMD pattern: `(function(exports) { ... })(typeof module !== "undefined" ? module.exports : (this.GlobalName = {}));`
- Qualtrics API entry point: `Qualtrics.SurveyEngine.addOnload(function() { ... })`
- Embedded data read via piped text `"${e://Field/fieldname}"`, written via `Qualtrics.SurveyEngine.setEmbeddedData("key", value)`
- Randomization seeds default to Qualtrics ResponseID (`"${e://Field/ResponseID}"`), hashed to integer via djb2. Researchers can use a custom embedded data field instead.

## Running Tests

```bash
# JavaScript (87 tests)
npm test

# R (run from project root)
Rscript -e 'testthat::test_file("tests/R/test-parse-map-data.R")'
Rscript -e 'testthat::test_file("tests/R/test-overlay-setup.R")'

# Python (requires: uv add geopandas shapely matplotlib pytest)
python -m pytest tests/python/ -v
```

## Dependencies

- **Google Maps JavaScript API v3** with `drawing` library -- requires API key
- **Node.js + Jest** -- for running JavaScript tests (`npm install`)
- **R**: sf, jsonlite, ggplot2, testthat
- **Python** (optional): geopandas, shapely, matplotlib, pytest

## License

GNU General Public License v3.
