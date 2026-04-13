/**
 * Tests for polygon coordinate serialization and deserialization.
 *
 * Why these matter: The coordinate string is the primary data product of this
 * tool. It flows from the respondent's drawing into Qualtrics embedded data,
 * then into the researcher's R or Python analysis. If serialization is lossy,
 * ambiguous, or hard to parse downstream, the research data is compromised.
 *
 * The format must be:
 *   - Unambiguous: a parser can reconstruct exactly the polygons that were drawn
 *   - Precise: no rounding that would shift boundaries at neighborhood scale
 *   - Easy to parse in R and Python without specialized GIS libraries
 *   - Able to represent multiple polygons (a respondent might draw several areas)
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

// The module under test -- will be created in src/coordinates.js
var coordinates = require("../src/coordinates");

describe("serializePolygons", function () {
  test("serializes a single triangle to 'lon lat,lon lat,lon lat'", function () {
    // A triangle in Champaign, IL
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.1164, -88.2434),
        new google.maps.LatLng(40.1064, -88.2334),
        new google.maps.LatLng(40.1164, -88.2234),
      ],
    });
    var result = coordinates.serializePolygons([poly]);
    expect(result).toBe("-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164");
  });

  test("serializes multiple polygons separated by semicolons", function () {
    var poly1 = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
      ],
    });
    var poly2 = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(41.0, -87.0),
        new google.maps.LatLng(41.1, -87.1),
      ],
    });
    var result = coordinates.serializePolygons([poly1, poly2]);
    expect(result).toBe("-88 40,-88.1 40.1;-87 41,-87.1 41.1");
  });

  test("returns empty string when no polygons are drawn", function () {
    var result = coordinates.serializePolygons([]);
    expect(result).toBe("");
  });

  test("preserves enough decimal places for neighborhood-level precision", function () {
    // 5 decimal places ~ 1.1 meters. Rounding to fewer would blur
    // boundaries at the scale respondents draw neighborhoods.
    var poly = new google.maps.Polygon({
      paths: [new google.maps.LatLng(40.11641, -88.24342)],
    });
    var result = coordinates.serializePolygons([poly]);
    expect(result).toContain("40.11641");
    expect(result).toContain("-88.24342");
  });
});

describe("deserializePolygons", function () {
  test("parses a coordinate string back into an array of polygon vertex arrays", function () {
    var input = "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164";
    var result = coordinates.deserializePolygons(input);
    // Should return array of polygons, each polygon is array of {lat, lng}
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3);
    expect(result[0][0].lat).toBeCloseTo(40.1164, 4);
    expect(result[0][0].lng).toBeCloseTo(-88.2434, 4);
  });

  test("parses multiple polygons separated by semicolons", function () {
    var input = "-88 40,-88.1 40.1;-87 41,-87.1 41.1";
    var result = coordinates.deserializePolygons(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(2);
  });

  test("returns empty array for empty string", function () {
    var result = coordinates.deserializePolygons("");
    expect(result).toEqual([]);
  });

  test("round-trips without loss: serialize then deserialize recovers the vertices", function () {
    var original = [
      new google.maps.Polygon({
        paths: [
          new google.maps.LatLng(40.11641, -88.24342),
          new google.maps.LatLng(40.10001, -88.20002),
          new google.maps.LatLng(40.12003, -88.21004),
        ],
      }),
    ];
    var serialized = coordinates.serializePolygons(original);
    var recovered = coordinates.deserializePolygons(serialized);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toHaveLength(3);
    expect(recovered[0][0].lat).toBeCloseTo(40.11641, 4);
    expect(recovered[0][0].lng).toBeCloseTo(-88.24342, 4);
    expect(recovered[0][2].lat).toBeCloseTo(40.12003, 4);
    expect(recovered[0][2].lng).toBeCloseTo(-88.21004, 4);
  });
});

describe("output format for downstream analysis", function () {
  // Why: researchers will paste coordinate strings into R or Python.
  // The format must be parseable without specialized GIS libraries.

  test("toGeoJSON converts polygons to a GeoJSON FeatureCollection", function () {
    // GeoJSON is the lingua franca of spatial data. R (sf::st_read) and
    // Python (geopandas.read_file) both parse it natively.
    var input = "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164";
    var geojson = coordinates.toGeoJSON(input);

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.type).toBe("Polygon");
    // GeoJSON polygon rings must be closed (first vertex == last vertex)
    var ring = geojson.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  test("toGeoJSON handles multiple polygons as separate features", function () {
    var input = "-88 40,-88.1 40.1,-88 40.1;-87 41,-87.1 41.1,-87 41.1";
    var geojson = coordinates.toGeoJSON(input);
    expect(geojson.features).toHaveLength(2);
  });

  test("toGeoJSON uses [longitude, latitude] order per the GeoJSON spec", function () {
    var input = "-88.2434 40.1164";
    var geojson = coordinates.toGeoJSON(input);
    var coord = geojson.features[0].geometry.coordinates[0][0];
    // GeoJSON: [lng, lat]
    expect(coord[0]).toBeCloseTo(-88.2434, 4);
    expect(coord[1]).toBeCloseTo(40.1164, 4);
  });
});
