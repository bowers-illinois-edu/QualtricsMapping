/**
 * Geocode an address to lat/lng using the Google Maps Geocoder.
 *
 * Wraps the Google Maps Geocoding API with country restriction support
 * for multi-country deployments.
 */

(function (exports) {
  /**
   * Geocode an address string to {lat, lng}.
   *
   * @param {string} address - Address or postal code to geocode
   * @param {object} opts - Options:
   *   - country: ISO 3166-1 alpha-2 country code (e.g., "CL", "US", "KE")
   *              Restricts results to this country to avoid ambiguity
   *              (e.g., "Santiago" -> Chile, not Spain).
   * @param {function} callback - function(err, result)
   *   On success: callback(null, {lat: number, lng: number})
   *   On failure: callback(errorMessage, null)
   */
  function geocodeAddress(address, opts, callback) {
    var geocoder = new google.maps.Geocoder();
    var request = { address: address };

    if (opts && opts.country) {
      request.componentRestrictions = { country: opts.country };
    }

    geocoder.geocode(request, function (results, status) {
      if (status === "OK" && results && results.length > 0) {
        callback(null, {
          lat: results[0].geometry.location.lat(),
          lng: results[0].geometry.location.lng(),
        });
      } else {
        callback(
          "Geocoding failed with status: " + status,
          null
        );
      }
    });
  }

  exports.geocodeAddress = geocodeAddress;
})(typeof module !== "undefined" ? module.exports : (this.QMGeocode = {}));
