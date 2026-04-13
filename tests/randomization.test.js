/**
 * Tests for randomizing map attributes as experimental treatments.
 *
 * Why these matter: The researcher wants to randomly vary what respondents
 * see -- zoom level, map center, map type, traffic layer, etc. -- and then
 * measure how these variations affect the respondent's drawing or answers.
 * This is the experimental design layer. If the randomization is not truly
 * random, or if the assigned values are not recorded, the experiment cannot
 * identify causal effects.
 *
 * Every randomized attribute must be:
 *   1. Drawn from a researcher-specified distribution or set
 *   2. Applied to the map the respondent sees
 *   3. Recorded in embedded data so the researcher can analyze it
 *   4. Reproducible given a seed (for auditing / replication)
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

// Module under test -- will be created in src/randomization.js
var randomization = require("../src/randomization");

describe("zoom randomization", function () {
  test("generates a zoom level within the specified range", function () {
    for (var i = 0; i < 50; i++) {
      var z = randomization.randomInt(10, 16);
      expect(z).toBeGreaterThanOrEqual(10);
      expect(z).toBeLessThanOrEqual(16);
    }
  });

  test("both endpoints of the range are reachable", function () {
    var seen = new Set();
    for (var i = 0; i < 200; i++) {
      seen.add(randomization.randomInt(10, 12));
    }
    expect(seen.has(10)).toBe(true);
    expect(seen.has(12)).toBe(true);
  });
});

describe("map attribute randomization", function () {
  test("selects one value from a discrete set of options", function () {
    // E.g., map type: roadmap vs satellite vs hybrid
    var options = ["roadmap", "satellite", "hybrid"];
    for (var i = 0; i < 30; i++) {
      var choice = randomization.randomChoice(options);
      expect(options).toContain(choice);
    }
  });

  test("randomChoice with a seed is deterministic", function () {
    var options = ["roadmap", "satellite", "hybrid"];
    var a = randomization.randomChoice(options, { seed: "resp-7" });
    var b = randomization.randomChoice(options, { seed: "resp-7" });
    expect(a).toBe(b);
  });
});

describe("map center offset", function () {
  test("offsets a center point by a random amount within a radius", function () {
    // Why: varying the center tests whether the area shown affects
    // the respondent's drawing. The offset should be bounded so the
    // map stays in a meaningful area.
    var base = { lat: 40.1164, lng: -88.2434 };
    var maxOffsetDegrees = 0.05; // ~5 km
    var result = randomization.offsetCenter(base, maxOffsetDegrees);
    expect(Math.abs(result.lat - base.lat)).toBeLessThanOrEqual(
      maxOffsetDegrees
    );
    expect(Math.abs(result.lng - base.lng)).toBeLessThanOrEqual(
      maxOffsetDegrees
    );
  });

  test("offset with zero radius returns the original center", function () {
    var base = { lat: 40.1164, lng: -88.2434 };
    var result = randomization.offsetCenter(base, 0);
    expect(result.lat).toBe(base.lat);
    expect(result.lng).toBe(base.lng);
  });
});

describe("seeding from Qualtrics ResponseID", function () {
  // Default: use Qualtrics ResponseID ("${e://Field/ResponseID}"),
  // which is available from the first page of the survey.
  // Override: researcher can configure a custom embedded data field name
  // (e.g., "respondent_id" passed via URL from a panel provider).

  test("hashSeed converts a string ResponseID to a numeric seed", function () {
    // Qualtrics ResponseID is a string like "R_1abc2def3ghi".
    // We need a deterministic numeric seed from it.
    var seed = randomization.hashSeed("R_1abc2def3ghi");
    expect(typeof seed).toBe("number");
    expect(Number.isFinite(seed)).toBe(true);
  });

  test("hashSeed is deterministic: same input always gives same output", function () {
    var a = randomization.hashSeed("R_1abc2def3ghi");
    var b = randomization.hashSeed("R_1abc2def3ghi");
    expect(a).toBe(b);
  });

  test("hashSeed produces different values for different IDs", function () {
    var a = randomization.hashSeed("R_aaa");
    var b = randomization.hashSeed("R_bbb");
    expect(a).not.toBe(b);
  });

  test("hashSeed works with custom panel IDs (not just Qualtrics format)", function () {
    // A researcher might pass their own respondent_id via URL parameter
    // and set it as embedded data in Survey Flow. Documentation should
    // explain how to do this: add ?respondent_id=X to survey URL,
    // then add an embedded data element "respondent_id" in Survey Flow
    // before the survey blocks, then configure the seed field name.
    var seed = randomization.hashSeed("panelist-42");
    expect(typeof seed).toBe("number");
    expect(Number.isFinite(seed)).toBe(true);
  });
});

describe("experimental design record", function () {
  test("buildAssignments collects all randomized values into a single record", function () {
    // Why: the researcher needs one row per respondent with all treatment
    // assignments, to merge with the survey response data in R/Python.
    // The map treatments are the independent variable; survey questions
    // (e.g., community attachment, boundary perceptions) are the outcomes.
    var design = {
      zoom: { type: "int", min: 10, max: 16 },
      mapType: { type: "choice", options: ["roadmap", "satellite"] },
      showTraffic: { type: "choice", options: [true, false] },
    };
    var record = randomization.buildAssignments(design, {
      seed: "R_1abc2def3ghi",
    });
    // Each key in the design should appear in the record
    expect(record).toHaveProperty("zoom");
    expect(record).toHaveProperty("mapType");
    expect(record).toHaveProperty("showTraffic");
    // And values should be within specified ranges/options
    expect(record.zoom).toBeGreaterThanOrEqual(10);
    expect(record.zoom).toBeLessThanOrEqual(16);
    expect(["roadmap", "satellite"]).toContain(record.mapType);
    expect([true, false]).toContain(record.showTraffic);
  });

  test("buildAssignments is reproducible with the same ResponseID seed", function () {
    var design = {
      zoom: { type: "int", min: 10, max: 16 },
      mapType: { type: "choice", options: ["roadmap", "satellite"] },
    };
    var r1 = randomization.buildAssignments(design, {
      seed: "R_1abc2def3ghi",
    });
    var r2 = randomization.buildAssignments(design, {
      seed: "R_1abc2def3ghi",
    });
    expect(r1).toEqual(r2);
  });

  test("buildAssignments produces a JSON-serializable record", function () {
    // Why: this record will be stored in Qualtrics embedded data as a
    // string and later parsed in R/Python. The researcher downloads the
    // Qualtrics CSV and reads the JSON to recover treatment assignments.
    var design = {
      zoom: { type: "int", min: 10, max: 16 },
    };
    var record = randomization.buildAssignments(design, { seed: "test" });
    var json = JSON.stringify(record);
    var parsed = JSON.parse(json);
    expect(parsed).toEqual(record);
  });
});
