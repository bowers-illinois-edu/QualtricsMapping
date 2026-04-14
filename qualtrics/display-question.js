// QualtricsMapping: Display/Review Question JavaScript (Q3)
// Paste into Q3's JavaScript editor.
// Reads MapDrawing via getJSEmbeddedData (NOT piped text).

Qualtrics.SurveyEngine.addOnReady(function () {
  var questionCtx = this;
  var GMAPS_KEY = "YOURGOOGLEMAPKEY";
  var BUNDLE_URL = "https://bowers-illinois-edu.github.io/QualtricsMapping/dist/qualtrics-mapping.js";
  var POLY_COLOR = "#000000";
  var FILL_OPACITY = 0.5;
  var STROKE_WEIGHT = 1;

  function loadScript(src, cb) {
    var s = document.createElement("script"); s.src = src; s.onload = cb;
    s.onerror = function () { console.error("QM: Failed to load: " + src); };
    document.head.appendChild(s);
  }

  // Qualtrics may not have populated JS embedded data from the previous
  // page's setJSEmbeddedData when addOnReady fires. Poll briefly for
  // the data before rendering. If no data arrives within 2 seconds,
  // render anyway (respondent may not have drawn anything).
  function waitForData(cb) {
    var maxWait = 2000;
    var interval = 100;
    var elapsed = 0;
    function check() {
      var data = Qualtrics.SurveyEngine.getJSEmbeddedData("MapDrawing");
      if (data && data !== "") {
        console.log("QM Q3: data ready after " + elapsed + "ms");
        cb(data);
      } else if (elapsed < maxWait) {
        elapsed += interval;
        setTimeout(check, interval);
      } else {
        console.log("QM Q3: no MapDrawing data after " + maxWait + "ms, rendering empty");
        cb("");
      }
    }
    check();
  }

  function startDisplay(coordString) {
    console.log("QM Q3: MapDrawing = '" + (coordString || "").substring(0, 60) + "...' (" + (coordString || "").length + " chars)");
    var container = questionCtx.getQuestionContainer();
    QMDisplay.showMap(container, coordString || "", {
      polycolor: POLY_COLOR, fillopacity: FILL_OPACITY, strokeweight: STROKE_WEIGHT
    });
  }

  function initDisplay() {
    waitForData(startDisplay);
  }

  if (typeof google === "object" && typeof google.maps === "object") {
    if (typeof QMDisplay !== "undefined") { initDisplay(); }
    else { loadScript(BUNDLE_URL, initDisplay); }
  } else {
    loadScript("https://maps.googleapis.com/maps/api/js?key=" + GMAPS_KEY, function () {
      loadScript(BUNDLE_URL, initDisplay);
    });
  }
});
