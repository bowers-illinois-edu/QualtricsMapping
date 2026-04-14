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

  function startDisplay() {
    var coordString = Qualtrics.SurveyEngine.getJSEmbeddedData("MapDrawing") || "";
    console.log("QM Q3: MapDrawing = '" + coordString.substring(0, 40) + "...' (" + coordString.length + " chars)");
    var container = questionCtx.getQuestionContainer();
    QMDisplay.showMap(container, coordString, {
      polycolor: POLY_COLOR, fillopacity: FILL_OPACITY, strokeweight: STROKE_WEIGHT
    });
  }

  if (typeof google === "object" && typeof google.maps === "object") {
    if (typeof QMDisplay !== "undefined") { startDisplay(); }
    else { loadScript(BUNDLE_URL, startDisplay); }
  } else {
    loadScript("https://maps.googleapis.com/maps/api/js?key=" + GMAPS_KEY + "&libraries=drawing", function () {
      loadScript(BUNDLE_URL, startDisplay);
    });
  }
});
