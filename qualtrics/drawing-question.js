// QualtricsMapping: Drawing Question JavaScript (Q2)
// Paste into Q2's JavaScript editor.
// Reads lat/lon via getJSEmbeddedData (NOT piped text).
// Uses Terra Draw for polygon drawing (replaces deprecated DrawingManager).

Qualtrics.SurveyEngine.addOnReady(function () {
  var questionCtx = this;
  var GMAPS_KEY = "YOURGOOGLEMAPKEY";
  var BUNDLE_URL = "https://bowers-illinois-edu.github.io/QualtricsMapping/dist/qualtrics-mapping.js";
  var TERRADRAW_URL = "https://unpkg.com/terra-draw/dist/terra-draw.umd.js";
  var TERRADRAW_ADAPTER_URL = "https://unpkg.com/terra-draw-google-maps-adapter/dist/terra-draw-google-maps-adapter.umd.js";
  var LANGUAGE = "en";
  var LABEL_OVERRIDES = null;
  var SEED = "${e://Field/ResponseID}";
  var EXPERIMENTAL_DESIGN = { zoom: { type: "int", min: 12, max: 16 } };
  var FIXED_ZOOM = 14;
  var FIXED_MAP_TYPE = "roadmap";
  var OVERLAY_GEOJSON_URL = null;
  var OVERLAY_GEOJSON = null;
  var OVERLAY_CONDITIONS = null;
  var OVERLAY_STYLE = { fillColor: "#3388ff", fillOpacity: 0.15, strokeColor: "#3388ff", strokeWeight: 2, strokeOpacity: 0.8 };
  var AUTO_SELECT_CONTAINING = true;

  function loadScript(src, cb) {
    var s = document.createElement("script"); s.src = src; s.onload = cb;
    s.onerror = function () { console.error("QM: Failed to load: " + src); };
    document.head.appendChild(s);
  }

  function getCenter() {
    var latStr = Qualtrics.SurveyEngine.getJSEmbeddedData("lat");
    var lonStr = Qualtrics.SurveyEngine.getJSEmbeddedData("lon");
    console.log("QM Q2: getJSEmbeddedData lat='" + latStr + "' lon='" + lonStr + "'");
    if (!latStr || !lonStr || latStr === "" || lonStr === "") return null;
    var lat = parseFloat(latStr);
    var lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat: lat, lng: lon };
  }

  function startDrawing() {
    var center = getCenter();
    if (!center) {
      questionCtx.getQuestionContainer().insertAdjacentHTML("beforeend",
        "<p style='color:red'>Error: No location data. Please go back and enter your address.</p>");
      return;
    }
    var assignments = {};
    if (EXPERIMENTAL_DESIGN) { assignments = QMRandomization.buildAssignments(EXPERIMENTAL_DESIGN, { seed: SEED }); }
    var zoom = assignments.zoom != null ? assignments.zoom : FIXED_ZOOM;
    var mapType = assignments.mapType || FIXED_MAP_TYPE;
    var labels = QMI18n.getLabels(LANGUAGE, LABEL_OVERRIDES);
    var container = questionCtx.getQuestionContainer();
    var ctx = QMDrawing.createMapCanvas(container, { lat: center.lat, lng: center.lng, zoom: zoom });
    if (mapType !== "roadmap" && google.maps.MapTypeId[mapType.toUpperCase()]) {
      ctx.map.setMapTypeId(google.maps.MapTypeId[mapType.toUpperCase()]);
    }
    if (assignments.showTraffic === true) { QMOverlays.addLayer(ctx.map, "traffic"); }

    function applyOverlay(geojsonData, conditionName) {
      if (!geojsonData) return;
      if (conditionName) assignments.overlayCondition = conditionName;
      if (AUTO_SELECT_CONTAINING) {
        var feature = QMOverlays.findContainingFeature(geojsonData, center);
        if (feature) { QMOverlays.addGeoJSON(ctx.map, { type: "FeatureCollection", features: [feature] }, { style: OVERLAY_STYLE }); }
      } else { QMOverlays.addGeoJSON(ctx.map, geojsonData, { style: OVERLAY_STYLE }); }
    }
    function loadOverlayFromUrl(url, cn) {
      fetch(url).then(function (r) { return r.json(); }).then(function (d) { applyOverlay(d, cn); }).catch(function (e) { console.warn("QM: overlay load failed", e); });
    }
    if (OVERLAY_CONDITIONS) {
      var asgn = QMOverlays.assignCondition(OVERLAY_CONDITIONS, { seed: SEED });
      assignments.overlayCondition = asgn.conditionName;
      if (typeof asgn.overlayData === "string") { loadOverlayFromUrl(asgn.overlayData, asgn.conditionName); }
      else if (asgn.overlayData) { applyOverlay(asgn.overlayData, asgn.conditionName); }
    } else if (OVERLAY_GEOJSON_URL) { loadOverlayFromUrl(OVERLAY_GEOJSON_URL, "overlay");
    } else if (OVERLAY_GEOJSON) { applyOverlay(OVERLAY_GEOJSON, "overlay"); }

    // --- Button wiring ---
    var buttons = QMDrawing.createButtons(ctx, labels);
    var bc = document.createElement("div"); bc.style.zIndex = "1";
    bc.appendChild(buttons.draw); bc.appendChild(buttons.stop);
    bc.appendChild(buttons.delete); bc.appendChild(buttons.reset);
    bc.appendChild(buttons.done);
    ctx.map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(bc);

    // Start in drawing mode: show Stop, hide Draw and Delete
    buttons.draw.style.display = "none";
    buttons.stop.style.display = "inline-block";
    buttons.delete.style.display = "none";

    buttons.draw.addEventListener("click", function () {
      QMDrawing.startDrawing(ctx);
      buttons.draw.style.display = "none";
      buttons.stop.style.display = "inline-block";
      buttons.delete.style.display = "none";
    });
    buttons.stop.addEventListener("click", function () {
      QMDrawing.stopDrawing(ctx);
      buttons.draw.style.display = "inline-block";
      buttons.stop.style.display = "none";
      buttons.delete.style.display = "inline-block";
    });
    buttons.delete.addEventListener("click", function () {
      QMDrawing.deleteSelected(ctx);
    });
    buttons.reset.addEventListener("click", function () {
      QMDrawing.resetDrawing(ctx);
      // Return to drawing mode after reset
      QMDrawing.startDrawing(ctx);
      buttons.draw.style.display = "none";
      buttons.stop.style.display = "inline-block";
      buttons.delete.style.display = "none";
    });
    buttons.done.addEventListener("click", function () {
      QMDrawing.stopDrawing(ctx);
      var result = QMDrawing.collectResult(ctx);
      result.assignments = assignments;
      Qualtrics.SurveyEngine.setJSEmbeddedData("MapDrawing", result.coordinates);
      Qualtrics.SurveyEngine.setJSEmbeddedData("zoom", String(result.zoom));
      if (result.assignments) {
        Qualtrics.SurveyEngine.setJSEmbeddedData("MapAssignments", JSON.stringify(result.assignments));
        if (result.assignments.overlayCondition) {
          Qualtrics.SurveyEngine.setJSEmbeddedData("overlayCondition", result.assignments.overlayCondition);
        }
      }
      console.log("QM Q2: saved MapDrawing (" + result.coordinates.length + " chars)");
      questionCtx.clickNextButton();
    });
  }

  // --- Script loading chain ---
  // Load Google Maps (core only, no drawing library), then Terra Draw,
  // then the QualtricsMapping bundle.
  function ensureTerraDraw(cb) {
    // Terra Draw core + Google Maps adapter are separate UMD bundles
    function loadAdapter() {
      if (typeof terraDrawGoogleMapsAdapter !== "undefined") { cb(); return; }
      loadScript(TERRADRAW_ADAPTER_URL, cb);
    }
    if (typeof terraDraw !== "undefined") { loadAdapter(); return; }
    loadScript(TERRADRAW_URL, loadAdapter);
  }

  function ensureBundle(cb) {
    if (typeof QMDrawing !== "undefined") { cb(); return; }
    loadScript(BUNDLE_URL, cb);
  }

  if (typeof google === "object" && typeof google.maps === "object") {
    ensureTerraDraw(function () { ensureBundle(startDrawing); });
  } else {
    loadScript("https://maps.googleapis.com/maps/api/js?key=" + GMAPS_KEY, function () {
      ensureTerraDraw(function () { ensureBundle(startDrawing); });
    });
  }
});
