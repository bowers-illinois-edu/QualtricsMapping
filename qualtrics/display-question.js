// QualtricsMapping: Display/Review Question JavaScript
//
// Paste this into the Question JavaScript editor for a "Text / Graphic"
// question that shows the respondent their previously drawn map.
//
// This creates a static (non-interactive) map displaying the polygons
// the respondent drew. Use this when you want the respondent to see
// their drawing and answer follow-up questions about it.
//
// Setup in Qualtrics:
//   1. Create a "Text / Graphic" question
//   2. The drawing question must come before this question
//      (it sets the MapDrawing embedded data field)
//   3. Click the question's gear icon > Add JavaScript > paste this

Qualtrics.SurveyEngine.addOnload(function () {
  // --- CONFIGURATION ---
  // Polygon display style
  var POLY_COLOR = "#000000";
  var FILL_OPACITY = 0.5;
  var STROKE_WEIGHT = 1;
  // --- END CONFIGURATION ---

  var coordString = "${e://Field/MapDrawing}";
  var container = this.getQuestionContainer();

  QMDisplay.showMap(container, coordString, {
    polycolor: POLY_COLOR,
    fillopacity: FILL_OPACITY,
    strokeweight: STROKE_WEIGHT,
  });
});
