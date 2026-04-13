// QualtricsMapping: Geocode Question JavaScript
//
// Paste this into the Question JavaScript editor for a text-entry
// question that asks for the respondent's address or postal code.
//
// Setup in Qualtrics:
//   1. Create a "Text Entry" question (single line)
//   2. In Survey Flow, add embedded data fields BEFORE the block:
//      lat, lon (leave values blank -- they are set by this code)
//   3. Click the question's gear icon > Add JavaScript > paste this

Qualtrics.SurveyEngine.addOnload(function () {
  // --- CONFIGURATION ---
  // Set your country code to restrict geocoding results.
  // Use ISO 3166-1 alpha-2 codes: "US", "CL", "KE", "GB", etc.
  // Set to null for unrestricted (worldwide) geocoding.
  var COUNTRY = null;
  // --- END CONFIGURATION ---

  var questionCtx = this;
  questionCtx.disableNextButton();

  var container = questionCtx.getQuestionContainer();

  // Create a "Look up" button so the respondent confirms their entry
  var lookupBtn = document.createElement("div");
  lookupBtn.className = "mapbutton";
  lookupBtn.style.cssText =
    "display:inline-block; cursor:pointer; padding:8px 16px; " +
    "margin:8px 0; background:#0078d4; color:white; border-radius:4px; " +
    "font-size:16px;";
  lookupBtn.innerHTML = "<b>Look up address</b>";
  container.appendChild(lookupBtn);

  // Status message area
  var status = document.createElement("div");
  status.style.cssText = "margin:8px 0; min-height:20px;";
  container.appendChild(status);

  lookupBtn.addEventListener("click", function () {
    var address = questionCtx.getTextValue();
    if (!address || address.trim() === "") {
      status.textContent = "Please enter an address or postal code.";
      return;
    }

    status.textContent = "Looking up address...";
    lookupBtn.style.opacity = "0.5";

    var opts = {};
    if (COUNTRY) {
      opts.country = COUNTRY;
    }

    QMGeocode.geocodeAddress(address, opts, function (err, result) {
      lookupBtn.style.opacity = "1";
      if (err) {
        status.textContent =
          "Unable to find that address. Please check and try again.";
        return;
      }

      status.textContent =
        "Address found. Click Next to continue.";
      Qualtrics.SurveyEngine.setEmbeddedData("lat", result.lat);
      Qualtrics.SurveyEngine.setEmbeddedData("lon", result.lng);
      questionCtx.enableNextButton();
    });
  });
});
