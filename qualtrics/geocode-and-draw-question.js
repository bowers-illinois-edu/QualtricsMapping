// QualtricsMapping: Combined Geocode + Drawing Question
// Paste into a single Text/Graphic question's JavaScript editor.
//
// Flow: respondent types address -> clicks "Look up" -> map appears
// below with Terra Draw active -> they draw polygon(s) -> click Done.
// All on one page, no cross-page data transfer needed.

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

  function loadScript(src, cb) {
    var s = document.createElement("script"); s.src = src; s.onload = cb;
    s.onerror = function () { console.error("QM: Failed to load: " + src); };
    document.head.appendChild(s);
  }

  // --- Read address from the question's text input ---
  function getTextFromDOM() {
    var container = questionCtx.getQuestionContainer();
    var ta = container.querySelector("textarea");
    if (ta && ta.value) return ta.value;
    var inp = container.querySelector("input[type='text']");
    if (inp && inp.value) return inp.value;
    return "";
  }

  // --- Build the UI: address lookup, then map ---
  function buildUI() {
    var container = questionCtx.getQuestionContainer();

    // Address lookup button
    var lookupBtn = document.createElement("div");
    lookupBtn.style.cssText = "display:inline-block; cursor:pointer; padding:8px 16px; margin:8px 0; background:#0078d4; color:white; border-radius:4px; font-size:16px;";
    lookupBtn.innerHTML = "<b>Look up address</b>";
    container.appendChild(lookupBtn);

    // Status message
    var status = document.createElement("div");
    status.style.cssText = "margin:8px 0; min-height:20px;";
    container.appendChild(status);

    // Map container (hidden until geocode succeeds)
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

        // Store lat/lon in embedded data for downstream analysis
        Qualtrics.SurveyEngine.setJSEmbeddedData("lat", String(result.lat));
        Qualtrics.SurveyEngine.setJSEmbeddedData("lon", String(result.lng));
        console.log("QM: geocoded lat=" + result.lat + " lon=" + result.lng);

        status.textContent = "Address found. Please draw your community on the map below.";

        // Show the map and start drawing -- all on this page
        mapArea.style.display = "block";
        startDrawing(mapArea, { lat: result.lat, lng: result.lng });

        // Scroll the map into view on mobile
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

    // --- Buttons ---
    var buttons = QMDrawing.createButtons(ctx, labels);
    var bc = document.createElement("div");
    bc.style.zIndex = "1";
    bc.appendChild(buttons.draw);
    bc.appendChild(buttons.stop);
    bc.appendChild(buttons.delete);
    bc.appendChild(buttons.reset);
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
      console.log("QM: saved MapDrawing (" + result.coordinates.length + " chars)");
      questionCtx.clickNextButton();
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
