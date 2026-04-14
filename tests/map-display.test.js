/**
 * Tests for displaying previously drawn polygons on a review map.
 *
 * Why these matter: After drawing, the respondent sees their map again and
 * answers questions about it. If the displayed map misrepresents what they
 * drew (wrong polygons, wrong bounds, wrong zoom), their answers are about
 * a different stimulus than intended. The display must faithfully reproduce
 * the drawing.
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

var display = require("../src/display");

describe("polygon display", function () {
  test("renders polygons from a WKT string onto a map", function () {
    var container = document.createElement("div");
    var wkt =
      "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))";
    var ctx = display.showMap(container, wkt);
    expect(ctx.map).toBeDefined();
    expect(ctx.polygons).toHaveLength(1);
    expect(ctx.polygons[0]._map).toBe(ctx.map);
  });

  test("renders multiple polygons from MULTIPOLYGON WKT", function () {
    var container = document.createElement("div");
    var wkt =
      "MULTIPOLYGON(((-88 40, -88.1 40.1, -88 40.1, -88 40)), ((-87 41, -87.1 41.1, -87 41.1, -87 41)))";
    var ctx = display.showMap(container, wkt);
    expect(ctx.polygons).toHaveLength(2);
  });

  test("display map is non-interactive (no dragging, no zoom controls)", function () {
    // The review map is a stimulus, not a tool. Letting the
    // respondent pan away from their drawing defeats the purpose.
    var container = document.createElement("div");
    var wkt =
      "POLYGON((-88 40, -88.1 40.1, -88 40.1, -88 40))";
    var ctx = display.showMap(container, wkt);
    expect(ctx.map._options.draggable).toBe(false);
    expect(ctx.map._options.disableDefaultUI).toBe(true);
    expect(ctx.map._options.scrollwheel).toBe(false);
  });

  test("handles empty coordinate string without crashing", function () {
    // A respondent might click Done without drawing. The review page
    // should not break.
    var container = document.createElement("div");
    var ctx = display.showMap(container, "");
    expect(ctx.polygons).toHaveLength(0);
  });
});
