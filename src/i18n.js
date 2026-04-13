/**
 * Internationalization: UI labels and Google Maps API locale configuration.
 *
 * Button labels are configurable per language so the survey tool works
 * in any country. Researchers can also override individual labels for
 * survey-specific wording (e.g., "Mark your neighborhood" instead of "Draw").
 */

(function (exports) {
  var LABEL_SETS = {
    en: {
      draw: "Draw",
      stop: "Stop",
      reset: "Reset",
      done: "Done",
      deleteConfirm: "Do you want to delete this community?",
      deleteYes: "Yes",
      deleteNo: "No",
    },
    es: {
      draw: "Dibujar",
      stop: "Parar",
      reset: "Reiniciar",
      done: "Listo",
      deleteConfirm: "Desea eliminar esta comunidad?",
      deleteYes: "Si",
      deleteNo: "No",
    },
  };

  /**
   * Get UI labels for a given language code.
   * Falls back to English for unsupported languages.
   * Custom overrides (partial object) are merged on top.
   */
  function getLabels(langCode, overrides) {
    var base = LABEL_SETS[langCode] || LABEL_SETS["en"];
    if (!overrides) return base;

    // Merge overrides onto a copy of the base
    var result = {};
    var keys = Object.keys(base);
    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = base[keys[i]];
    }
    var overrideKeys = Object.keys(overrides);
    for (var j = 0; j < overrideKeys.length; j++) {
      result[overrideKeys[j]] = overrides[overrideKeys[j]];
    }
    return result;
  }

  /**
   * Build the Google Maps JavaScript API URL with locale settings.
   */
  function buildMapsApiUrl(apiKey, opts) {
    var params = ["key=" + apiKey, "libraries=drawing"];
    if (opts.language) {
      params.push("language=" + opts.language);
    }
    if (opts.region) {
      params.push("region=" + opts.region);
    }
    return (
      "https://maps.googleapis.com/maps/api/js?" + params.join("&")
    );
  }

  exports.getLabels = getLabels;
  exports.buildMapsApiUrl = buildMapsApiUrl;
  exports.LABEL_SETS = LABEL_SETS;
})(typeof module !== "undefined" ? module.exports : (this.QMI18n = {}));
