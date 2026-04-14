// QualtricsMapping: Geocode Question JavaScript (Q1)
// Paste into Q1's JavaScript editor.
// Uses the new Qualtrics API (setJSEmbeddedData, addOnReady).

Qualtrics.SurveyEngine.addOnReady(function () {
  var questionCtx = this;
  var COUNTRY = null; // Set to "US", "CL", "KE", etc. to restrict geocoding
  var GMAPS_KEY = "YOURGOOGLEMAPKEY";
  var BUNDLE_URL = "https://bowers-illinois-edu.github.io/QualtricsMapping/dist/qualtrics-mapping.js";

  function loadScript(src, cb) {
    var s = document.createElement("script"); s.src = src; s.onload = cb;
    s.onerror = function () { console.error("QM: Failed to load: " + src); };
    document.head.appendChild(s);
  }

  function getTextFromDOM() {
    var container = questionCtx.getQuestionContainer();
    var ta = container.querySelector("textarea");
    if (ta && ta.value) return ta.value;
    var inp = container.querySelector("input[type='text']");
    if (inp && inp.value) return inp.value;
    return "";
  }

  function startGeocode() {
    questionCtx.disableNextButton();
    var container = questionCtx.getQuestionContainer();

    var lookupBtn = document.createElement("div");
    lookupBtn.style.cssText = "display:inline-block; cursor:pointer; padding:8px 16px; margin:8px 0; background:#0078d4; color:white; border-radius:4px; font-size:16px;";
    lookupBtn.innerHTML = "<b>Look up address</b>";
    container.appendChild(lookupBtn);

    var status = document.createElement("div");
    status.style.cssText = "margin:8px 0; min-height:20px;";
    container.appendChild(status);

    lookupBtn.addEventListener("click", function () {
      var address = getTextFromDOM();
      if (!address || address.trim() === "") {
        status.textContent = "Please enter an address or postal code.";
        return;
      }
      status.textContent = "Looking up address...";
      lookupBtn.style.opacity = "0.5";
      var opts = {};
      if (COUNTRY) { opts.country = COUNTRY; }
      QMGeocode.geocodeAddress(address, opts, function (err, result) {
        lookupBtn.style.opacity = "1";
        if (err) {
          status.textContent = "Unable to find that address. Please check and try again.";
          return;
        }
        status.textContent = "Address found. Click Next to continue.";
        var latStr = String(result.lat);
        var lonStr = String(result.lng);
        Qualtrics.SurveyEngine.setJSEmbeddedData("lat", latStr);
        Qualtrics.SurveyEngine.setJSEmbeddedData("lon", lonStr);
        console.log("QM Q1: set lat=" + latStr + " lon=" + lonStr);
        questionCtx.enableNextButton();
      });
    });
  }

  if (typeof google === "object" && typeof google.maps === "object") {
    if (typeof QMGeocode !== "undefined") { startGeocode(); }
    else { loadScript(BUNDLE_URL, startGeocode); }
  } else {
    loadScript("https://maps.googleapis.com/maps/api/js?key=" + GMAPS_KEY + "&libraries=drawing", function () {
      loadScript(BUNDLE_URL, startGeocode);
    });
  }
});
