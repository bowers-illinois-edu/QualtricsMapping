# HANDOFF.md

Detailed handoff for continuing QualtricsMapping development.

## What This Project Does

Embeds interactive Google Maps into Qualtrics surveys so respondents can draw
polygons on a map (e.g., "their community"). Researchers can randomly assign
map treatments (overlays, zoom, map type) and measure effects on survey
responses. Supports multi-country, multi-language deployment on phones.

## Key Decisions Made

1. **Modular architecture**: Replaced the original monolithic copy-paste scripts
   with 9 testable JavaScript modules in `src/`, bundled into
   `dist/qualtrics-mapping.js` for browser use.

2. **Randomization**: Seeded PRNG (xorshift32) using Qualtrics ResponseID
   (hashed via djb2). Researchers can override with a custom embedded data
   field. All randomized assignments are stored as JSON in embedded data for
   analysis.

3. **Overlay workflow**: Researchers prepare GeoJSON in R/Python, host it or
   embed it. Survey JS does client-side point-in-polygon (ray casting) to find
   which boundary contains the respondent's geocoded address, then displays it
   as a translucent shaded overlay.

4. **Data format**: Polygon coordinates stored as
   `"lon lat,lon lat;lon lat,lon lat"` in WGS84 (EPSG:4326). R and Python
   helper code parses this into sf/geopandas objects.

5. **Qualtrics API**: Must use `setJSEmbeddedData` / `getJSEmbeddedData` (NOT
   the deprecated `setEmbeddedData` / `getEmbeddedData`). Must use `addOnReady`
   (NOT `addOnload`). Piped text (`${e://Field/...}`) does NOT work for data
   set via JavaScript -- must use `getJSEmbeddedData` on consuming pages.

6. **Script loading**: The Qualtrics Look & Feel header editor (CKEditor)
   strips `<script>` tags. Instead, each question's JavaScript dynamically
   loads Google Maps API and the bundle via `document.createElement("script")`.

7. **Python tooling**: Recommend `uv` as primary, `pip` as fallback.

8. **Future page structure**: Q1 (geocode) + Q2 (drawing) on the same page.
   Q3 (review map) reusable as a stimulus on subsequent pages alongside
   slider questions (e.g., "what proportion of this area is X?").

## Files Changed and Why

### New files (all created in this session)

**JavaScript source modules (`src/`)**:
- `coordinates.js` -- serialize/deserialize polygon strings, GeoJSON export
- `randomization.js` -- seeded PRNG, hash seed, build assignments
- `i18n.js` -- English/Spanish labels, Maps API URL builder
- `layout.js` -- mobile canvas/button sizing, gesture options
- `geocode.js` -- Google Maps geocoder wrapper with country restriction
- `overlays.js` -- GeoJSON display, traffic layer, point-in-polygon, condition assignment
- `drawing.js` -- map creation, polygon management, buttons
- `display.js` -- read-only review map
- `qualtrics-integration.js` -- store results in Qualtrics embedded data

**Qualtrics wiring (`qualtrics/`)**:
- `header.html` -- Look & Feel header (NOT currently working due to CKEditor stripping scripts)
- `geocode-question.js` -- Q1 JavaScript (latest version uses addOnReady + setJSEmbeddedData)
- `drawing-question.js` -- Q2 JavaScript (latest version uses getJSEmbeddedData for lat/lon)
- `display-question.js` -- Q3 JavaScript (latest version uses getJSEmbeddedData for MapDrawing)

**Analysis code**:
- `R/parse_map_data.R` -- parse Qualtrics CSV to sf, merge with survey responses, spatial descriptives, visualization
- `R/overlay_setup.R` -- convert sf boundaries to GeoJSON, point-in-polygon lookup
- `python/parse_map_data.py` -- same pipeline in geopandas/shapely

**Tests**:
- `tests/*.test.js` -- 87 JavaScript tests (all passing)
- `tests/R/*.R` -- 49 R tests (all passing)
- `tests/python/*.py` -- 15 Python tests (need geopandas installed to run)
- `tests/mocks/` -- Google Maps and Qualtrics API mocks for Jest

**Build/config**:
- `build.js` -- concatenates src/ modules into dist/qualtrics-mapping.js
- `jest.config.js`, `package.json`, `.gitignore`
- `CLAUDE.md`, `CLAUDE_CODING.md`

### Bundle
- `dist/qualtrics-mapping.js` -- 29KB bundle, live on GitHub Pages at
  `https://bowers-illinois-edu.github.io/QualtricsMapping/dist/qualtrics-mapping.js`

## Current Blockers

### BLOCKER 1: Q3 JavaScript not executing in live survey

**Status**: Q1 (geocode) and Q2 (drawing) work correctly in the published
survey. Q2 successfully saves MapDrawing via `setJSEmbeddedData` (confirmed
via console log: "QM Q2: saved MapDrawing (150 chars)"). But Q3's JavaScript
does not appear to execute at all -- no console messages, no errors, no map.

**Confirmed**: Q3's JavaScript IS present and correct in the editor. The Q3
page renders a world map (so code partially runs). And
`Qualtrics.SurveyEngine.getJSEmbeddedData("MapDrawing")` typed manually in
the console on Q3's page DOES return the coordinate data. So the data is
there, the code is there, but the code isn't reading it successfully.

**Likely cause**: The dynamic script loading chain (check google -> check
QMDisplay -> call startDisplay) may be resolving before `getJSEmbeddedData`
is ready, or the `console.log` in startDisplay is not firing which suggests
`startDisplay` itself may not be called. The script loading may be hitting
the "google exists, QMDisplay exists" fast path and calling startDisplay
synchronously before the Qualtrics API is fully initialized.

**Fix to try**: Add a small delay or use `setTimeout(startDisplay, 100)` to
let the Qualtrics API initialize. Or call `getJSEmbeddedData` inside a try/catch
with console logging to see if it throws. Or use `addOnload` instead of
`addOnReady` for Q3 specifically.

**Test survey**: Published at `https://illinois.qualtrics.com/jfe/form/SV_cFIH1gSZT0cBgTI`
Survey editor: `https://illinois.qualtrics.com/survey-builder/SV_cFIH1gSZT0cBgTI/edit`

### BLOCKER 2: Google Maps Drawing library deprecated

The Drawing library (`google.maps.drawing.DrawingManager`) was deprecated
August 2025 and will be **removed May 2026** (next month). Need to migrate to
an alternative. Best option is likely **Leaflet + Leaflet.draw** -- open
source, no API key needed, good mobile support. This would also eliminate the
Google Maps API key dependency.

See: https://developers.google.com/maps/deprecations

## Important Context

### Qualtrics "New Survey Taking Experience" gotchas

These were discovered through extensive debugging:

1. **`setEmbeddedData` / `getEmbeddedData` are deprecated** -- use
   `setJSEmbeddedData` / `getJSEmbeddedData` instead. The old methods
   silently fail or show deprecation warnings.

2. **Piped text does NOT work for JS-set embedded data** -- `${e://Field/lat}`
   will be empty even if `setJSEmbeddedData("lat", value)` was called on a
   previous page. Must use `getJSEmbeddedData("lat")` in JavaScript on the
   consuming page.

3. **Preview mode destroys iframes between pages** -- sessionStorage,
   localStorage, window.name, window.parent all get wiped between page
   transitions in preview. Only the published survey works for cross-page
   data. This is why we stopped debugging in preview and published.

4. **CKEditor strips script tags** -- The Look & Feel header editor sanitizes
   HTML and removes `<script>` tags. Workaround: dynamically load scripts in
   each question's JavaScript.

5. **`getTextValue()` unreliable** -- Does not work for multi-line text entry
   in the new experience. Read from DOM directly via
   `container.querySelector("textarea").value`.

6. **`addOnReady` preferred over `addOnload`** -- More reliable DOM timing in
   the new experience.

7. **No Prototype.js** -- The new experience removed Prototype.js. Use native
   DOM methods only.

### User's Google Maps API Key

The key `AIzaSyCxNx_ZDUNgGvulyGc-t-NBezkSc_4KgEo` is pasted directly into
the Qualtrics question JavaScript (NOT in any repo files). The
`qualtrics/*.js` files in the repo use the placeholder `YOURGOOGLEMAPKEY`.

### Survey structure in Qualtrics

- Survey Flow: Embedded Data (lat, lon, MapDrawing, zoom, MapAssignments,
  overlayCondition) BEFORE the question block
- Q1: Text Entry ("Please enter your address or postal code or intersection")
  -- with geocode JavaScript
- Page Break
- Q2: Text/Graphic ("Please draw your community on the map below") -- with
  drawing JavaScript
- Page Break
- Q3: Text/Graphic ("Please review your drawing below") -- with display
  JavaScript

### Remotes

- `origin` = `git@github.com:cwong-lab/QualtricsMapping.git` (no push access)
- `upstream` = `git@github.com:bowers-illinois-edu/QualtricsMapping.git`
  (push access, GitHub Pages serves from here)

## What's Done vs. What Remains

### Done
- [x] 9 JavaScript source modules with full test coverage (87 tests passing)
- [x] R analysis code with tests (49 tests passing)
- [x] Python analysis code with tests (need geopandas to run)
- [x] Bundle built and deployed to GitHub Pages
- [x] Q1 geocoding works in published survey (address found, lat/lon saved)
- [x] Q2 map drawing works in published survey (map shows, drawing works,
      coordinates saved via setJSEmbeddedData)
- [x] Qualtrics survey configured with embedded data fields and page breaks

### Remaining
- [ ] **Fix Q3 display** -- data IS available via getJSEmbeddedData on Q3 page
      (confirmed manually in console). Code runs partially (world map renders).
      Need to debug why startDisplay() doesn't read the data. Likely a timing
      issue with the script loading fast path.
- [ ] **Q3 should match Q2's view** -- show same center and zoom as Q2, not
      just fit-to-bounds. Q2 already stores zoom via setJSEmbeddedData. Also
      need to store the center. The review map should look like what the
      respondent saw, with their polygon(s) overlaid.
- [ ] **Migrate from Google Maps Drawing to Leaflet** -- Drawing library
      removed May 2026
- [ ] **Polygon validation** -- prevent degenerate polygons (straight lines
      with < 3 distinct vertices)
- [ ] **Redesign page structure** -- combine Q1+Q2 on same page (geocode then
      draw inline), make Q3 review map reusable across multiple question pages
- [ ] **Overlay integration** -- test with actual census tract / ward boundary
      GeoJSON
- [ ] **Commit updated qualtrics/ files** -- the files on disk reflect the
      latest API changes (setJSEmbeddedData, addOnReady) but haven't been
      committed yet
- [ ] **Update src/qualtrics-integration.js** -- still uses old
      setEmbeddedData API; needs to use setJSEmbeddedData
- [ ] **Mobile testing** -- test on actual phones
- [ ] **Multi-language testing** -- test Spanish labels, Chile geocoding
- [ ] **End-to-end data export test** -- complete survey, download CSV from
      Qualtrics, parse in R/Python, verify spatial analysis works
