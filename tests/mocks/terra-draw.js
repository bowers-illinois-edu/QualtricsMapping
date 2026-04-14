// Mock Terra Draw API for testing.
//
// Terra Draw is loaded from CDN in the browser and creates globals
// (TerraDraw, TerraDrawGoogleMapsAdapter, etc.). This mock provides
// the same interface so our drawing code can run in Node/Jest.
//
// We mock only the subset of Terra Draw that QualtricsMapping uses:
// polygon drawing, select mode, feature management, and change events.

var nextFeatureId = 1;

function MockTerraDraw(opts) {
  this._adapter = opts.adapter;
  this._modes = {};
  (opts.modes || []).forEach(
    function (m) {
      this._modes[m.mode] = m;
    }.bind(this)
  );
  this._mode = null;
  this._features = [];
  this._listeners = {};
  this._started = false;
  this._selectedIds = [];
}

MockTerraDraw.prototype.start = function () {
  this._started = true;
};

MockTerraDraw.prototype.stop = function () {
  this._started = false;
};

Object.defineProperty(MockTerraDraw.prototype, "enabled", {
  get: function () {
    return this._started;
  },
});

MockTerraDraw.prototype.setMode = function (modeName) {
  this._mode = modeName;
  // Deselect when switching modes
  this._selectedIds = [];
};

MockTerraDraw.prototype.getMode = function () {
  return this._mode;
};

MockTerraDraw.prototype.getSnapshot = function () {
  // Return copies so tests cannot accidentally mutate internal state
  return JSON.parse(JSON.stringify(this._features));
};

MockTerraDraw.prototype.removeFeatures = function (ids) {
  this._features = this._features.filter(function (f) {
    return ids.indexOf(f.id) === -1;
  });
  this._selectedIds = this._selectedIds.filter(function (id) {
    return ids.indexOf(id) === -1;
  });
  this._emit("change", ids, "delete");
};

MockTerraDraw.prototype.clear = function () {
  var ids = this._features.map(function (f) {
    return f.id;
  });
  this._features = [];
  this._selectedIds = [];
  if (ids.length > 0) {
    this._emit("change", ids, "delete");
  }
};

MockTerraDraw.prototype.on = function (event, callback) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(callback);
};

MockTerraDraw.prototype.off = function (event, callback) {
  if (!this._listeners[event]) return;
  this._listeners[event] = this._listeners[event].filter(function (cb) {
    return cb !== callback;
  });
};

MockTerraDraw.prototype._emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  (this._listeners[event] || []).forEach(function (cb) {
    cb.apply(null, args);
  });
};

// Test helper: simulate a respondent completing a polygon.
// Takes an array of [lng, lat] coordinate pairs.
MockTerraDraw.prototype._simulatePolygonComplete = function (coords) {
  var id = "feature-" + nextFeatureId++;
  // GeoJSON polygon rings must be closed
  var ring = coords.slice();
  if (
    ring.length > 0 &&
    (ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1])
  ) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  var feature = {
    id: id,
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    properties: { mode: "polygon" },
  };
  this._features.push(feature);
  this._emit("change", [id], "create");
  this._emit("finish", id, { action: "draw", mode: "polygon" });
  return id;
};

// Test helper: simulate selecting a feature in select mode.
MockTerraDraw.prototype._simulateSelect = function (featureId) {
  this._selectedIds = [featureId];
  this._emit("select", featureId);
};

MockTerraDraw.prototype.getSelectedFeatureId = function () {
  return this._selectedIds.length > 0 ? this._selectedIds[0] : null;
};

// --- Adapter and mode mocks ---

function MockGoogleMapsAdapter(opts) {
  this._map = opts.map;
  this._lib = opts.lib;
}

function MockPolygonMode(opts) {
  this.mode = "polygon";
  this._opts = opts || {};
}

function MockSelectMode(opts) {
  this.mode = "select";
  this._opts = opts || {};
}

function MockRenderMode(opts) {
  this.mode = opts && opts.modeName ? opts.modeName : "static";
  this._opts = opts || {};
}

// --- Install/uninstall as globals (mirrors how CDN script works) ---

function install() {
  global.TerraDraw = MockTerraDraw;
  global.TerraDrawGoogleMapsAdapter = MockGoogleMapsAdapter;
  global.TerraDrawPolygonMode = MockPolygonMode;
  global.TerraDrawSelectMode = MockSelectMode;
  global.TerraDrawRenderMode = MockRenderMode;
}

function uninstall() {
  delete global.TerraDraw;
  delete global.TerraDrawGoogleMapsAdapter;
  delete global.TerraDrawPolygonMode;
  delete global.TerraDrawSelectMode;
  delete global.TerraDrawRenderMode;
}

module.exports = {
  install: install,
  uninstall: uninstall,
  MockTerraDraw: MockTerraDraw,
  MockGoogleMapsAdapter: MockGoogleMapsAdapter,
  MockPolygonMode: MockPolygonMode,
  MockSelectMode: MockSelectMode,
  MockRenderMode: MockRenderMode,
};
