/**
 * Tests for data export -- getting drawing data out of the survey and into
 * a researcher's analysis pipeline.
 *
 * Why these matter: The whole point of this tool is to produce data for
 * analysis. The researcher downloads a CSV from Qualtrics where one column
 * contains the coordinate string. That string must be:
 *   - In a known coordinate reference system (CRS)
 *   - Parseable without ambiguity
 *   - Convertible to standard spatial formats (GeoJSON, WKT, sf, geopandas)
 *   - Accompanied by all experimental metadata (zoom, assignments, etc.)
 *
 * Google Maps uses WGS84 (EPSG:4326) for all coordinates. Our serialization
 * format must document this so researchers set the CRS correctly when
 * importing into R (sf) or Python (geopandas/shapely).
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
    // Google Maps API returns coordinates in WGS84. Our serialization
    // must not transform them. This test documents the CRS so downstream
    // code can set it correctly.
    var crs = coordinates.getCRS();
    expect(crs.epsg).toBe(4326);
    expect(crs.name).toBe("WGS84");
  });

  test("GeoJSON output includes a CRS property for clarity", function () {
    // While GeoJSON RFC 7946 assumes WGS84, being explicit helps
    // researchers who might not know the convention.
    var input = "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164";
    var geojson = coordinates.toGeoJSON(input);
    expect(geojson.crs).toBeDefined();
    expect(geojson.crs.properties.name).toContain("4326");
  });
});

describe("full export record", function () {
  test("buildExportRecord assembles all data a researcher needs per respondent", function () {
    // Why: one function to collect everything, so nothing is forgotten.
    // The researcher's R/Python code calls this once and gets a complete row.
    var record = coordinates.buildExportRecord({
      coordinateString: "-88 40,-88.1 40.1,-88 40.1",
      zoom: 14,
      assignments: { overlayCondition: "ward_boundary", showTraffic: true },
      center: { lat: 40.05, lng: -88.05 },
    });

    expect(record.coordinates).toBe("-88 40,-88.1 40.1,-88 40.1");
    expect(record.zoom).toBe(14);
    expect(record.centerLat).toBeCloseTo(40.05, 2);
    expect(record.centerLng).toBeCloseTo(-88.05, 2);
    expect(record.crs).toBe("EPSG:4326");
    expect(record.overlayCondition).toBe("ward_boundary");
    expect(record.showTraffic).toBe(true);
  });

  test("export record is JSON-serializable for Qualtrics embedded data", function () {
    var record = coordinates.buildExportRecord({
      coordinateString: "-88 40,-88.1 40.1",
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

describe("coordinate string format documentation", function () {
  // These tests serve as executable documentation of the format.
  // A researcher reading these tests should understand exactly how
  // to parse the string in their language of choice.

  test("vertices within a polygon are comma-separated", function () {
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.2, -88.0),
      ],
    });
    var result = coordinates.serializePolygons([poly]);
    var vertices = result.split(",");
    expect(vertices).toHaveLength(3);
  });

  test("each vertex is 'longitude<space>latitude' (note: lon first)", function () {
    var poly = new google.maps.Polygon({
      paths: [new google.maps.LatLng(40.1164, -88.2434)],
    });
    var result = coordinates.serializePolygons([poly]);
    var parts = result.split(" ");
    // First value is longitude, second is latitude
    expect(parseFloat(parts[0])).toBeCloseTo(-88.2434, 4);
    expect(parseFloat(parts[1])).toBeCloseTo(40.1164, 4);
  });

  test("multiple polygons are semicolon-separated", function () {
    var poly1 = new google.maps.Polygon({
      paths: [new google.maps.LatLng(40.0, -88.0)],
    });
    var poly2 = new google.maps.Polygon({
      paths: [new google.maps.LatLng(41.0, -87.0)],
    });
    var result = coordinates.serializePolygons([poly1, poly2]);
    var polygons = result.split(";");
    expect(polygons).toHaveLength(2);
  });
});
