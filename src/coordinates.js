/**
 * Polygon coordinate serialization, deserialization, and export.
 *
 * Format: "lon lat,lon lat,lon lat;lon lat,lon lat,lon lat"
 *   - Each vertex is "longitude<space>latitude" (lon first, matching GeoJSON convention)
 *   - Commas separate vertices within a polygon
 *   - Semicolons separate multiple polygons
 *
 * All coordinates are in WGS84 (EPSG:4326), which is what Google Maps uses.
 */

(function (exports) {
  /**
   * Serialize an array of google.maps.Polygon objects to a coordinate string.
   */
  function serializePolygons(polygons) {
    if (!polygons || polygons.length === 0) return "";

    return polygons
      .map(function (poly) {
        return poly
          .getPath()
          .getArray()
          .map(function (latlng) {
            return latlng.lng() + " " + latlng.lat();
          })
          .join(",");
      })
      .join(";");
  }

  /**
   * Deserialize a coordinate string into an array of polygon vertex arrays.
   * Each polygon is an array of {lat, lng} objects.
   */
  function deserializePolygons(str) {
    if (!str || str.trim() === "") return [];

    return str.split(";").map(function (polyStr) {
      return polyStr.split(",").map(function (vertexStr) {
        var parts = vertexStr.trim().split(" ");
        return {
          lng: parseFloat(parts[0]),
          lat: parseFloat(parts[1]),
        };
      });
    });
  }

  /**
   * Convert a coordinate string to a GeoJSON FeatureCollection.
   *
   * Why GeoJSON: it is the lingua franca of spatial data. R reads it with
   * sf::st_read(), Python with geopandas.read_file(). No specialized
   * parsers needed.
   */
  function toGeoJSON(coordinateString) {
    var polygons = deserializePolygons(coordinateString);

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
    // Flatten assignment fields into the record
    if (opts.assignments) {
      var keys = Object.keys(opts.assignments);
      for (var i = 0; i < keys.length; i++) {
        record[keys[i]] = opts.assignments[keys[i]];
      }
    }
    return record;
  }

  exports.serializePolygons = serializePolygons;
  exports.deserializePolygons = deserializePolygons;
  exports.toGeoJSON = toGeoJSON;
  exports.getCRS = getCRS;
  exports.buildExportRecord = buildExportRecord;
})(typeof module !== "undefined" ? module.exports : (this.QMCoordinates = {}));
