// QualtricsMapping: Combined Geocode + Drawing Question
// Paste into a single Text Entry question's JavaScript editor.
//
// Flow: respondent types address -> clicks "Look up" -> map appears
// below with Terra Draw active -> they draw polygon(s) -> click Next.
// Drawing data is saved automatically when the page submits.

Qualtrics.SurveyEngine.addOnReady(function () {
  var questionCtx = this;
  var GMAPS_KEY = "YOURGOOGLEMAPKEY";
  var BUNDLE_URL = "https://bowers-illinois-edu.github.io/QualtricsMapping/dist/qualtrics-mapping.js?v=2";
  var TERRADRAW_URL = "https://unpkg.com/terra-draw/dist/terra-draw.umd.js";
  var TERRADRAW_ADAPTER_URL = "https://unpkg.com/terra-draw-google-maps-adapter/dist/terra-draw-google-maps-adapter.umd.js";
  var COUNTRY = null; // Set to "US", "CL", "KE", etc. to restrict geocoding
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

  // Drawing state -- accessible to the page submit handler
  var drawingCtx = null;
  var drawingAssignments = {};

  function loadScript(src, cb) {
    var s = document.createElement("script"); s.src = src; s.onload = cb;
    s.onerror = function () { console.error("QM: Failed to load: " + src); };
    document.head.appendChild(s);
  }

  function getTextFromDOM() {
    var container = questionCtx.getQuestionContainer();
    var ta = container.querySelector("textarea");
    if (ta && ta.value) return ta.value;
    var inp = container.querySelector("input[type='text']");
    if (inp && inp.value) return inp.value;
    return "";
  }

  // --- Save drawing data when the page submits (respondent clicks Next) ---
  questionCtx.addOnPageSubmit(function () {
    if (drawingCtx) {
      QMDrawing.stopDrawing(drawingCtx);
      var result = QMDrawing.collectResult(drawingCtx);

      Qualtrics.SurveyEngine.setJSEmbeddedData("MapDrawing", result.coordinates);
      Qualtrics.SurveyEngine.setJSEmbeddedData("zoom", String(result.zoom));
      if (drawingAssignments) {
        Qualtrics.SurveyEngine.setJSEmbeddedData("MapAssignments", JSON.stringify(drawingAssignments));
        if (drawingAssignments.overlayCondition) {
          Qualtrics.SurveyEngine.setJSEmbeddedData("overlayCondition", drawingAssignments.overlayCondition);
        }
      }
      console.log("QM: saved MapDrawing (" + result.coordinates.length + " chars)");
    }
  });

  // --- Build the UI: address lookup, then map ---
  function buildUI() {
    var container = questionCtx.getQuestionContainer();

    var lookupBtn = document.createElement("div");
    lookupBtn.style.cssText = "display:inline-block; cursor:pointer; padding:8px 16px; margin:8px 0; background:#0078d4; color:white; border-radius:4px; font-size:16px;";
    lookupBtn.innerHTML = "<b>Look up address</b>";
    container.appendChild(lookupBtn);

    var status = document.createElement("div");
    status.style.cssText = "margin:8px 0; min-height:20px;";
    container.appendChild(status);

    var mapArea = document.createElement("div");
    mapArea.style.display = "none";
    container.appendChild(mapArea);

    lookupBtn.addEventListener("click", function () {
      var address = getTextFromDOM();
      if (!address || address.trim() === "") {
        status.textContent = "Please enter an address or postal code.";
        return;
      }
      status.textContent = "Looking up address...";
      lookupBtn.style.opacity = "0.5";

      var opts = {};
      if (COUNTRY) { opts.country = COUNTRY; }

      QMGeocode.geocodeAddress(address, opts, function (err, result) {
        lookupBtn.style.opacity = "1";
        if (err) {
          status.textContent = "Unable to find that address. Please check and try again.";
          return;
        }

        Qualtrics.SurveyEngine.setJSEmbeddedData("lat", String(result.lat));
        Qualtrics.SurveyEngine.setJSEmbeddedData("lon", String(result.lng));
        console.log("QM: geocoded lat=" + result.lat + " lon=" + result.lng);

        status.textContent = "Address found. Please draw your community on the map below, then click Next.";

        mapArea.style.display = "block";
        startDrawing(mapArea, { lat: result.lat, lng: result.lng });
        mapArea.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // --- Create map with Terra Draw and wire up buttons ---
  function startDrawing(mapArea, center) {
    var assignments = {};
    if (EXPERIMENTAL_DESIGN) {
      assignments = QMRandomization.buildAssignments(EXPERIMENTAL_DESIGN, { seed: SEED });
    }
    var zoom = assignments.zoom != null ? assignments.zoom : FIXED_ZOOM;
    var mapType = assignments.mapType || FIXED_MAP_TYPE;
    var labels = QMI18n.getLabels(LANGUAGE, LABEL_OVERRIDES);

    var ctx = QMDrawing.createMapCanvas(mapArea, { lat: center.lat, lng: center.lng, zoom: zoom });

    // Store for page submit handler
    drawingCtx = ctx;
    drawingAssignments = assignments;

    if (mapType !== "roadmap" && google.maps.MapTypeId[mapType.toUpperCase()]) {
      ctx.map.setMapTypeId(google.maps.MapTypeId[mapType.toUpperCase()]);
    }
    if (assignments.showTraffic === true) {
      QMOverlays.addLayer(ctx.map, "traffic");
    }

    // --- Overlays ---
    function applyOverlay(geojsonData, conditionName) {
      if (!geojsonData) return;
      if (conditionName) assignments.overlayCondition = conditionName;
      if (AUTO_SELECT_CONTAINING) {
        var feature = QMOverlays.findContainingFeature(geojsonData, center);
        if (feature) {
          QMOverlays.addGeoJSON(ctx.map, { type: "FeatureCollection", features: [feature] }, { style: OVERLAY_STYLE });
        }
      } else {
        QMOverlays.addGeoJSON(ctx.map, geojsonData, { style: OVERLAY_STYLE });
      }
    }
    function loadOverlayFromUrl(url, cn) {
      fetch(url).then(function (r) { return r.json(); })
        .then(function (d) { applyOverlay(d, cn); })
        .catch(function (e) { console.warn("QM: overlay load failed", e); });
    }
    if (OVERLAY_CONDITIONS) {
      var asgn = QMOverlays.assignCondition(OVERLAY_CONDITIONS, { seed: SEED });
      assignments.overlayCondition = asgn.conditionName;
      if (typeof asgn.overlayData === "string") { loadOverlayFromUrl(asgn.overlayData, asgn.conditionName); }
      else if (asgn.overlayData) { applyOverlay(asgn.overlayData, asgn.conditionName); }
    } else if (OVERLAY_GEOJSON_URL) {
      loadOverlayFromUrl(OVERLAY_GEOJSON_URL, "overlay");
    } else if (OVERLAY_GEOJSON) {
      applyOverlay(OVERLAY_GEOJSON, "overlay");
    }

    // --- Drawing buttons (no Done -- page Next handles submission) ---
    var buttons = QMDrawing.createButtons(ctx, labels);
    var bc = document.createElement("div");
    bc.style.zIndex = "1";
    bc.appendChild(buttons.draw);
    bc.appendChild(buttons.stop);
    bc.appendChild(buttons.delete);
    bc.appendChild(buttons.reset);
    // No Done button -- respondent clicks the standard Next page button
    ctx.map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(bc);

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
      QMDrawing.startDrawing(ctx);
      buttons.draw.style.display = "none";
      buttons.stop.style.display = "inline-block";
      buttons.delete.style.display = "none";
    });
  }

  // --- Script loading chain ---
  function ensureTerraDraw(cb) {
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
    ensureTerraDraw(function () { ensureBundle(buildUI); });
  } else {
    loadScript("https://maps.googleapis.com/maps/api/js?key=" + GMAPS_KEY, function () {
      ensureTerraDraw(function () { ensureBundle(buildUI); });
    });
  }
});
