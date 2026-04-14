# HANDOFF.md

Detailed handoff for continuing QualtricsMapping development.

## What This Project Does

Embeds interactive maps into Qualtrics surveys so respondents can draw
polygons on a map (e.g., "their community"). Researchers can randomly assign
map treatments (overlays, zoom, map type) and measure effects on survey
responses. Supports multi-country, multi-language deployment on phones.

## Key Decisions Made (This Session)

### 1. Terra Draw replaces Google Maps DrawingManager

The Google Maps Drawing library was deprecated August 2025 and removed
May 2026. Google's own documentation recommends Terra Draw as the
replacement. Terra Draw is map-engine agnostic (works with Google Maps,
Leaflet, MapLibre via adapters), has built-in touch support, ships as a
UMD bundle on CDN (jsdelivr), and is MIT licensed.

We kept Google Maps as the base map (Phase 1). A future Phase 2 could
switch to Leaflet to eliminate the API key dependency entirely -- Terra
Draw's adapter pattern means the drawing code stays identical.

**Delete UX changed:** The old DrawingManager approach used a
click-polygon-then-InfoWindow-popup to confirm deletion. The new approach
uses Terra Draw's select mode plus a dedicated Delete button. This is
cleaner on mobile (no popup, bigger touch targets).

**Button set changed:** Draw / Stop / Delete / Reset / Done (was
Draw / Stop / Reset / Done). "Stop" switches to select mode; "Delete"
removes the selected polygon.

### 2. WKT replaces the custom coordinate string format

The old format was a custom string: `"lon lat,lon lat;lon lat,lon lat"`.
No GIS tool reads it natively. Every researcher needed custom R/Python
parsing code.

The new format is WKT (Well-Known Text), the standard for geometry in
tabular data:
- Single polygon: `POLYGON((-88.24 40.12, -88.23 40.11, -88.22 40.12, -88.24 40.12))`
- Multiple polygons: `MULTIPOLYGON(((-88 40, ...)), ((-87 41, ...)))`
- Empty: `""` (empty string)

WKT is parseable with one line in any GIS tool:
- R: `sf::st_as_sfc(wkt_string, crs = 4326)`
- Python: `shapely.wkt.loads(wkt_string)`
- QGIS, PostGIS, etc.: native support

No custom parser needed. A collaborator receiving the Qualtrics CSV can
immediately work with the geometry column.

### 3. R and Python analysis code simplified

Both `R/parse_map_data.R` and `python/parse_map_data.py` were rewritten
to use native WKT parsing instead of custom string-splitting code. The
`parse_coordinate_string` functions now delegate to `st_as_sfc()` and
`wkt.loads()` respectively. The helper functions for merging with survey
data, computing spatial descriptives, and plotting are unchanged.

### 4. i18n labels updated

The `deleteConfirm` / `deleteYes` / `deleteNo` labels (for the old
InfoWindow popup) were replaced with a single `delete` label (English:
"Delete", Spanish: "Eliminar").

The Maps API URL builder no longer includes `libraries=drawing`.

### 5. Prior decisions preserved

These decisions from earlier sessions remain in effect:
- Seeded PRNG (xorshift32) using ResponseID hashed via djb2
- Overlay workflow: GeoJSON boundaries, client-side point-in-polygon
- Qualtrics API: `setJSEmbeddedData` / `getJSEmbeddedData` / `addOnReady`
- UMD module pattern for all src/ modules
- Dynamic script loading in question JS (CKEditor strips script tags)

## Files Changed and Why

### Source modules (`src/`)

- **`coordinates.js`** -- Complete rewrite. Serialization now produces WKT
  (POLYGON/MULTIPOLYGON). Added `serializeGeoJSONPolygons()` for Terra Draw
  output. WKT parser replaces the old custom-format deserializer. `toGeoJSON()`
  now takes WKT input. Helper functions `formatWKTRing`, `parseWKTCoords`,
  `stripClosingVertex` are internal.

- **`drawing.js`** -- Complete rewrite. Replaced `DrawingManager` with
  Terra Draw (`TerraDrawGoogleMapsAdapter` + `TerraDrawPolygonMode` +
  `TerraDrawSelectMode`). New API: `createMapCanvas` (returns `{map, draw,
  canvas, zoom}`), `startDrawing`, `stopDrawing`, `deleteSelected`,
  `resetDrawing`, `getFeatures`, `collectResult`, `createButtons`. Old
  `addPolygon`/`removePolygon`/`resetPolygons` removed -- Terra Draw
  manages its own feature store.

- **`i18n.js`** -- Removed `libraries=drawing` from Maps API URL builder.
  Replaced `deleteConfirm`/`deleteYes`/`deleteNo` labels with `delete` label.

- **`display.js`** -- UNCHANGED. Uses core Google Maps only (no Drawing lib).

- **`overlays.js`** -- UNCHANGED. Uses Google Maps Data layer + pure JS
  ray casting.

- **`geocode.js`** -- UNCHANGED.

- **`randomization.js`** -- UNCHANGED.

- **`layout.js`** -- UNCHANGED.

- **`qualtrics-integration.js`** -- UNCHANGED (still uses old
  `setEmbeddedData` -- see Remaining section).

### Qualtrics wiring (`qualtrics/`)

- **`drawing-question.js`** -- Rewired for Terra Draw. Loads Terra Draw
  from CDN (`cdn.jsdelivr.net/npm/terra-draw/dist/terra-draw.umd.js`).
  Script loading chain: Google Maps (no drawing lib) -> Terra Draw ->
  bundle. Five buttons (Draw/Stop/Delete/Reset/Done) with show/hide logic.
  Delete button appears only in select mode.

- **`display-question.js`** -- Removed `&libraries=drawing` from Maps URL.
  Otherwise unchanged.

- **`geocode-question.js`** -- UNCHANGED.

### Analysis code

- **`R/parse_map_data.R`** -- `parse_coordinate_string()` now uses
  `st_as_sfc(wkt, crs = 4326)` instead of manual string parsing.
  MULTIPOLYGON handled via `st_cast`. All other functions unchanged.

- **`python/parse_map_data.py`** -- `parse_coordinate_string()` now uses
  `shapely.wkt.loads()`. MultiPolygon decomposed via `.geoms`. All other
  functions unchanged.

- **`R/overlay_setup.R`** -- UNCHANGED.

### Tests

- **`tests/mocks/terra-draw.js`** -- NEW. Mock for Terra Draw API:
  `MockTerraDraw`, `MockGoogleMapsAdapter`, `MockPolygonMode`,
  `MockSelectMode`. Test helpers: `_simulatePolygonComplete(coords)`,
  `_simulateSelect(featureId)`.

- **`tests/coordinates.test.js`** -- Rewritten for WKT format.
  Tests: serialize POLYGON/MULTIPOLYGON, deserialize WKT, round-trips,
  GeoJSON export from WKT, serializeGeoJSONPolygons, precision, filtering.

- **`tests/map-drawing.test.js`** -- Rewritten for Terra Draw API.
  Tests: canvas creation, Terra Draw initialization, mode control,
  buttons (5 including Delete), polygon management via Terra Draw,
  WKT result collection, round-trips.

- **`tests/map-display.test.js`** -- Updated: input strings are now WKT.

- **`tests/data-export.test.js`** -- Rewritten: WKT format documentation
  tests, buildExportRecord with WKT input.

- **`tests/i18n.test.js`** -- Updated: `delete` label test, Maps URL
  must NOT contain `libraries=drawing`.

- **`tests/R/test-parse-map-data.R`** -- Rewritten: WKT fixture data,
  added test for native `st_as_sfc()` parsing.

- **`tests/python/test_parse_map_data.py`** -- Rewritten: WKT fixture
  data, added test for native `shapely.wkt.loads()` parsing.

- **All other test files** -- UNCHANGED.

### Build

- **`dist/qualtrics-mapping.js`** -- Rebuilt (34KB). Includes updated
  coordinates.js, drawing.js, i18n.js. Terra Draw is NOT bundled -- it
  loads from CDN separately.

## Current Test Results

```
JavaScript:  103 passed (10 suites)
R parsing:    34 passed
R overlays:   18 passed
Python:       needs pytest + geopandas installed to run
```

## Current Blockers

### BLOCKER: Q3 display JavaScript not executing in live survey

**Status unchanged from previous session.** Q1 (geocode) and Q2 (drawing)
work in the published survey. Q3's JavaScript does not appear to execute --
no console messages, no errors, but a world map renders (so code partially
runs).

`Qualtrics.SurveyEngine.getJSEmbeddedData("MapDrawing")` typed manually
in the console on Q3's page returns the WKT data. So the data is there,
the code is there, but the code is not reading it successfully.

**Likely cause:** The dynamic script loading chain resolves before
`getJSEmbeddedData` is ready. The "google exists, QMDisplay exists" fast
path may call `startDisplay` synchronously before the Qualtrics API is
fully initialized.

**Fix to try:** Add `setTimeout(startDisplay, 100)` or wrap in a
try/catch with console logging to see if `getJSEmbeddedData` throws.

**Test survey:**
- Published: `https://illinois.qualtrics.com/jfe/form/SV_cFIH1gSZT0cBgTI`
- Editor: `https://illinois.qualtrics.com/survey-builder/SV_cFIH1gSZT0cBgTI/edit`

## Important Context

### Terra Draw CDN loading

Terra Draw is loaded from:
`https://cdn.jsdelivr.net/npm/terra-draw/dist/terra-draw.umd.js`

This creates global constructors: `TerraDraw`,
`TerraDrawGoogleMapsAdapter`, `TerraDrawPolygonMode`,
`TerraDrawSelectMode`, etc.

The `drawing-question.js` script loading chain is:
1. Google Maps JS API (core only, no `libraries=drawing`)
2. Terra Draw UMD bundle
3. QualtricsMapping bundle (`dist/qualtrics-mapping.js`)
4. Call `startDrawing()`

### WKT format details

- Single polygon: `POLYGON((lng1 lat1, lng2 lat2, lng3 lat3, lng1 lat1))`
- Multiple: `MULTIPOLYGON(((ring1)), ((ring2)))`
- Coordinate order: longitude first (x y), same as GeoJSON
- Rings are closed (first vertex repeated at end)
- CRS: WGS84 (EPSG:4326)
- Empty drawings produce empty string `""`

### drawing.js API surface

```javascript
createMapCanvas(container, opts)  // -> { map, draw, canvas, zoom }
startDrawing(ctx)                 // set Terra Draw to polygon mode
stopDrawing(ctx)                  // set Terra Draw to select mode
deleteSelected(ctx)               // remove selected polygon
resetDrawing(ctx)                 // clear all features
getFeatures(ctx)                  // -> GeoJSON polygon features array
collectResult(ctx)                // -> { coordinates: WKT, zoom: number }
createButtons(ctx, labels)        // -> { draw, stop, delete, reset, done }
```

### Qualtrics "New Survey Taking Experience" gotchas

These were discovered through earlier debugging and still apply:

1. `setEmbeddedData` / `getEmbeddedData` are deprecated -- use
   `setJSEmbeddedData` / `getJSEmbeddedData`.
2. Piped text does NOT work for JS-set embedded data -- must use
   `getJSEmbeddedData` on the consuming page.
3. Preview mode destroys iframes between pages -- only published
   survey works for cross-page data.
4. CKEditor strips script tags -- load scripts dynamically.
5. `getTextValue()` unreliable -- read from DOM directly.
6. `addOnReady` preferred over `addOnload`.
7. No Prototype.js -- use native DOM methods only.

### User's Google Maps API Key

The key `AIzaSyCxNx_ZDUNgGvulyGc-t-NBezkSc_4KgEo` is pasted directly
into the Qualtrics question JavaScript (NOT in any repo files). The
`qualtrics/*.js` files use the placeholder `YOURGOOGLEMAPKEY`.

### Remotes

- `origin` = `git@github.com:cwong-lab/QualtricsMapping.git` (no push access)
- `upstream` = `git@github.com:bowers-illinois-edu/QualtricsMapping.git`
  (push access, GitHub Pages serves from here)

## What's Done vs. What Remains

### Done

- [x] Terra Draw migration: drawing.js rewritten, tests passing (103 JS tests)
- [x] WKT coordinate format: coordinates.js, all serialization/deserialization
- [x] R analysis code simplified to use native WKT parsing (34 tests passing)
- [x] Python analysis code simplified to use native WKT parsing
- [x] R overlay code unchanged and passing (18 tests)
- [x] i18n updated: delete label, no drawing library in Maps URL
- [x] Qualtrics drawing-question.js rewired for Terra Draw + WKT
- [x] Qualtrics display-question.js: removed drawing library from Maps URL
- [x] Terra Draw mock for testing
- [x] Bundle rebuilt and ready for deployment
- [x] All data-export tests updated for WKT format
- [x] Q1 geocoding works in published survey
- [x] Q2 map drawing works in published survey (needs redeployment with
      new bundle for Terra Draw version)

### Remaining

- [ ] **Fix Q3 display** -- data IS available via getJSEmbeddedData on Q3
      page (confirmed manually). Code runs partially (world map renders).
      Need to debug timing issue with script loading fast path.
- [ ] **Q3 should match Q2's view** -- show same center and zoom as Q2,
      not just fit-to-bounds. Q2 stores zoom via setJSEmbeddedData. Also
      need to store center lat/lng. The review map should look like what
      the respondent saw.
- [ ] **Deploy updated bundle** -- push updated `dist/qualtrics-mapping.js`
      to GitHub Pages (upstream). Then update the live survey's Q2 JS to
      load Terra Draw from CDN.
- [ ] **Update src/qualtrics-integration.js** -- still uses old
      `setEmbeddedData` API; needs to use `setJSEmbeddedData`. The
      `qualtrics/drawing-question.js` calls `setJSEmbeddedData` directly
      (bypassing this module), so the live survey works, but the module
      should be updated for consistency.
- [ ] **Polygon validation** -- prevent degenerate polygons (straight
      lines with < 3 distinct vertices)
- [ ] **Redesign page structure** -- combine Q1+Q2 on same page (geocode
      then draw inline), make Q3 review map reusable across multiple
      question pages
- [ ] **Overlay integration** -- test with actual census tract / ward
      boundary GeoJSON
- [ ] **Mobile testing** -- test Terra Draw polygon drawing on actual phones
- [ ] **Multi-language testing** -- test Spanish labels, Chile geocoding
- [ ] **End-to-end data export test** -- complete survey, download CSV
      from Qualtrics, parse WKT in R/Python, verify spatial analysis works
- [ ] **Phase 2 (optional): Leaflet migration** -- swap Google Maps base
      map for Leaflet + free tiles. Terra Draw's adapter pattern means
      drawing code stays identical. Removes API key dependency.
- [ ] **Backward compatibility for existing data** -- if researchers have
      CSV exports with the old custom coordinate format, the R/Python
      parse functions no longer handle it. Could add format detection
      (if string starts with "POLYGON" -> WKT, else -> legacy) for a
      transition period.
