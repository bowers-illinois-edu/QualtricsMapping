// Mock Qualtrics survey engine for testing.
// In a real Qualtrics survey, the global Qualtrics object exists on the page.
// The SurveyEngine API lets question JavaScript set embedded data, control
// navigation, and access question containers.

function createMockSurveyEngine() {
  var embeddedData = {};
  var onloadCallbacks = [];

  return {
    // The embedded data store -- tests read this to verify what got recorded
    _embeddedData: embeddedData,
    _onloadCallbacks: onloadCallbacks,

    addOnload: function (fn) {
      onloadCallbacks.push(fn);
    },

    setEmbeddedData: function (key, value) {
      embeddedData[key] = value;
    },

    getEmbeddedData: function (key) {
      return embeddedData[key];
    },
  };
}

// Mock question context -- `this` inside addOnload callbacks
function createMockQuestionContext() {
  var container = document.createElement("div");
  return {
    _container: container,
    _nextClicked: false,
    _errorMessage: null,

    getQuestionContainer: function () {
      return container;
    },
    clickNextButton: function () {
      this._nextClicked = true;
    },
    disableNextButton: function () {},
    enableNextButton: function () {},
    getTextValue: function () {
      return this._textValue || "";
    },
    displayErrorMessage: function (msg) {
      this._errorMessage = msg;
    },
  };
}

function install() {
  var engine = createMockSurveyEngine();
  global.Qualtrics = { SurveyEngine: engine };
  return engine;
}

function uninstall() {
  delete global.Qualtrics;
}

module.exports = {
  install,
  uninstall,
  createMockSurveyEngine,
  createMockQuestionContext,
};
