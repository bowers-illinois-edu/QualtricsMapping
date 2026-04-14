/**
 * Tests for internationalization.
 *
 * Why these matter: This tool will be deployed in surveys across different
 * countries and languages. Button labels ("Draw", "Done", "Reset") must
 * appear in the respondent's language. The Google Maps API itself supports
 * locale-specific rendering (street names, place names), but our UI chrome
 * needs to be translated too.
 *
 * We do NOT test Google Maps' own translations -- that is Google's job.
 * We test that our code correctly configures the locale and that our
 * UI strings are not hardcoded in English.
 */

// Module under test -- will be created in src/i18n.js
var i18n = require("../src/i18n");

describe("button label configuration", function () {
  test("returns English labels by default", function () {
    var labels = i18n.getLabels("en");
    expect(labels.draw).toBe("Draw");
    expect(labels.stop).toBe("Stop");
    expect(labels.reset).toBe("Reset");
    expect(labels.done).toBe("Done");
    // Delete button label for removing selected polygons
    expect(labels.delete).toBeDefined();
  });

  test("returns Spanish labels for 'es'", function () {
    var labels = i18n.getLabels("es");
    expect(labels.draw).toBe("Dibujar");
    expect(labels.stop).toBe("Parar");
    expect(labels.reset).toBe("Reiniciar");
    expect(labels.done).toBe("Listo");
  });

  test("supports custom label overrides", function () {
    // Why: a researcher might want labels that fit their specific
    // survey context, e.g., "Mark your neighborhood" instead of "Draw".
    var custom = { draw: "Mark your neighborhood" };
    var labels = i18n.getLabels("en", custom);
    expect(labels.draw).toBe("Mark your neighborhood");
    // Other labels should still have defaults
    expect(labels.done).toBe("Done");
  });

  test("falls back to English for unsupported language codes", function () {
    var labels = i18n.getLabels("xx");
    expect(labels.draw).toBe("Draw");
  });
});

describe("Google Maps API locale configuration", function () {
  test("builds API URL with language parameter", function () {
    var url = i18n.buildMapsApiUrl("TESTKEY", { language: "es" });
    expect(url).toContain("language=es");
  });

  test("builds API URL with region parameter for geocoding bias", function () {
    var url = i18n.buildMapsApiUrl("TESTKEY", {
      language: "es",
      region: "CL",
    });
    expect(url).toContain("region=CL");
  });

  test("does NOT request the deprecated drawing library", function () {
    // The Google Maps Drawing library was removed May 2026.
    // We use Terra Draw instead, so the Maps API URL should not
    // include libraries=drawing.
    var url = i18n.buildMapsApiUrl("TESTKEY", {});
    expect(url).not.toContain("libraries=drawing");
  });

  test("substitutes the provided API key", function () {
    var url = i18n.buildMapsApiUrl("MY_ACTUAL_KEY", {});
    expect(url).toContain("key=MY_ACTUAL_KEY");
    expect(url).not.toContain("YOURGOOGLEMAPKEY");
  });
});
