/**
 * Tests for the interactive map drawing experience (Terra Draw version).
 *
 * Why these matter: The core purpose of this tool is to let survey respondents
 * draw polygons on a map representing something meaningful to them (e.g., "my
 * community"). The drawing interface must work reliably on phones in multiple
 * countries, and the resulting data must be faithfully recorded. A broken
 * drawing experience means no data; a confusing one means noisy data.
 *
 * This version tests the Terra Draw-based implementation, which replaces
 * the deprecated Google Maps DrawingManager (removed May 2026). The base
 * map is still Google Maps; only the drawing layer changed.
 */

var googleMaps = require("./mocks/google-maps");
var terraDraw = require("./mocks/terra-draw");

beforeAll(function () {
  googleMaps.install();
  terraDraw.install();
});
afterAll(function () {
  terraDraw.uninstall();
  googleMaps.uninstall();
});

var drawing = require("../src/drawing");

describe("map canvas creation", function () {
  test("creates a map element inside the provided container", function () {
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.1164,
      lng: -88.2434,
      zoom: 14,
    });
    var canvas = container.querySelector("#map_canvas");
    expect(canvas).not.toBeNull();
    expect(ctx.map).toBeDefined();
  });

  test("centers the map on the provided coordinates", function () {
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: -33.4489,
      lng: -70.6693,
      zoom: 12,
    });
    expect(ctx.map._options.center._lat).toBeCloseTo(-33.4489, 4);
    expect(ctx.map._options.center._lng).toBeCloseTo(-70.6693, 4);
  });

  test("applies the given zoom level", function () {
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 16,
    });
    expect(ctx.map._options.zoom).toBe(16);
  });

  test("initializes Terra Draw with polygon and select modes", function () {
    // Terra Draw must support both drawing new polygons and
    // selecting existing ones (for deletion).
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
    expect(ctx.draw).toBeDefined();
    expect(ctx.draw._started).toBe(true);
  });

  test("starts in polygon drawing mode so respondent can begin immediately", function () {
    // Respondents on phones should not have to figure out how to start.
    // Drawing mode should be active by default.
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
    expect(ctx.draw.getMode()).toBe("polygon");
  });
});

describe("drawing mode control", function () {
  var container, ctx;

  beforeEach(function () {
    container = document.createElement("div");
    ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
  });

  test("startDrawing sets mode to polygon", function () {
    drawing.stopDrawing(ctx);
    drawing.startDrawing(ctx);
    expect(ctx.draw.getMode()).toBe("polygon");
  });

  test("stopDrawing sets mode to select for polygon management", function () {
    drawing.stopDrawing(ctx);
    expect(ctx.draw.getMode()).toBe("select");
  });
});

describe("drawing controls (buttons)", function () {
  var container, ctx;

  beforeEach(function () {
    container = document.createElement("div");
    ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
  });

  test("provides Draw, Stop, Delete, Reset, and Done buttons", function () {
    var buttons = drawing.createButtons(ctx);
    expect(buttons.draw).toBeDefined();
    expect(buttons.stop).toBeDefined();
    expect(buttons.delete).toBeDefined();
    expect(buttons.reset).toBeDefined();
    expect(buttons.done).toBeDefined();
  });

  test("buttons have minimum 44px touch targets for mobile use", function () {
    // Apple HIG requires 44px minimum for touch targets. Survey
    // respondents in developing countries often use small, older phones.
    var buttons = drawing.createButtons(ctx);
    var minHeight = parseInt(buttons.draw.style.minHeight, 10);
    var minWidth = parseInt(buttons.draw.style.minWidth, 10);
    expect(minHeight).toBeGreaterThanOrEqual(44);
    expect(minWidth).toBeGreaterThanOrEqual(44);
  });
});

describe("polygon management", function () {
  var container, ctx;

  beforeEach(function () {
    container = document.createElement("div");
    ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
  });

  test("records a completed polygon from Terra Draw", function () {
    // Simulate a respondent drawing a triangle
    ctx.draw._simulatePolygonComplete([
      [-88.0, 40.0],
      [-88.1, 40.1],
      [-88.0, 40.1],
    ]);
    var features = drawing.getFeatures(ctx);
    expect(features).toHaveLength(1);
    expect(features[0].geometry.type).toBe("Polygon");
  });

  test("can draw multiple polygons", function () {
    // A respondent might identify multiple disconnected areas as
    // part of their community.
    ctx.draw._simulatePolygonComplete([
      [-88.0, 40.0],
      [-88.1, 40.1],
      [-88.0, 40.1],
    ]);
    ctx.draw._simulatePolygonComplete([
      [-87.0, 41.0],
      [-87.1, 41.1],
      [-87.0, 41.1],
    ]);
    var features = drawing.getFeatures(ctx);
    expect(features).toHaveLength(2);
  });

  test("resetDrawing clears all drawn polygons", function () {
    ctx.draw._simulatePolygonComplete([
      [-88.0, 40.0],
      [-88.1, 40.1],
      [-88.0, 40.1],
    ]);
    drawing.resetDrawing(ctx);
    var features = drawing.getFeatures(ctx);
    expect(features).toHaveLength(0);
  });

  test("deleteSelected removes the selected polygon but keeps others", function () {
    var id1 = ctx.draw._simulatePolygonComplete([
      [-88.0, 40.0],
      [-88.1, 40.1],
      [-88.0, 40.1],
    ]);
    ctx.draw._simulatePolygonComplete([
      [-87.0, 41.0],
      [-87.1, 41.1],
      [-87.0, 41.1],
    ]);
    // Select the first polygon, then delete it
    ctx.draw._simulateSelect(id1);
    drawing.deleteSelected(ctx);
    var features = drawing.getFeatures(ctx);
    expect(features).toHaveLength(1);
  });

  test("deleteSelected does nothing when nothing is selected", function () {
    ctx.draw._simulatePolygonComplete([
      [-88.0, 40.0],
      [-88.1, 40.1],
      [-88.0, 40.1],
    ]);
    // No selection -- delete should be a no-op
    drawing.deleteSelected(ctx);
    var features = drawing.getFeatures(ctx);
    expect(features).toHaveLength(1);
  });
});

describe("result collection", function () {
  test("collects all polygon coordinates as WKT", function () {
    // The coordinate string is the primary data product. It uses WKT
    // (Well-Known Text), which R, Python, QGIS, and PostGIS all read
    // natively. No custom parser needed.
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
    ctx.draw._simulatePolygonComplete([
      [-88.0, 40.0],
      [-88.1, 40.1],
      [-88.0, 40.1],
    ]);
    var result = drawing.collectResult(ctx);
    expect(typeof result.coordinates).toBe("string");
    expect(result.coordinates).toMatch(/^POLYGON\(/);
    // WKT uses longitude-first: "lng lat, lng lat, ..."
    expect(result.coordinates).toContain("-88 40");
  });

  test("records the zoom level in the result", function () {
    // Researchers need to know what zoom level the respondent saw,
    // especially when zoom is experimentally varied.
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 17,
    });
    var result = drawing.collectResult(ctx);
    expect(result.zoom).toBe(17);
  });

  test("returns empty string when no polygons were drawn", function () {
    // A respondent might click Done without drawing anything.
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
    var result = drawing.collectResult(ctx);
    expect(result.coordinates).toBe("");
  });

  test("WKT output round-trips through deserialize", function () {
    // The WKT string must be parseable by the same deserializer
    // used by display.js. R and Python use their own WKT parsers.
    var coordinates = require("../src/coordinates");
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
    ctx.draw._simulatePolygonComplete([
      [-88.2434, 40.1164],
      [-88.2334, 40.1064],
      [-88.2234, 40.1164],
    ]);
    var result = drawing.collectResult(ctx);
    var recovered = coordinates.deserializePolygons(result.coordinates);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toHaveLength(3);
    expect(recovered[0][0].lng).toBeCloseTo(-88.2434, 4);
    expect(recovered[0][0].lat).toBeCloseTo(40.1164, 4);
  });

  test("multiple polygons produce MULTIPOLYGON WKT", function () {
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
    ctx.draw._simulatePolygonComplete([
      [-88.0, 40.0],
      [-88.1, 40.1],
      [-88.0, 40.1],
    ]);
    ctx.draw._simulatePolygonComplete([
      [-87.0, 41.0],
      [-87.1, 41.1],
      [-87.0, 41.1],
    ]);
    var result = drawing.collectResult(ctx);
    expect(result.coordinates).toMatch(/^MULTIPOLYGON\(/);
  });
});
