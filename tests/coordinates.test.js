/**
 * Tests for polygon coordinate serialization and deserialization.
 *
 * Why these matter: The coordinate string is the primary data product of this
 * tool. It flows from the respondent's drawing into Qualtrics embedded data,
 * then into the researcher's R or Python analysis. The format is WKT
 * (Well-Known Text), a standard that every GIS tool reads natively:
 *   - R: sf::st_as_sfc(wkt, crs = 4326)
 *   - Python: shapely.wkt.loads(wkt)
 *   - QGIS, PostGIS, etc.: native support
 *
 * No custom parser needed. A collaborator receiving the Qualtrics CSV
 * can immediately work with the geometry column.
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

var coordinates = require("../src/coordinates");

describe("serializePolygons (Google Maps objects to WKT)", function () {
  test("serializes a single triangle as POLYGON WKT", function () {
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.1164, -88.2434),
        new google.maps.LatLng(40.1064, -88.2334),
        new google.maps.LatLng(40.1164, -88.2234),
      ],
    });
    var result = coordinates.serializePolygons([poly]);
    expect(result).toBe(
      "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
    );
  });

  test("serializes multiple polygons as MULTIPOLYGON WKT", function () {
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
    expect(result).toContain("MULTIPOLYGON(");
    // Each polygon wrapped in double parens
    expect(result).toContain("((-88 40");
    expect(result).toContain("((-87 41");
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

  test("WKT ring is closed (first vertex repeated at end)", function () {
    var poly = new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(40.0, -88.0),
        new google.maps.LatLng(40.1, -88.1),
        new google.maps.LatLng(40.0, -88.1),
      ],
    });
    var result = coordinates.serializePolygons([poly]);
    // The ring should start and end with the same vertex
    var match = result.match(/^POLYGON\(\((.+)\)\)$/);
    var coords = match[1].split(", ");
    expect(coords[0]).toBe(coords[coords.length - 1]);
  });
});

describe("deserializePolygons (WKT to vertex arrays)", function () {
  test("parses POLYGON WKT into a single polygon vertex array", function () {
    var input =
      "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))";
    var result = coordinates.deserializePolygons(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3); // closing vertex stripped
    expect(result[0][0].lat).toBeCloseTo(40.1164, 4);
    expect(result[0][0].lng).toBeCloseTo(-88.2434, 4);
  });

  test("parses MULTIPOLYGON WKT into multiple polygon vertex arrays", function () {
    var input =
      "MULTIPOLYGON(((-88 40, -88.1 40.1, -88 40)), ((-87 41, -87.1 41.1, -87 41)))";
    var result = coordinates.deserializePolygons(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(2);
  });

  test("returns empty array for empty string", function () {
    var result = coordinates.deserializePolygons("");
    expect(result).toEqual([]);
  });

  test("returns empty array for GEOMETRYCOLLECTION EMPTY", function () {
    var result = coordinates.deserializePolygons("GEOMETRYCOLLECTION EMPTY");
    expect(result).toEqual([]);
  });

  test("round-trips without loss: serialize then deserialize recovers vertices", function () {
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

describe("GeoJSON export from WKT", function () {
  // Why: researchers may also want GeoJSON for web visualizations
  // or for tools that prefer JSON over WKT.

  test("toGeoJSON converts POLYGON WKT to a GeoJSON FeatureCollection", function () {
    var input =
      "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))";
    var geojson = coordinates.toGeoJSON(input);

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.type).toBe("Polygon");
    // GeoJSON polygon rings must be closed
    var ring = geojson.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  test("toGeoJSON handles MULTIPOLYGON as separate features", function () {
    var input =
      "MULTIPOLYGON(((-88 40, -88.1 40.1, -88 40.1, -88 40)), ((-87 41, -87.1 41.1, -87 41.1, -87 41)))";
    var geojson = coordinates.toGeoJSON(input);
    expect(geojson.features).toHaveLength(2);
  });

  test("toGeoJSON uses [longitude, latitude] order per the GeoJSON spec", function () {
    var input =
      "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2434 40.1164))";
    var geojson = coordinates.toGeoJSON(input);
    var coord = geojson.features[0].geometry.coordinates[0][0];
    // GeoJSON: [lng, lat]
    expect(coord[0]).toBeCloseTo(-88.2434, 4);
    expect(coord[1]).toBeCloseTo(40.1164, 4);
  });
});

describe("serializeGeoJSONPolygons (GeoJSON features to WKT)", function () {
  // Why: Terra Draw produces GeoJSON features, but the storage format
  // is WKT. This bridges the two. The output must be valid WKT that
  // R (sf::st_as_sfc) and Python (shapely.wkt.loads) can parse.

  test("serializes a single GeoJSON polygon as POLYGON WKT", function () {
    var features = [
      {
        id: "1",
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-88.2434, 40.1164],
              [-88.2334, 40.1064],
              [-88.2234, 40.1164],
              [-88.2434, 40.1164],
            ],
          ],
        },
        properties: { mode: "polygon" },
      },
    ];
    var result = coordinates.serializeGeoJSONPolygons(features);
    expect(result).toBe(
      "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
    );
  });

  test("serializes multiple GeoJSON polygons as MULTIPOLYGON WKT", function () {
    var features = [
      {
        id: "1",
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-88.0, 40.0],
              [-88.1, 40.1],
              [-88.0, 40.0],
            ],
          ],
        },
        properties: {},
      },
      {
        id: "2",
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-87.0, 41.0],
              [-87.1, 41.1],
              [-87.0, 41.0],
            ],
          ],
        },
        properties: {},
      },
    ];
    var result = coordinates.serializeGeoJSONPolygons(features);
    expect(result).toContain("MULTIPOLYGON(");
  });

  test("returns empty string for empty feature array", function () {
    expect(coordinates.serializeGeoJSONPolygons([])).toBe("");
  });

  test("preserves decimal precision for neighborhood-scale accuracy", function () {
    var features = [
      {
        id: "1",
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-88.24342, 40.11641],
              [-88.23342, 40.10641],
              [-88.24342, 40.11641],
            ],
          ],
        },
        properties: {},
      },
    ];
    var result = coordinates.serializeGeoJSONPolygons(features);
    expect(result).toContain("40.11641");
    expect(result).toContain("-88.24342");
  });

  test("round-trips with deserializePolygons", function () {
    var features = [
      {
        id: "1",
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-88.2434, 40.1164],
              [-88.2334, 40.1064],
              [-88.2234, 40.1164],
              [-88.2434, 40.1164],
            ],
          ],
        },
        properties: {},
      },
    ];
    var serialized = coordinates.serializeGeoJSONPolygons(features);
    var recovered = coordinates.deserializePolygons(serialized);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toHaveLength(3);
    expect(recovered[0][0].lng).toBeCloseTo(-88.2434, 4);
    expect(recovered[0][0].lat).toBeCloseTo(40.1164, 4);
  });

  test("filters out non-polygon features", function () {
    var features = [
      {
        id: "1",
        type: "Feature",
        geometry: { type: "Point", coordinates: [-88.0, 40.0] },
        properties: { mode: "point" },
      },
      {
        id: "2",
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-88.0, 40.0],
              [-88.1, 40.1],
              [-88.0, 40.1],
              [-88.0, 40.0],
            ],
          ],
        },
        properties: { mode: "polygon" },
      },
    ];
    var result = coordinates.serializeGeoJSONPolygons(features);
    expect(result).toContain("POLYGON(");
    expect(result).not.toContain("MULTIPOLYGON");
  });
});
