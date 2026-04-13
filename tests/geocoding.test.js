/**
 * Tests for geocoding addresses to coordinates.
 *
 * Why these matter: Geocoding is the entry point -- it determines where
 * the map is centered. If geocoding fails silently, the respondent sees
 * a map of the wrong place and draws a meaningless polygon. If it fails
 * loudly but with no recovery path, the respondent drops out of the survey.
 *
 * This must work across countries and address formats. A Chilean postal
 * code, a US street address, and a Kenyan locality name should all work.
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

// Module under test -- will be created in src/geocode.js
var geocode = require("../src/geocode");

describe("geocoding an address", function () {
  test("returns lat/lng on successful geocode", function (done) {
    geocode.geocodeAddress("Champaign, IL", {}, function (err, result) {
      expect(err).toBeNull();
      expect(result.lat).toBeCloseTo(40.1164, 2);
      expect(result.lng).toBeCloseTo(-88.2434, 2);
      done();
    });
  });

  test("returns an error when geocoding fails", function (done) {
    // Override the mock geocoder to simulate failure
    var origGeocode = google.maps.Geocoder.prototype.geocode;
    google.maps.Geocoder.prototype.geocode = function (req, cb) {
      cb([], "ZERO_RESULTS");
    };
    geocode.geocodeAddress("xyznotaplace", {}, function (err, result) {
      expect(err).not.toBeNull();
      expect(result).toBeNull();
      // Restore
      google.maps.Geocoder.prototype.geocode = origGeocode;
      done();
    });
  });
});

describe("country restriction", function () {
  test("passes country restriction to the geocoder when specified", function (done) {
    // Why: in a Chilean survey, "Santiago" should resolve to Santiago,
    // Chile, not Santiago de Compostela in Spain.
    var capturedRequest = null;
    var origGeocode = google.maps.Geocoder.prototype.geocode;
    google.maps.Geocoder.prototype.geocode = function (req, cb) {
      capturedRequest = req;
      origGeocode.call(this, req, cb);
    };

    geocode.geocodeAddress(
      "Santiago",
      { country: "CL" },
      function (err, result) {
        expect(capturedRequest.componentRestrictions).toBeDefined();
        expect(capturedRequest.componentRestrictions.country).toBe("CL");
        google.maps.Geocoder.prototype.geocode = origGeocode;
        done();
      }
    );
  });

  test("works without country restriction for unrestricted surveys", function (done) {
    geocode.geocodeAddress("New York", {}, function (err, result) {
      expect(err).toBeNull();
      expect(result).not.toBeNull();
      done();
    });
  });
});
