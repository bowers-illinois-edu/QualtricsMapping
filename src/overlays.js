/**
 * Map overlays: GeoJSON boundaries, Google Maps layers, and spatial lookup.
 *
 * Overlays are the experimental treatment in many study designs. A researcher
 * provides boundary data (e.g., census tract or voting ward boundaries as
 * GeoJSON) and the tool displays the relevant boundary on the respondent's map.
 *
 * The spatial lookup (findContainingFeature) determines which boundary to show
 * based on the respondent's geocoded location. This is a point-in-polygon
 * operation implemented with ray casting so we do not need an external library.
 */

(function (exports) {
  // --- Point-in-polygon via ray casting ---

  /**
   * Test whether a point is inside a polygon ring (array of [lng, lat] pairs).
   * Uses the ray casting algorithm.
   */
  function pointInRing(point, ring) {
    var x = point.lng;
    var y = point.lat;
    var inside = false;

    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0],
        yi = ring[i][1];
      var xj = ring[j][0],
        yj = ring[j][1];

      var intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Test whether a point is inside a GeoJSON geometry (Polygon or MultiPolygon).
   */
  function pointInGeometry(point, geometry) {
    if (geometry.type === "Polygon") {
      // First ring is outer boundary; subsequent rings are holes
      var inOuter = pointInRing(point, geometry.coordinates[0]);
      if (!inOuter) return false;
      // Check holes
      for (var h = 1; h < geometry.coordinates.length; h++) {
        if (pointInRing(point, geometry.coordinates[h])) return false;
      }
      return true;
    } else if (geometry.type === "MultiPolygon") {
      // Point is inside if it is inside any of the component polygons
      for (var p = 0; p < geometry.coordinates.length; p++) {
        var polyGeom = {
          type: "Polygon",
          coordinates: geometry.coordinates[p],
        };
        if (pointInGeometry(point, polyGeom)) return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Find the first GeoJSON feature whose geometry contains the point.
   * Returns the feature object, or null if none contains the point.
   */
  function findContainingFeature(geojson, point) {
    var features = geojson.features || [];
    for (var i = 0; i < features.length; i++) {
      if (pointInGeometry(point, features[i].geometry)) {
        return features[i];
      }
    }
    return null;
  }

  /**
   * Find ALL GeoJSON features whose geometry contains the point.
   * Returns an array (possibly empty).
   */
  function findContainingFeatures(geojson, point) {
    var features = geojson.features || [];
    var results = [];
    for (var i = 0; i < features.length; i++) {
      if (pointInGeometry(point, features[i].geometry)) {
        results.push(features[i]);
      }
    }
    return results;
  }

  // --- Google Maps Data Layer ---

  /**
   * Add GeoJSON data to a Google Map as a Data layer.
   * Returns the Data layer object.
   *
   * @param {google.maps.Map} map
   * @param {object} geojson - GeoJSON FeatureCollection
   * @param {object} opts - Optional: { style: { fillColor, fillOpacity, ... } }
   */
  function addGeoJSON(map, geojson, opts) {
    var dataLayer = new google.maps.Data();
    dataLayer.addGeoJson(geojson);
    dataLayer.setMap(map);

    if (opts && opts.style) {
      dataLayer.setStyle(opts.style);
    }

    return dataLayer;
  }

  // --- Google Maps built-in layers ---

  var LAYER_CONSTRUCTORS = {
    traffic: function () {
      return new google.maps.TrafficLayer();
    },
  };

  /**
   * Add a named Google Maps layer (e.g., "traffic") to the map.
   */
  function addLayer(map, layerName) {
    var ctor = LAYER_CONSTRUCTORS[layerName];
    if (!ctor) {
      throw new Error("Unknown layer type: " + layerName);
    }
    var layer = ctor();
    layer.setMap(map);
    return layer;
  }

  /**
   * Remove a layer from the map.
   */
  function removeLayer(layer) {
    layer.setMap(null);
  }

  // --- Randomized condition assignment ---

  /**
   * Assign one overlay condition from a set, optionally seeded.
   *
   * @param {object} conditions - Keys are condition names, values are
   *   overlay data (GeoJSON, null for control, etc.)
   * @param {object} opts - Optional: { seed: "respondent-id" }
   * @returns {{ conditionName: string, overlayData: * }}
   */
  function assignCondition(conditions, opts) {
    var keys = Object.keys(conditions);
    var idx;

    if (opts && opts.seed != null) {
      // Deterministic selection using a simple hash
      var hash = 5381;
      var seedStr = String(opts.seed);
      for (var i = 0; i < seedStr.length; i++) {
        hash = ((hash << 5) + hash + seedStr.charCodeAt(i)) | 0;
      }
      idx = Math.abs(hash) % keys.length;
    } else {
      idx = Math.floor(Math.random() * keys.length);
    }

    var name = keys[idx];
    return {
      conditionName: name,
      overlayData: conditions[name],
    };
  }

  exports.pointInRing = pointInRing;
  exports.pointInGeometry = pointInGeometry;
  exports.findContainingFeature = findContainingFeature;
  exports.findContainingFeatures = findContainingFeatures;
  exports.addGeoJSON = addGeoJSON;
  exports.addLayer = addLayer;
  exports.removeLayer = removeLayer;
  exports.assignCondition = assignCondition;
})(typeof module !== "undefined" ? module.exports : (this.QMOverlays = {}));
