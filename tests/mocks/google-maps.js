// Mock Google Maps API for testing.
// The real API loads from a CDN and creates a global `google` object.
// This mock provides the same interface so our code can run in Node.

function MockLatLng(lat, lng) {
  this._lat = lat;
  this._lng = lng;
}
MockLatLng.prototype.lat = function () {
  return this._lat;
};
MockLatLng.prototype.lng = function () {
  return this._lng;
};

function MockLatLngBounds() {
  this._points = [];
}
MockLatLngBounds.prototype.extend = function (latlng) {
  this._points.push(latlng);
};
MockLatLngBounds.prototype.getCenter = function () {
  if (this._points.length === 0) return new MockLatLng(0, 0);
  var sumLat = 0,
    sumLng = 0;
  this._points.forEach(function (p) {
    sumLat += p.lat();
    sumLng += p.lng();
  });
  return new MockLatLng(
    sumLat / this._points.length,
    sumLng / this._points.length
  );
};

function MockPolygon(opts) {
  this._opts = opts || {};
  this._map = null;
  this._path = (opts && opts.paths) || [];
}
MockPolygon.prototype.setMap = function (map) {
  this._map = map;
};
MockPolygon.prototype.getPath = function () {
  var path = this._path;
  return {
    getArray: function () {
      return path;
    },
  };
};

function MockMap(element, options) {
  this._element = element;
  this._options = options || {};
  this.controls = {};
  // Google Maps uses numeric constants for control positions
  this.controls[9] = { push: jest.fn() }; // RIGHT_BOTTOM = 9
  this._layers = [];
}
MockMap.prototype.fitBounds = function () {};
MockMap.prototype.setCenter = function () {};
MockMap.prototype.setZoom = function () {};
MockMap.prototype.setMapTypeId = function () {};
MockMap.prototype.addListener = function () {};

function MockDrawingManager(opts) {
  this._opts = opts || {};
  this._map = null;
  this._mode = null;
}
MockDrawingManager.prototype.setMap = function (map) {
  this._map = map;
};
MockDrawingManager.prototype.setDrawingMode = function (mode) {
  this._mode = mode;
};

function MockInfoWindow(opts) {
  this._opts = opts || {};
}
MockInfoWindow.prototype.open = function () {};
MockInfoWindow.prototype.close = function () {};

function MockGeocoder() {}
MockGeocoder.prototype.geocode = function (request, callback) {
  // Default: successful geocode returning a fixed location.
  // Tests can override this per-instance.
  if (this._mockResult) {
    callback(this._mockResult.results, this._mockResult.status);
  } else {
    callback(
      [
        {
          geometry: {
            location: {
              lat: function () {
                return 40.1164;
              },
              lng: function () {
                return -88.2434;
              },
            },
          },
        },
      ],
      "OK"
    );
  }
};

function MockTrafficLayer() {
  this._map = null;
}
MockTrafficLayer.prototype.setMap = function (map) {
  this._map = map;
};

function MockMarker(opts) {
  this._opts = opts || {};
  this._map = null;
}
MockMarker.prototype.setMap = function (map) {
  this._map = map;
};

var mockGoogle = {
  maps: {
    LatLng: MockLatLng,
    LatLngBounds: MockLatLngBounds,
    Polygon: MockPolygon,
    Map: MockMap,
    Marker: MockMarker,
    InfoWindow: MockInfoWindow,
    Geocoder: MockGeocoder,
    TrafficLayer: MockTrafficLayer,
    MapTypeId: {
      ROADMAP: "roadmap",
      SATELLITE: "satellite",
      HYBRID: "hybrid",
      TERRAIN: "terrain",
    },
    ControlPosition: {
      RIGHT_BOTTOM: 9,
    },
    drawing: {
      DrawingManager: MockDrawingManager,
      OverlayType: {
        POLYGON: "polygon",
      },
    },
    event: {
      addListener: jest.fn(),
      // Stores listeners so tests can trigger them
      _listeners: {},
      addListenerOnce: jest.fn(),
    },
    Data: jest.fn(function () {
      return {
        addGeoJson: jest.fn(),
        setMap: jest.fn(),
        setStyle: jest.fn(),
        forEach: jest.fn(),
      };
    }),
  },
};

function install() {
  global.google = mockGoogle;
}

function uninstall() {
  delete global.google;
}

module.exports = { install, uninstall, mockGoogle };
