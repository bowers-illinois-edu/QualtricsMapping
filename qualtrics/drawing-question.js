// QualtricsMapping: Drawing Question JavaScript
//
// Paste this into the Question JavaScript editor for a "Text / Graphic"
// question where the respondent draws on the map.
//
// Setup in Qualtrics:
//   1. Create a "Text / Graphic" question (the map replaces the text)
//   2. In Survey Flow, add these embedded data fields BEFORE the block:
//      MapDrawing, zoom, MapAssignments, overlayCondition
//      (leave values blank -- they are set by this code)
//   3. The geocode question must come before this question
//      (it sets the lat and lon embedded data fields)
//   4. Click the question's gear icon > Add JavaScript > paste this

Qualtrics.SurveyEngine.addOnload(function () {
  // --- CONFIGURATION ---
  // Researchers: edit this section to set up your experimental design.

  // Language for button labels. Options: "en", "es", or custom overrides.
  var LANGUAGE = "en";
  // Custom label overrides (set to null to use defaults):
  // var LABEL_OVERRIDES = { draw: "Mark your neighborhood" };
  var LABEL_OVERRIDES = null;

  // Seed field for randomization. Default: Qualtrics ResponseID.
  // For panel studies, use your panel ID field name instead.
  var SEED = "${e://Field/ResponseID}";

  // Experimental design: what map attributes to randomize.
  // Set to null to disable randomization (use fixed values below).
  // Each factor has a type ("int" or "choice") and parameters.
  var EXPERIMENTAL_DESIGN = {
    zoom: { type: "int", min: 12, max: 16 },
    // mapType: { type: "choice", options: ["roadmap", "satellite"] },
    // showTraffic: { type: "choice", options: [true, false] },
  };

  // Fixed values (used when a factor is NOT in EXPERIMENTAL_DESIGN):
  var FIXED_ZOOM = 14;
  var FIXED_MAP_TYPE = "roadmap";

  // Overlay: set to a GeoJSON object or URL to show a boundary.
  // Set to null for no overlay.
  //
  // To use a GeoJSON URL (recommended for large boundary files):
  //   var OVERLAY_GEOJSON_URL = "https://your-server.com/boundaries.geojson";
  //   var OVERLAY_GEOJSON = null;
  //
  // To embed GeoJSON directly (works for small files):
  //   var OVERLAY_GEOJSON_URL = null;
  //   var OVERLAY_GEOJSON = { type: "FeatureCollection", features: [...] };
  //
  // For randomized overlays (multiple conditions):
  //   var OVERLAY_CONDITIONS = {
  //     control: null,
  //     ward_boundary: { type: "FeatureCollection", features: [...] },
  //     census_tract: "https://your-server.com/tracts.geojson"
  //   };
  var OVERLAY_GEOJSON_URL = null;
  var OVERLAY_GEOJSON = null;
  var OVERLAY_CONDITIONS = null;

  // Overlay styling (for boundary display)
  var OVERLAY_STYLE = {
    fillColor: "#3388ff",
    fillOpacity: 0.15,
    strokeColor: "#3388ff",
    strokeWeight: 2,
    strokeOpacity: 0.8,
  };

  // Whether to auto-select the overlay containing the respondent's location.
  // When true, does point-in-polygon lookup on the respondent's geocoded
  // coordinates to find the matching boundary feature and display only that.
  var AUTO_SELECT_CONTAINING = true;

  // --- END CONFIGURATION ---

  var questionCtx = this;

  // Read geocoded coordinates from previous question
  var latStr = "${e://Field/lat}";
  var lonStr = "${e://Field/lon}";
  var center = QMQualtricsIntegration.parseCenter(latStr, lonStr);

  if (!center) {
    questionCtx
      .getQuestionContainer()
      .insertAdjacentHTML(
        "beforeend",
        "<p style='color:red'>Error: No location data found. " +
          "Please go back and enter your address.</p>"
      );
    return;
  }

  // Build experimental assignments
  var assignments = {};
  if (EXPERIMENTAL_DESIGN) {
    assignments = QMRandomization.buildAssignments(EXPERIMENTAL_DESIGN, {
      seed: SEED,
    });
  }

  // Determine zoom
  var zoom = assignments.zoom != null ? assignments.zoom : FIXED_ZOOM;

  // Determine map type
  var mapType = assignments.mapType || FIXED_MAP_TYPE;

  // Create the map
  var labels = QMI18n.getLabels(LANGUAGE, LABEL_OVERRIDES);
  var container = questionCtx.getQuestionContainer();
  var ctx = QMDrawing.createMapCanvas(container, {
    lat: center.lat,
    lng: center.lng,
    zoom: zoom,
  });

  // Apply map type if not default
  if (mapType !== "roadmap" && google.maps.MapTypeId[mapType.toUpperCase()]) {
    ctx.map.setMapTypeId(google.maps.MapTypeId[mapType.toUpperCase()]);
  }

  // Apply traffic layer if assigned
  if (assignments.showTraffic === true) {
    QMOverlays.addLayer(ctx.map, "traffic");
  }

  // --- Overlay loading ---
  function applyOverlay(geojsonData, conditionName) {
    if (!geojsonData) return;
    if (conditionName) {
      assignments.overlayCondition = conditionName;
    }

    if (AUTO_SELECT_CONTAINING) {
      // Find the feature containing the respondent's location
      var feature = QMOverlays.findContainingFeature(geojsonData, center);
      if (feature) {
        var singleFeature = {
          type: "FeatureCollection",
          features: [feature],
        };
        QMOverlays.addGeoJSON(ctx.map, singleFeature, {
          style: OVERLAY_STYLE,
        });
      }
    } else {
      QMOverlays.addGeoJSON(ctx.map, geojsonData, { style: OVERLAY_STYLE });
    }
  }

  function loadOverlayFromUrl(url, conditionName) {
    fetch(url)
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        applyOverlay(data, conditionName);
      })
      .catch(function (err) {
        console.warn("QualtricsMapping: failed to load overlay from", url, err);
      });
  }

  // Handle the three overlay configuration modes
  if (OVERLAY_CONDITIONS) {
    // Randomized overlay conditions
    var assignment = QMOverlays.assignCondition(OVERLAY_CONDITIONS, {
      seed: SEED,
    });
    assignments.overlayCondition = assignment.conditionName;

    if (typeof assignment.overlayData === "string") {
      // It is a URL
      loadOverlayFromUrl(assignment.overlayData, assignment.conditionName);
    } else if (assignment.overlayData) {
      // It is inline GeoJSON
      applyOverlay(assignment.overlayData, assignment.conditionName);
    }
    // else: control condition (null), no overlay
  } else if (OVERLAY_GEOJSON_URL) {
    loadOverlayFromUrl(OVERLAY_GEOJSON_URL, "overlay");
  } else if (OVERLAY_GEOJSON) {
    applyOverlay(OVERLAY_GEOJSON, "overlay");
  }

  // --- Drawing controls ---
  var buttons = QMDrawing.createButtons(ctx, labels);
  var buttonContainer = document.createElement("div");
  buttonContainer.style.zIndex = "1";
  buttonContainer.appendChild(buttons.draw);
  buttonContainer.appendChild(buttons.stop);
  buttonContainer.appendChild(buttons.reset);
  buttonContainer.appendChild(buttons.done);

  ctx.map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(
    buttonContainer
  );

  // Start in drawing mode
  buttons.draw.style.display = "none";
  buttons.stop.style.display = "inline-block";

  // Button behavior
  buttons.draw.addEventListener("click", function () {
    ctx.drawingManager.setDrawingMode(
      google.maps.drawing.OverlayType.POLYGON
    );
    buttons.draw.style.display = "none";
    buttons.stop.style.display = "inline-block";
  });

  buttons.stop.addEventListener("click", function () {
    ctx.drawingManager.setDrawingMode(null);
    buttons.draw.style.display = "inline-block";
    buttons.stop.style.display = "none";
  });

  buttons.reset.addEventListener("click", function () {
    QMDrawing.resetPolygons(ctx);
    ctx.drawingManager.setDrawingMode(null);
    buttons.draw.style.display = "inline-block";
    buttons.stop.style.display = "none";
  });

  buttons.done.addEventListener("click", function () {
    ctx.drawingManager.setDrawingMode(null);
    var result = QMDrawing.collectResult(ctx);
    result.assignments = assignments;

    QMQualtricsIntegration.saveResults(
      Qualtrics.SurveyEngine,
      questionCtx,
      result
    );
  });

  // Handle completed polygons
  var stopToggle = false;

  google.maps.event.addListener(
    ctx.drawingManager,
    "polygoncomplete",
    function (poly) {
      if (stopToggle) {
        poly.setMap(null);
        stopToggle = false;
        return;
      }

      QMDrawing.addPolygon(ctx, poly);

      // Click to delete
      google.maps.event.addListener(poly, "click", function (e) {
        var content = document.createElement("div");
        content.innerHTML =
          "<p>" +
          labels.deleteConfirm +
          "</p>" +
          '<p><button class="qm-delete-yes">' +
          labels.deleteYes +
          "</button> " +
          '<button class="qm-delete-no">' +
          labels.deleteNo +
          "</button></p>";

        var popup = new google.maps.InfoWindow({
          content: content,
          position: e.latLng,
        });

        content
          .querySelector(".qm-delete-yes")
          .addEventListener("click", function () {
            QMDrawing.removePolygon(ctx, poly);
            popup.close();
          });
        content
          .querySelector(".qm-delete-no")
          .addEventListener("click", function () {
            popup.close();
          });

        popup.open(ctx.map);
      });
    }
  );
});
