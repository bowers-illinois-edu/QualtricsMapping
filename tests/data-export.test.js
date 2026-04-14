/**
 * Tests for data export -- getting drawing data out of the survey and into
 * a researcher's analysis pipeline.
 *
 * Why these matter: The whole point of this tool is to produce data for
 * analysis. The researcher downloads a CSV from Qualtrics where one column
 * contains a WKT geometry string. That string must be:
 *   - In a known coordinate reference system (CRS)
 *   - Parseable by standard GIS tools (sf, shapely, QGIS, PostGIS)
 *   - Accompanied by all experimental metadata (zoom, assignments, etc.)
 *
 * Google Maps uses WGS84 (EPSG:4326) for all coordinates. The WKT output
 * must document this so researchers set the CRS correctly.
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

var coordinates = require("../src/coordinates");

describe("coordinate reference system", function () {
  test("exported coordinates are in WGS84 (EPSG:4326)", function () {
    var crs = coordinates.getCRS();
    expect(crs.epsg).toBe(4326);
    expect(crs.name).toBe("WGS84");
  });

  test("GeoJSON output includes a CRS property for clarity", function () {
    var input =
      "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))";
    var geojson = coordinates.toGeoJSON(input);
    expect(geojson.crs).toBeDefined();
    expect(geojson.crs.properties.name).toContain("4326");
  });
});

describe("full export record", function () {
  test("buildExportRecord assembles all data a researcher needs per respondent", function () {
    var wkt =
      "POLYGON((-88 40, -88.1 40.1, -88 40.1, -88 40))";
    var record = coordinates.buildExportRecord({
      coordinateString: wkt,
      zoom: 14,
      assignments: { overlayCondition: "ward_boundary", showTraffic: true },
      center: { lat: 40.05, lng: -88.05 },
    });

    expect(record.coordinates).toBe(wkt);
    expect(record.zoom).toBe(14);
    expect(record.centerLat).toBeCloseTo(40.05, 2);
    expect(record.centerLng).toBeCloseTo(-88.05, 2);
    expect(record.crs).toBe("EPSG:4326");
    expect(record.overlayCondition).toBe("ward_boundary");
    expect(record.showTraffic).toBe(true);
  });

  test("export record is JSON-serializable for Qualtrics embedded data", function () {
    var wkt = "POLYGON((-88 40, -88.1 40.1, -88 40))";
    var record = coordinates.buildExportRecord({
      coordinateString: wkt,
      zoom: 12,
      assignments: {},
      center: { lat: 40.0, lng: -88.0 },
    });
    var json = JSON.stringify(record);
    var parsed = JSON.parse(json);
    expect(parsed.coordinates).toBe(record.coordinates);
    expect(parsed.crs).toBe("EPSG:4326");
  });
});

describe("WKT format documentation", function () {
  // These tests serve as executable documentation. A researcher
  // reading these tests should understand exactly what the MapDrawing
  // column in their Qualtrics CSV contains.

  test("a single polygon is stored as POLYGON WKT", function () {
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.2, -88.0),
      ],
    });
    var result = coordinates.serializePolygons([poly]);
    expect(result).toMatch(/^POLYGON\(\(.*\)\)$/);
  });

  test("coordinates use longitude-first order (WKT x y = lng lat)", function () {
    var poly = new google.maps.Polygon({
      paths: [new google.maps.LatLng(40.1164, -88.2434)],
    });
    var result = coordinates.serializePolygons([poly]);
    // In WKT, the first number in each pair is x (longitude)
    expect(result).toContain("-88.2434 40.1164");
  });

  test("multiple polygons are stored as MULTIPOLYGON WKT", function () {
    var poly1 = new google.maps.Polygon({
      paths: [new google.maps.LatLng(40.0, -88.0)],
    });
    var poly2 = new google.maps.Polygon({
      paths: [new google.maps.LatLng(41.0, -87.0)],
    });
    var result = coordinates.serializePolygons([poly1, poly2]);
    expect(result).toMatch(/^MULTIPOLYGON\(.*\)$/);
  });

  test("R can parse the WKT: sf::st_as_sfc(wkt, crs = 4326)", function () {
    // This test documents the R one-liner. The actual parsing is tested
    // in tests/R/. Here we just verify the WKT is well-formed enough
    // that it starts with a recognized WKT type keyword.
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.0, -88.1),
      ],
    });
    var wkt = coordinates.serializePolygons([poly]);
    // WKT must start with a geometry type keyword
    expect(wkt).toMatch(/^(POLYGON|MULTIPOLYGON)\(/);
    // Coordinates must be numeric pairs separated by commas
    var inner = wkt.replace(/^.*\(\(/, "").replace(/\)\).*$/, "");
    var pairs = inner.split(", ");
    pairs.forEach(function (pair) {
      var parts = pair.split(" ");
      expect(parts).toHaveLength(2);
      expect(isNaN(parseFloat(parts[0]))).toBe(false);
      expect(isNaN(parseFloat(parts[1]))).toBe(false);
    });
  });
});
