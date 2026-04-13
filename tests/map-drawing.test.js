/**
 * Tests for the interactive map drawing experience.
 *
 * Why these matter: The core purpose of this tool is to let survey respondents
 * draw polygons on a map representing something meaningful to them (e.g., "my
 * community"). The drawing interface must work reliably on phones in multiple
 * countries, and the resulting data must be faithfully recorded. A broken
 * drawing experience means no data; a confusing one means noisy data.
 */

var googleMaps = require("./mocks/google-maps");
var qualtricsMock = require("./mocks/qualtrics");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

// Module under test -- will be created in src/drawing.js
var drawing = require("../src/drawing");

describe("map canvas creation", function () {
  test("creates a map element inside the provided container", function () {
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.1164,
      lng: -88.2434,
      zoom: 14,
    });
    // The map canvas div should exist in the container
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
    // The map should have been created with these center coordinates
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
});

describe("drawing controls", function () {
  var container, ctx;

  beforeEach(function () {
    container = document.createElement("div");
    ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
  });

  test("provides Draw, Stop, Reset, and Done buttons", function () {
    var buttons = drawing.createButtons(ctx);
    expect(buttons.draw).toBeDefined();
    expect(buttons.stop).toBeDefined();
    expect(buttons.reset).toBeDefined();
    expect(buttons.done).toBeDefined();
  });

  test("starts in drawing mode so the respondent can begin immediately", function () {
    // Respondents on phones should not have to figure out how to start.
    // Drawing mode should be active by default.
    expect(ctx.drawingManager._mode).toBe("polygon");
  });
});

describe("polygon drawing and management", function () {
  var container, ctx;

  beforeEach(function () {
    container = document.createElement("div");
    ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
  });

  test("records a completed polygon", function () {
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.1, -88.0),
      ],
    });
    drawing.addPolygon(ctx, poly);
    expect(ctx.polygons).toHaveLength(1);
  });

  test("can draw multiple polygons", function () {
    var poly1 = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.1, -88.0),
      ],
    });
    var poly2 = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(41.0, -87.0),
        new google.maps.LatLng(41.1, -87.1),
        new google.maps.LatLng(41.1, -87.0),
      ],
    });
    drawing.addPolygon(ctx, poly1);
    drawing.addPolygon(ctx, poly2);
    expect(ctx.polygons).toHaveLength(2);
  });

  test("reset clears all drawn polygons", function () {
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.1, -88.0),
      ],
    });
    drawing.addPolygon(ctx, poly);
    drawing.resetPolygons(ctx);
    expect(ctx.polygons).toHaveLength(0);
  });

  test("reset removes polygons from the map, not just from the array", function () {
    // Why: if polygons stay visible after reset, respondents see stale
    // drawings and get confused about what they are submitting.
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.1, -88.0),
      ],
    });
    poly.setMap(ctx.map);
    drawing.addPolygon(ctx, poly);
    drawing.resetPolygons(ctx);
    // setMap(null) removes a polygon from the visible map
    expect(poly._map).toBeNull();
  });

  test("deleting a specific polygon removes it but keeps others", function () {
    var poly1 = new google.maps.Polygon({
      paths: [new google.maps.LatLng(40.0, -88.0)],
    });
    var poly2 = new google.maps.Polygon({
      paths: [new google.maps.LatLng(41.0, -87.0)],
    });
    drawing.addPolygon(ctx, poly1);
    drawing.addPolygon(ctx, poly2);
    drawing.removePolygon(ctx, poly1);
    expect(ctx.polygons).toHaveLength(1);
    expect(ctx.polygons[0]).toBe(poly2);
    expect(poly1._map).toBeNull();
  });
});

describe("done action", function () {
  test("collects all polygon coordinates into a single string", function () {
    var container = document.createElement("div");
    var ctx = drawing.createMapCanvas(container, {
      lat: 40.0,
      lng: -88.0,
      zoom: 14,
    });
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.1, -88.0),
      ],
    });
    drawing.addPolygon(ctx, poly);
    var result = drawing.collectResult(ctx);
    expect(typeof result.coordinates).toBe("string");
    expect(result.coordinates.length).toBeGreaterThan(0);
  });

  test("records the zoom level in the result", function () {
    // Why: researchers need to know what zoom level the respondent saw,
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
});
