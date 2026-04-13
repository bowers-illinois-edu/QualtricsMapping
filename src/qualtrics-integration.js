/**
 * Qualtrics-specific integration: wiring map modules into Qualtrics
 * embedded data and survey navigation.
 *
 * This module bridges the platform-agnostic map code (coordinates, drawing,
 * overlays) with the Qualtrics SurveyEngine API. It stores results in
 * embedded data fields that appear in the Qualtrics CSV export, and
 * advances the survey to the next question when the respondent is done.
 */

(function (exports) {
  /**
   * Save map results to Qualtrics embedded data and advance the survey.
   *
   * @param {object} engine - Qualtrics.SurveyEngine
   * @param {object} questionCtx - the `this` context from addOnload
   * @param {object} result - {
   *   coordinates: string,
   *   zoom: number,
   *   assignments: { overlayCondition, mapType, showTraffic, ... }
   * }
   */
  function saveResults(engine, questionCtx, result) {
    engine.setEmbeddedData("MapDrawing", result.coordinates);
    engine.setEmbeddedData("zoom", result.zoom);

    if (result.assignments) {
      // Store full assignments as JSON for comprehensive analysis
      engine.setEmbeddedData(
        "MapAssignments",
        JSON.stringify(result.assignments)
      );
      // Also store overlayCondition as its own top-level field for
      // easy filtering in Qualtrics reports and quick analysis in R/Python
      if (result.assignments.overlayCondition != null) {
        engine.setEmbeddedData(
          "overlayCondition",
          result.assignments.overlayCondition
        );
      }
    }

    questionCtx.clickNextButton();
  }

  /**
   * Parse lat/lon strings from Qualtrics piped text into numbers.
   *
   * In Qualtrics, "${e://Field/lat}" is replaced server-side with the
   * string value. If the field is empty (geocoding was skipped or failed),
   * returns null so the caller can handle it.
   *
   * @param {string} latStr - e.g., "40.1164"
   * @param {string} lngStr - e.g., "-88.2434"
   * @returns {{ lat: number, lng: number } | null}
   */
  function parseCenter(latStr, lngStr) {
    if (!latStr || !lngStr || latStr.trim() === "" || lngStr.trim() === "") {
      return null;
    }
    var lat = parseFloat(latStr);
    var lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }
    return { lat: lat, lng: lng };
  }

  exports.saveResults = saveResults;
  exports.parseCenter = parseCenter;
})(
  typeof module !== "undefined"
    ? module.exports
    : (this.QMQualtricsIntegration = {})
);
