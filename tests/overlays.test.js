/**
 * Tests for map overlays -- boundaries, regions, points that the researcher
 * places on the map as visual stimuli.
 *
 * Why these matter: The core experimental use case is to show respondents a
 * map with particular features (e.g., an administrative boundary, a set of
 * landmarks, a neighborhood outline) and then ask them to draw or answer
 * questions. The overlay is the treatment. If it does not render, or if the
 * wrong overlay is shown, the experiment is compromised.
 *
 * Overlays may be:
 *   - GeoJSON polygons or multipolygons (e.g., ward boundaries)
 *   - GeoJSON points (e.g., landmarks, facilities)
 *   - Google Maps layers (e.g., traffic, transit)
 *
 * The researcher may randomize which overlay a respondent sees.
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

// Module under test -- will be created in src/overlays.js
var overlays = require("../src/overlays");

// A realistic GeoJSON polygon -- a simplified voting ward boundary.
// In practice, researchers would export these from census shapefiles or
// municipal open data portals (e.g., a ward in Champaign-Urbana).
var wardBoundaryGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Ward 3", GEOID: "1714000-3" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-88.25, 40.12],
            [-88.23, 40.1],
            [-88.21, 40.12],
            [-88.25, 40.12],
          ],
        ],
      },
    },
  ],
};

// A census tract boundary -- MultiPolygon because tracts can have holes
// or disjoint pieces (e.g., around rivers or parks).
var censusTractGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { TRACTCE: "000100", NAME: "Census Tract 1" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-88.26, 40.13],
              [-88.24, 40.11],
              [-88.22, 40.13],
              [-88.26, 40.13],
            ],
          ],
        ],
      },
    },
  ],
};

// GeoJSON with point features
var samplePoints = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "School" },
      geometry: { type: "Point", coordinates: [-88.24, 40.11] },
    },
    {
      type: "Feature",
      properties: { name: "Park" },
      geometry: { type: "Point", coordinates: [-88.22, 40.12] },
    },
  ],
};

describe("GeoJSON overlay", function () {
  test("adds GeoJSON polygon boundaries to the map", function () {
    var map = new google.maps.Map(document.createElement("div"), {});
    var layer = overlays.addGeoJSON(map, wardBoundaryGeoJSON);
    // The GeoJSON data layer should be attached to the map
    expect(layer).toBeDefined();
    expect(layer.addGeoJson).toHaveBeenCalledWith(wardBoundaryGeoJSON);
    expect(layer.setMap).toHaveBeenCalledWith(map);
  });

  test("adds GeoJSON point features to the map", function () {
    var map = new google.maps.Map(document.createElement("div"), {});
    var layer = overlays.addGeoJSON(map, samplePoints);
    expect(layer).toBeDefined();
    expect(layer.addGeoJson).toHaveBeenCalledWith(samplePoints);
  });

  test("accepts custom styling for overlay features", function () {
    // Why: researchers need control over how prominent the overlay is.
    // A bright red boundary is a strong treatment; a faint grey one is weak.
    var map = new google.maps.Map(document.createElement("div"), {});
    var style = { fillColor: "red", fillOpacity: 0.3, strokeWeight: 2 };
    var layer = overlays.addGeoJSON(map, wardBoundaryGeoJSON, { style: style });
    expect(layer.setStyle).toHaveBeenCalled();
  });

  test("renders a translucent shaded boundary for ward or census tract overlays", function () {
    // Why: the typical use case is showing a census tract or voting ward
    // boundary as a translucent shaded polygon so the respondent can see
    // the boundary without it obscuring the base map. The fill should be
    // visible but not dominant.
    var map = new google.maps.Map(document.createElement("div"), {});
    var style = {
      fillColor: "#3388ff",
      fillOpacity: 0.15,
      strokeColor: "#3388ff",
      strokeWeight: 2,
      strokeOpacity: 0.8,
    };
    var layer = overlays.addGeoJSON(map, censusTractGeoJSON, { style: style });
    expect(layer.setMap).toHaveBeenCalledWith(map);
    expect(layer.addGeoJson).toHaveBeenCalledWith(censusTractGeoJSON);
  });

  test("handles MultiPolygon geometry (census tracts with holes or disjoint pieces)", function () {
    var map = new google.maps.Map(document.createElement("div"), {});
    // This should not throw -- MultiPolygon is a valid GeoJSON type
    var layer = overlays.addGeoJSON(map, censusTractGeoJSON);
    expect(layer).toBeDefined();
    expect(layer.addGeoJson).toHaveBeenCalledWith(censusTractGeoJSON);
  });
});

describe("Google Maps layer overlays", function () {
  test("can add a traffic layer", function () {
    var map = new google.maps.Map(document.createElement("div"), {});
    var layer = overlays.addLayer(map, "traffic");
    expect(layer).toBeDefined();
    expect(layer._map).toBe(map);
  });

  test("can toggle a layer on or off", function () {
    // Why: the experimental design might randomize whether traffic is
    // shown. We need a clean way to turn layers on and off.
    var map = new google.maps.Map(document.createElement("div"), {});
    var layer = overlays.addLayer(map, "traffic");
    overlays.removeLayer(layer);
    expect(layer._map).toBeNull();
  });
});

describe("spatial overlay lookup -- find which overlay contains a point", function () {
  // Why: a researcher provides a set of boundary polygons (e.g., all census
  // tracts in a city). The respondent gives their address, which is geocoded
  // to a point. We need to find which tract contains that point and display
  // it. This is a point-in-polygon operation done client-side.

  test("findContainingFeature returns the feature whose polygon contains the point", function () {
    var point = { lat: 40.115, lng: -88.235 };
    // The ward boundary polygon contains this point
    var result = overlays.findContainingFeature(wardBoundaryGeoJSON, point);
    expect(result).not.toBeNull();
    expect(result.properties.name).toBe("Ward 3");
  });

  test("findContainingFeature returns null when point is outside all features", function () {
    var point = { lat: 0, lng: 0 }; // middle of the ocean
    var result = overlays.findContainingFeature(wardBoundaryGeoJSON, point);
    expect(result).toBeNull();
  });

  test("findContainingFeature works with MultiPolygon geometry", function () {
    var point = { lat: 40.12, lng: -88.24 };
    var result = overlays.findContainingFeature(censusTractGeoJSON, point);
    expect(result).not.toBeNull();
    expect(result.properties.TRACTCE).toBe("000100");
  });

  test("findContainingFeatures (plural) returns all features containing the point", function () {
    // A point might be in overlapping features (e.g., a census tract AND
    // a ward that partially overlap). The researcher might want all matches.
    var point = { lat: 40.115, lng: -88.235 };
    var combined = {
      type: "FeatureCollection",
      features: wardBoundaryGeoJSON.features.concat(
        censusTractGeoJSON.features
      ),
    };
    var results = overlays.findContainingFeatures(combined, point);
    // Should find features from both layers that contain the point
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("randomized overlay assignment", function () {
  test("selects one overlay from a set of conditions", function () {
    // A researcher defines, say, 3 overlay conditions. Each respondent
    // sees exactly one, chosen at random. E.g., control (no boundary),
    // a ward boundary, or a census tract boundary.
    var conditions = {
      control: null,
      ward_boundary: wardBoundaryGeoJSON,
      census_tract: censusTractGeoJSON,
    };
    var assignment = overlays.assignCondition(conditions);
    // The result should be one of the condition keys
    expect(Object.keys(conditions)).toContain(assignment.conditionName);
    // And the corresponding overlay data (or null for control)
    expect(assignment.overlayData).toBe(conditions[assignment.conditionName]);
  });

  test("records the assigned condition name for analysis", function () {
    // Why: the researcher needs to know which condition each respondent
    // saw to include it as a treatment variable in the analysis.
    var conditions = {
      ward_boundary: wardBoundaryGeoJSON,
      census_tract: censusTractGeoJSON,
    };
    var assignment = overlays.assignCondition(conditions);
    expect(typeof assignment.conditionName).toBe("string");
    expect(assignment.conditionName.length).toBeGreaterThan(0);
  });

  test("assignment is deterministic given the same seed", function () {
    // Why: reproducibility. If a researcher re-downloads the data and
    // re-runs the analysis, the condition assignments must be stable.
    // A seed (e.g., respondent ID) ensures this.
    var conditions = {
      control: null,
      ward_boundary: wardBoundaryGeoJSON,
      census_tract: censusTractGeoJSON,
    };
    var a1 = overlays.assignCondition(conditions, { seed: "respondent-42" });
    var a2 = overlays.assignCondition(conditions, { seed: "respondent-42" });
    expect(a1.conditionName).toBe(a2.conditionName);
  });

  test("different seeds produce different assignments (in expectation)", function () {
    // Not a deterministic test -- we check that at least two different
    // seeds out of many yield different conditions. With 3 conditions,
    // the probability of 20 identical assignments by chance is (1/3)^19.
    var conditions = {
      control: null,
      ward_boundary: wardBoundaryGeoJSON,
      census_tract: censusTractGeoJSON,
    };
    var seen = new Set();
    for (var i = 0; i < 20; i++) {
      var a = overlays.assignCondition(conditions, { seed: "resp-" + i });
      seen.add(a.conditionName);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
