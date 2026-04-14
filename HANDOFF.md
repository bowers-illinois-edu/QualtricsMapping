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
Leaflet, MapLibre via adapters), has built-in touch support, and is MIT
licensed.

We kept Google Maps as the base map (Phase 1). A future Phase 2 could
switch to Leaflet to eliminate the API key dependency -- Terra Draw's
adapter pattern means the drawing code stays identical.

**Delete UX changed:** Select mode + dedicated Delete button replaces
the old InfoWindow popup. Cleaner on mobile, bigger touch targets.

**Button set:** Draw / Stop / Delete / Reset. No Done button --
drawing data saves automatically when the respondent clicks the
standard Qualtrics "Next page" button (via `addOnPageSubmit`).

### 2. WKT replaces the custom coordinate string format

Old: `"lon lat,lon lat;lon lat,lon lat"` (custom, no tool reads natively).
New: WKT (`POLYGON((...))`, `MULTIPOLYGON((...), (...))`).

Parseable with one line in any GIS tool:
- R: `sf::st_as_sfc(wkt_string, crs = 4326)`
- Python: `shapely.wkt.loads(wkt_string)`
- QGIS, PostGIS: native support

R and Python analysis code simplified to use native WKT parsers. Both
also support the legacy format for backward compatibility with old data.

### 3. Single-page geocode + draw

Q1 (geocode) and Q2 (draw) merged into one page. Respondent types
address, clicks "Look up", map appears inline below, they draw, then
clicks the standard Qualtrics "Next page" button. `addOnPageSubmit`
saves drawing data as part of Qualtrics' own submission flow. No
cross-page embedded data transfer for lat/lon (passed directly in JS).
Simpler code, fewer failure modes, better mobile UX.

Q3 (review) remains on a separate page.

### 4. Terra Draw CDN details (learned the hard way)

The UMD bundles use **namespaced globals**, not bare constructors:
- Core: `https://unpkg.com/terra-draw/dist/terra-draw.umd.js`
  - Global: `window.terraDraw` (lowercase)
  - Constructors: `terraDraw.TerraDraw`, `terraDraw.TerraDrawPolygonMode`, etc.
- Google Maps adapter (separate package):
  `https://unpkg.com/terra-draw-google-maps-adapter/dist/terra-draw-google-maps-adapter.umd.js`
  - Global: `window.terraDrawGoogleMapsAdapter`
  - Constructor: `terraDrawGoogleMapsAdapter.TerraDrawGoogleMapsAdapter`

jsdelivr does NOT host the adapter package. Use **unpkg** for both.

`draw.start()` **must** be called after the Google Map fires its `idle`
event, not synchronously after `new google.maps.Map()`. The adapter
attaches listeners to internal DOM elements that don't exist until the
map renders.

### 5. Qualtrics embedded data timing

`setJSEmbeddedData()` called from a custom button handler needs time
to flush before `clickNextButton()`. The fix: use `addOnPageSubmit`
to save data as part of Qualtrics' own page submission flow (triggered
by the standard Next button). This eliminates the timing issue entirely.
For cases where `clickNextButton()` is called programmatically (e.g.,
the old two-page `drawing-question.js`), a 500ms `setTimeout` delay
is needed before the call.

### 6. Prior decisions preserved

- Seeded PRNG (xorshift32) using ResponseID hashed via djb2
- Overlay workflow: GeoJSON boundaries, client-side point-in-polygon
- Qualtrics API: `setJSEmbeddedData` / `getJSEmbeddedData` / `addOnReady`
- UMD module pattern for all src/ modules
- Dynamic script loading in question JS (CKEditor strips script tags)

## Files Changed and Why

### Source modules (`src/`)

- **`coordinates.js`** -- Serialization produces WKT. Added
  `serializeGeoJSONPolygons()` for Terra Draw output. WKT parser
  replaces old custom deserializer. `toGeoJSON()` takes WKT input.

- **`drawing.js`** -- Terra Draw replaces DrawingManager. Resolves
  constructors from namespaced globals (`terraDraw.TerraDraw`, etc.)
  with fallback to bare globals for test mocks. Defers `draw.start()`
  until map `idle` event. New API: `createMapCanvas`, `startDrawing`,
  `stopDrawing`, `deleteSelected`, `resetDrawing`, `getFeatures`,
  `collectResult`, `createButtons`.

- **`i18n.js`** -- Removed `libraries=drawing` from Maps API URL.
  `delete` label replaces `deleteConfirm`/`deleteYes`/`deleteNo`.

- **`qualtrics-integration.js`** -- Updated to use `setJSEmbeddedData`.

- **`display.js`**, **`overlays.js`**, **`geocode.js`**,
  **`randomization.js`**, **`layout.js`** -- UNCHANGED.

### Qualtrics wiring (`qualtrics/`)

- **`geocode-and-draw-question.js`** -- NEW. Combined single-page flow:
  address input + geocode + map + Terra Draw. No Done button -- uses
  `addOnPageSubmit` to save drawing data when the respondent clicks the
  standard Qualtrics Next button. No cross-page data transfer for lat/lon.

- **`drawing-question.js`** -- Updated for Terra Draw (kept for surveys
  using the old two-page layout).

- **`display-question.js`** -- Polls for embedded data up to 5 seconds
  (fixes timing bug). Verbose console logging for debugging.

- **`geocode-question.js`** -- UNCHANGED (kept for two-page layout).

### Analysis code

- **`R/parse_map_data.R`** -- Native WKT parsing via `st_as_sfc()`.
  Auto-detects and handles legacy format for backward compatibility.

- **`python/parse_map_data.py`** -- Native WKT parsing via
  `shapely.wkt.loads()`. Legacy format backward compatibility.

- **`R/overlay_setup.R`** -- UNCHANGED.

### Tests

- **`tests/mocks/terra-draw.js`** -- NEW. Mock TerraDraw API with test
  helpers `_simulatePolygonComplete()` and `_simulateSelect()`.

- **`tests/mocks/google-maps.js`** -- `addListenerOnce` fires callback
  synchronously (simulates map `idle` event in tests).

- **`tests/mocks/qualtrics.js`** -- Added `setJSEmbeddedData` /
  `getJSEmbeddedData` methods.

- **`tests/coordinates.test.js`** -- WKT serialization/deserialization.
- **`tests/map-drawing.test.js`** -- Terra Draw API, WKT output.
- **`tests/map-display.test.js`** -- WKT input strings.
- **`tests/data-export.test.js`** -- WKT format documentation tests.
- **`tests/i18n.test.js`** -- `delete` label, no `libraries=drawing`.
- **`tests/R/test-parse-map-data.R`** -- WKT + legacy format tests.
- **`tests/python/test_parse_map_data.py`** -- WKT fixture data.

### Build and organization

- **`dist/qualtrics-mapping.js`** -- Rebuilt (~35KB). Terra Draw loaded
  separately from CDN (not bundled).
- **`Archive/`** -- Legacy files moved here: `geocode.js` (root),
  `lookfeelheader.html`, `mapinquestion.js`, `showmap.js`.
- **`package.json`** -- `main` updated from root `geocode.js` to
  `src/geocode.js`.

## Current Test Results

```
JavaScript:  103 passed (10 suites)
R parsing:    38 passed (including legacy format backward compat)
R overlays:   18 passed
Python:       needs pytest + geopandas installed to run
```

## No Current Blockers

The previous Q3 display bug is fixed (data polling + embedded data
flush delay). The full survey flow works end-to-end in the published
survey.

## Important Context

### Live survey structure (as of this session)

The published survey at
`https://illinois.qualtrics.com/jfe/form/SV_cFIH1gSZT0cBgTI`
has this structure:

- **Q1** (Text Entry): "Please enter your address or postal code, then
  draw your community on the map" -- combined geocode + draw JS
- **Page Break**
- **Q3** (Text/Graphic): "Please review your drawing below" -- display JS

Q2 was deleted (merged into Q1). The survey editor is at:
`https://illinois.qualtrics.com/survey-builder/SV_cFIH1gSZT0cBgTI/edit`

### Script loading chain (Q1 combined question)

```
Google Maps JS API (core, no drawing library)
  -> Terra Draw core (unpkg.com/terra-draw/.../terra-draw.umd.js)
    -> Terra Draw Google Maps adapter (unpkg.com/terra-draw-google-maps-adapter/...)
      -> QualtricsMapping bundle (GitHub Pages, ?v=2 cache bust)
        -> buildUI() creates address input + Look up button
          -> on geocode success: startDrawing() creates map + Terra Draw
```

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
// Note: the combined question JS omits the Done button and uses
// addOnPageSubmit instead. The Done button is still available for
// other wiring patterns.
```

### Qualtrics "New Survey Taking Experience" gotchas

1. `setEmbeddedData` / `getEmbeddedData` are deprecated -- use
   `setJSEmbeddedData` / `getJSEmbeddedData`.
2. Piped text does NOT work for JS-set embedded data -- must use
   `getJSEmbeddedData` on the consuming page.
3. `setJSEmbeddedData` from custom handlers needs ~500ms before
   `clickNextButton()`. Better: use `addOnPageSubmit` so data saves
   as part of Qualtrics' own submission flow (no timing issue).
4. Preview mode destroys iframes between pages -- only published
   survey works for cross-page data.
5. CKEditor strips script tags -- load scripts dynamically.
6. `getTextValue()` unreliable -- read from DOM directly.
7. `addOnReady` preferred over `addOnload`.
8. No Prototype.js -- use native DOM methods only.

### User's Google Maps API Key

The key `AIzaSyCxNx_ZDUNgGvulyGc-t-NBezkSc_4KgEo` is pasted directly
into the Qualtrics question JavaScript (NOT in any repo files). The
`qualtrics/*.js` files use the placeholder `YOURGOOGLEMAPKEY`.

### Remotes

- `origin` = `git@github.com:cwong-lab/QualtricsMapping.git` (no push access)
- `upstream` = `git@github.com:bowers-illinois-edu/QualtricsMapping.git`
  (push access, GitHub Pages serves from here)

### Bundle cache busting

The Qualtrics question JS loads the bundle with `?v=2`. When deploying
bundle updates, increment this version number in the Qualtrics editor
to bypass browser caching.

## What's Done vs. What Remains

### Done

- [x] Terra Draw migration (replaces deprecated DrawingManager)
- [x] WKT coordinate format (standard, no custom parser needed)
- [x] Combined geocode + draw on single page
- [x] Q3 display timing bug fixed (polls for data, 500ms flush delay)
- [x] R analysis code: native WKT + legacy backward compat (38 tests)
- [x] Python analysis code: native WKT + legacy backward compat
- [x] R overlay code unchanged and passing (18 tests)
- [x] i18n: delete label, no drawing library in Maps URL
- [x] qualtrics-integration.js updated to setJSEmbeddedData
- [x] Terra Draw mock for testing
- [x] 103 JavaScript tests passing
- [x] Bundle deployed to GitHub Pages
- [x] Live survey updated, published, and verified end-to-end
- [x] Legacy files moved to Archive/

### Remaining

- [ ] **Q3 should match Q1's view** -- show same center and zoom as the
      drawing page, not just fit-to-bounds. Store center lat/lng via
      setJSEmbeddedData. The review map should look like what the
      respondent saw.
- [ ] **Polygon validation** -- prevent degenerate polygons (straight
      lines with < 3 distinct vertices) before saving
- [ ] **Overlay integration** -- test with actual census tract / ward
      boundary GeoJSON in the live survey
- [ ] **Mobile testing** -- test Terra Draw polygon drawing on actual
      phones (touch drawing, button sizing, scroll behavior)
- [ ] **Multi-language testing** -- test Spanish labels, Chile geocoding
- [ ] **End-to-end data export test** -- complete survey, download CSV
      from Qualtrics, parse WKT in R/Python, verify spatial analysis works
- [ ] **Phase 2 (optional): Leaflet migration** -- swap Google Maps base
      map for Leaflet + free tiles. Terra Draw adapter swap only. Removes
      API key dependency.
- [ ] **Q3 reusable as stimulus** -- make the review map usable on
      multiple subsequent pages alongside slider questions (e.g., "what
      proportion of this area is X?")
