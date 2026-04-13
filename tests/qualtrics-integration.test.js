/**
 * Tests for Qualtrics-specific integration: wiring the map modules into
 * Qualtrics' survey engine, storing results in embedded data, and advancing
 * the survey.
 *
 * Why these matter: The source modules (coordinates, drawing, overlays, etc.)
 * are platform-agnostic. This integration layer is what makes them work inside
 * Qualtrics specifically. If embedded data is not set, or if the survey does
 * not advance after "Done", the data never reaches the researcher.
 */

var googleMaps = require("./mocks/google-maps");
var qualtricsMock = require("./mocks/qualtrics");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

// Module under test -- will be created in src/qualtrics-integration.js
var integration = require("../src/qualtrics-integration");

describe("storing drawing results in Qualtrics embedded data", function () {
  test("stores polygon coordinates in the MapDrawing field", function () {
    var engine = qualtricsMock.createMockSurveyEngine();
    var questionCtx = qualtricsMock.createMockQuestionContext();

    integration.saveResults(engine, questionCtx, {
      coordinates: "-88 40,-88.1 40.1,-88 40.1",
      zoom: 14,
      assignments: { mapType: "roadmap" },
    });

    expect(engine._embeddedData["MapDrawing"]).toBe(
      "-88 40,-88.1 40.1,-88 40.1"
    );
  });

  test("stores the zoom level", function () {
    var engine = qualtricsMock.createMockSurveyEngine();
    var questionCtx = qualtricsMock.createMockQuestionContext();

    integration.saveResults(engine, questionCtx, {
      coordinates: "",
      zoom: 17,
      assignments: {},
    });

    expect(engine._embeddedData["zoom"]).toBe(17);
  });

  test("stores experimental assignments as JSON", function () {
    // Why: the researcher will download the Qualtrics data as CSV. Each
    // embedded data field becomes a column. Storing assignments as JSON
    // lets them reconstruct the full experimental design per respondent.
    var engine = qualtricsMock.createMockSurveyEngine();
    var questionCtx = qualtricsMock.createMockQuestionContext();

    var assignments = {
      mapType: "satellite",
      showTraffic: false,
      overlayCondition: "ward_boundary",
    };
    integration.saveResults(engine, questionCtx, {
      coordinates: "",
      zoom: 14,
      assignments: assignments,
    });

    var stored = JSON.parse(engine._embeddedData["MapAssignments"]);
    expect(stored.mapType).toBe("satellite");
    expect(stored.overlayCondition).toBe("ward_boundary");
  });

  test("advances to the next question after saving", function () {
    var engine = qualtricsMock.createMockSurveyEngine();
    var questionCtx = qualtricsMock.createMockQuestionContext();

    integration.saveResults(engine, questionCtx, {
      coordinates: "",
      zoom: 14,
      assignments: {},
    });

    expect(questionCtx._nextClicked).toBe(true);
  });
});

describe("map-as-treatment workflow", function () {
  // Why: a common experimental design is to randomize the map stimulus
  // (overlay, zoom, map type) and then measure the effect on downstream
  // survey questions. The map is the treatment; the survey responses are
  // the outcomes. For this to work, all treatment assignments must be
  // stored in embedded data so they appear in the Qualtrics CSV export
  // alongside the survey responses.

  test("stores all treatment assignments so they appear in the CSV export", function () {
    var engine = qualtricsMock.createMockSurveyEngine();
    var questionCtx = qualtricsMock.createMockQuestionContext();

    integration.saveResults(engine, questionCtx, {
      coordinates: "-88 40,-88.1 40.1",
      zoom: 15,
      assignments: {
        overlayCondition: "census_tract",
        mapType: "satellite",
        showTraffic: true,
        centerOffsetLat: 0.01,
        centerOffsetLng: -0.02,
      },
    });

    // Each assignment should be recoverable from the exported data
    var stored = JSON.parse(engine._embeddedData["MapAssignments"]);
    expect(stored.overlayCondition).toBe("census_tract");
    expect(stored.mapType).toBe("satellite");
    expect(stored.showTraffic).toBe(true);
    expect(stored.centerOffsetLat).toBeCloseTo(0.01, 4);
  });

  test("stores overlay condition as its own field for easy filtering", function () {
    // Why: researchers often want to filter or stratify by overlay
    // condition without parsing JSON. A top-level embedded data field
    // makes this easier in Qualtrics reporting and in R/Python.
    var engine = qualtricsMock.createMockSurveyEngine();
    var questionCtx = qualtricsMock.createMockQuestionContext();

    integration.saveResults(engine, questionCtx, {
      coordinates: "",
      zoom: 14,
      assignments: { overlayCondition: "ward_boundary" },
    });

    expect(engine._embeddedData["overlayCondition"]).toBe("ward_boundary");
  });
});

describe("reading piped values from Qualtrics", function () {
  test("parses lat/lon from Qualtrics embedded data strings", function () {
    // In Qualtrics, piped text like "${e://Field/lat}" is replaced with
    // the string value at render time. Our code receives these as strings
    // and must parse them to numbers.
    var center = integration.parseCenter("40.1164", "-88.2434");
    expect(center.lat).toBeCloseTo(40.1164, 4);
    expect(center.lng).toBeCloseTo(-88.2434, 4);
  });

  test("handles missing or empty piped values gracefully", function () {
    // If the geocoding step was skipped or failed, lat/lon might be empty.
    var center = integration.parseCenter("", "");
    expect(center).toBeNull();
  });
});
