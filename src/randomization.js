/**
 * Seeded randomization for experimental map treatments.
 *
 * Every random choice must be:
 *   1. Reproducible given the same seed (for auditing / replication)
 *   2. Recorded in the data so researchers can analyze treatment effects
 *
 * The default seed is the Qualtrics ResponseID, accessed via piped text:
 *   var seed = "${e://Field/ResponseID}";
 * Researchers can override with a custom embedded data field (e.g., a
 * panel ID passed via URL parameter).
 */

(function (exports) {
  /**
   * Hash a string to a 32-bit integer for use as a PRNG seed.
   * Uses djb2, a simple and well-distributed hash.
   */
  function hashSeed(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      // hash * 33 + char
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    // Ensure positive
    return Math.abs(hash);
  }

  /**
   * Simple seeded PRNG (xorshift32). Returns a function that produces
   * pseudo-random floats in [0, 1) on each call.
   */
  function createRng(seed) {
    var state = typeof seed === "string" ? hashSeed(seed) : seed;
    // Avoid zero state, which would produce all zeros
    if (state === 0) state = 1;

    return function () {
      state ^= state << 13;
      state ^= state >> 17;
      state ^= state << 5;
      // Convert to [0, 1)
      return (Math.abs(state) % 2147483647) / 2147483647;
    };
  }

  /**
   * Random integer in [min, max] inclusive.
   * Without a seed, uses Math.random (non-reproducible).
   */
  function randomInt(min, max, opts) {
    var rand;
    if (opts && opts.seed != null) {
      rand = createRng(opts.seed)();
    } else {
      rand = Math.random();
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(rand * (max - min + 1)) + min;
  }

  /**
   * Pick one element from an array.
   * Without a seed, uses Math.random (non-reproducible).
   */
  function randomChoice(options, opts) {
    var rand;
    if (opts && opts.seed != null) {
      rand = createRng(opts.seed)();
    } else {
      rand = Math.random();
    }
    var idx = Math.floor(rand * options.length);
    // Guard against rand === 1.0 (shouldn't happen, but be safe)
    if (idx >= options.length) idx = options.length - 1;
    return options[idx];
  }

  /**
   * Offset a center point by a random amount within a bounding box.
   * maxOffsetDegrees defines the maximum offset in each direction.
   */
  function offsetCenter(base, maxOffsetDegrees, opts) {
    if (maxOffsetDegrees === 0) {
      return { lat: base.lat, lng: base.lng };
    }
    var rng;
    if (opts && opts.seed != null) {
      rng = createRng(opts.seed);
    } else {
      rng = Math.random;
    }
    var latOffset = (rng() * 2 - 1) * maxOffsetDegrees;
    var lngOffset = (rng() * 2 - 1) * maxOffsetDegrees;
    return {
      lat: base.lat + latOffset,
      lng: base.lng + lngOffset,
    };
  }

  /**
   * Build a complete assignment record from an experimental design spec.
   *
   * Design format:
   *   { zoom: { type: "int", min: 10, max: 16 },
   *     mapType: { type: "choice", options: ["roadmap", "satellite"] } }
   *
   * Returns a plain object with one key per design factor and the
   * assigned value. This object is JSON-serializable for storage in
   * Qualtrics embedded data.
   */
  function buildAssignments(design, opts) {
    var seedStr =
      opts && opts.seed != null ? String(opts.seed) : String(Math.random());
    var record = {};
    var keys = Object.keys(design);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var spec = design[key];
      // Each factor gets its own sub-seed so factors are independent
      var factorSeed = seedStr + ":" + key;

      if (spec.type === "int") {
        record[key] = randomInt(spec.min, spec.max, { seed: factorSeed });
      } else if (spec.type === "choice") {
        record[key] = randomChoice(spec.options, { seed: factorSeed });
      }
    }

    return record;
  }

  exports.hashSeed = hashSeed;
  exports.createRng = createRng;
  exports.randomInt = randomInt;
  exports.randomChoice = randomChoice;
  exports.offsetCenter = offsetCenter;
  exports.buildAssignments = buildAssignments;
})(
  typeof module !== "undefined"
    ? module.exports
    : (this.QMRandomization = {})
);
