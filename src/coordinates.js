/**
 * Polygon coordinate serialization, deserialization, and export.
 *
 * Storage format: WKT (Well-Known Text), the standard for geometry in
 * tabular data. This is what gets stored in Qualtrics embedded data
 * and appears in the researcher's CSV export.
 *
 *   Single polygon:   POLYGON((-88.24 40.12, -88.23 40.11, -88.22 40.12, -88.24 40.12))
 *   Multiple:         MULTIPOLYGON(((-88 40, -88.1 40.1, -88 40)), ((-87 41, -87.1 41.1, -87 41)))
 *   Empty:            (empty string)
 *
 * WKT uses longitude-first coordinate order (x y = lng lat), same as
 * GeoJSON. All coordinates are in WGS84 (EPSG:4326).
 *
 * Why WKT instead of a custom format: every GIS tool reads WKT natively.
 * In R: sf::st_as_sfc(wkt, crs = 4326). In Python: shapely.wkt.loads(wkt).
 * In QGIS, PostGIS, etc. No custom parser needed.
 */

(function (exports) {
  // --- WKT formatting helpers ---

  /**
   * Format an array of [lng, lat] pairs as a WKT ring string.
   * Ensures the ring is closed (first == last) as WKT requires.
   */
  function formatWKTRing(coords) {
    var ring = coords.slice();
    if (
      ring.length > 0 &&
      (ring[0][0] !== ring[ring.length - 1][0] ||
        ring[0][1] !== ring[ring.length - 1][1])
    ) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    return ring
      .map(function (c) {
        return c[0] + " " + c[1];
      })
      .join(", ");
  }

  // --- WKT parsing helpers ---

  /**
   * Parse "x1 y1, x2 y2, ..." into [{lng, lat}, ...].
   */
  function parseWKTCoords(str) {
    return str.split(",").map(function (pair) {
      var parts = pair.trim().split(/\s+/);
      return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
    });
  }

  /**
   * Strip the closing vertex from a vertex array.
   * WKT rings repeat the first vertex; our internal arrays do not.
   */
  function stripClosingVertex(vertices) {
    if (
      vertices.length > 1 &&
      vertices[0].lat === vertices[vertices.length - 1].lat &&
      vertices[0].lng === vertices[vertices.length - 1].lng
    ) {
      return vertices.slice(0, -1);
    }
    return vertices;
  }

  // --- Serialization ---

  /**
   * Serialize an array of google.maps.Polygon objects to a WKT string.
   */
  function serializePolygons(polygons) {
    if (!polygons || polygons.length === 0) return "";

    function getCoords(poly) {
      return poly
        .getPath()
        .getArray()
        .map(function (latlng) {
          return [latlng.lng(), latlng.lat()];
        });
    }

    if (polygons.length === 1) {
      return "POLYGON((" + formatWKTRing(getCoords(polygons[0])) + "))";
    }

    var parts = polygons.map(function (poly) {
      return "((" + formatWKTRing(getCoords(poly)) + "))";
    });
    return "MULTIPOLYGON(" + parts.join(", ") + ")";
  }

  /**
   * Serialize an array of GeoJSON polygon features to a WKT string.
   *
   * Terra Draw produces GeoJSON features; this converts them to WKT
   * for storage in Qualtrics embedded data. Downstream R/Python code
   * reads WKT with standard libraries (sf::st_as_sfc, shapely.wkt.loads).
   */
  function serializeGeoJSONPolygons(features) {
    if (!features || features.length === 0) return "";

    var polygonFeatures = features.filter(function (f) {
      return f.geometry && f.geometry.type === "Polygon";
    });

    if (polygonFeatures.length === 0) return "";

    if (polygonFeatures.length === 1) {
      return (
        "POLYGON((" +
        formatWKTRing(polygonFeatures[0].geometry.coordinates[0]) +
        "))"
      );
    }

    var parts = polygonFeatures.map(function (f) {
      return "((" + formatWKTRing(f.geometry.coordinates[0]) + "))";
    });
    return "MULTIPOLYGON(" + parts.join(", ") + ")";
  }

  // --- Deserialization ---

  /**
   * Deserialize a WKT string into an array of polygon vertex arrays.
   * Each polygon is an array of {lat, lng} objects (closing vertex stripped).
   *
   * Supports POLYGON, MULTIPOLYGON, and empty strings.
   * Returns the outer ring only (holes are ignored for now).
   */
  function deserializePolygons(str) {
    if (!str || str.trim() === "") return [];
    str = str.trim();

    if (str === "GEOMETRYCOLLECTION EMPTY") return [];

    if (str.indexOf("MULTIPOLYGON") === 0) {
      // MULTIPOLYGON(((x1 y1, ..., x1 y1)), ((x2 y2, ..., x2 y2)))
      var body = str
        .replace(/^MULTIPOLYGON\s*\(/, "")
        .replace(/\)$/, "");
      // Split on "))" + optional whitespace/comma + "((" to separate polygons
      var polyStrings = body.split(/\)\)\s*,\s*\(\(/);
      return polyStrings.map(function (ps) {
        // Strip any remaining outer parens
        ps = ps.replace(/^\(+/, "").replace(/\)+$/, "");
        // Take only the outer ring (split on ring separator)
        var ringStr = ps.split(/\)\s*,\s*\(/)[0];
        return stripClosingVertex(parseWKTCoords(ringStr));
      });
    }

    if (str.indexOf("POLYGON") === 0) {
      // POLYGON((x1 y1, x2 y2, ..., x1 y1))
      var match = str.match(/^POLYGON\s*\(\((.+)\)\)\s*$/);
      if (!match) return [];
      // Take only the outer ring
      var ringStr = match[1].split(/\)\s*,\s*\(/)[0];
      return [stripClosingVertex(parseWKTCoords(ringStr))];
    }

    return [];
  }

  // --- GeoJSON export ---

  /**
   * Convert a WKT string to a GeoJSON FeatureCollection.
   *
   * GeoJSON is the lingua franca of spatial data on the web. R reads
   * it with sf::st_read(), Python with geopandas.read_file().
   */
  function toGeoJSON(wktString) {
    var polygons = deserializePolygons(wktString);

    var features = polygons.map(function (vertices, idx) {
      // GeoJSON coordinates are [lng, lat] arrays
      var coords = vertices.map(function (v) {
        return [v.lng, v.lat];
      });
      // GeoJSON polygon rings must be closed (first == last)
      if (
        coords.length > 0 &&
        (coords[0][0] !== coords[coords.length - 1][0] ||
          coords[0][1] !== coords[coords.length - 1][1])
      ) {
        coords.push([coords[0][0], coords[0][1]]);
      }

      return {
        type: "Feature",
        properties: { polygonIndex: idx },
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
      };
    });

    return {
      type: "FeatureCollection",
      crs: {
        type: "name",
        properties: { name: "EPSG:4326" },
      },
      features: features,
    };
  }

  /**
   * Return metadata about the coordinate reference system.
   */
  function getCRS() {
    return { epsg: 4326, name: "WGS84" };
  }

  /**
   * Assemble a complete export record for one respondent.
   * Collects everything the researcher needs in one object.
   */
  function buildExportRecord(opts) {
    var record = {
      coordinates: opts.coordinateString || "",
      zoom: opts.zoom,
      centerLat: opts.center ? opts.center.lat : null,
      centerLng: opts.center ? opts.center.lng : null,
      crs: "EPSG:4326",
    };
    if (opts.assignments) {
      var keys = Object.keys(opts.assignments);
      for (var i = 0; i < keys.length; i++) {
        record[keys[i]] = opts.assignments[keys[i]];
      }
    }
    return record;
  }

  exports.serializePolygons = serializePolygons;
  exports.serializeGeoJSONPolygons = serializeGeoJSONPolygons;
  exports.deserializePolygons = deserializePolygons;
  exports.toGeoJSON = toGeoJSON;
  exports.getCRS = getCRS;
  exports.buildExportRecord = buildExportRecord;
})(typeof module !== "undefined" ? module.exports : (this.QMCoordinates = {}));
