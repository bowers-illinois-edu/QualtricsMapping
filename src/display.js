/**
 * Display a read-only map showing previously drawn polygons.
 *
 * Used in review questions where the respondent sees their drawing
 * and answers questions about it. The map is non-interactive so the
 * respondent cannot accidentally modify their response.
 */

(function (exports) {
  var coordinates =
    typeof require === "function"
      ? require("./coordinates")
      : this.QMCoordinates;

  /**
   * Show a static map with polygons parsed from a coordinate string.
   *
   * @param {HTMLElement} container - DOM element to hold the map
   * @param {string} coordString - Serialized polygon coordinates
   * @param {object} opts - Optional: { polycolor, fillopacity, strokeweight }
   * @returns {object} context with map and polygons array
   */
  function showMap(container, coordString, opts) {
    opts = opts || {};
    var polycolor = opts.polycolor || "#000000";
    var fillopacity = opts.fillopacity != null ? opts.fillopacity : 0.5;
    var strokeweight = opts.strokeweight != null ? opts.strokeweight : 1;

    // Create canvas
    var canvas = document.createElement("div");
    canvas.id = "map_canvas";
    canvas.style.width = "100%";
    canvas.style.height = "400px";
    container.appendChild(canvas);

    var vertices = coordinates.deserializePolygons(coordString);

    if (vertices.length === 0) {
      // No polygons -- create a default map centered at 0,0
      var map = new google.maps.Map(canvas, {
        center: new google.maps.LatLng(0, 0),
        zoom: 2,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        draggable: false,
        disableDefaultUI: true,
        disableDoubleClickZoom: true,
        scrollwheel: false,
      });
      return { map: map, polygons: [] };
    }

    // Build Google Maps polygons and compute bounds
    var bounds = new google.maps.LatLngBounds();
    var gmPolygons = vertices.map(function (polyVertices) {
      var path = polyVertices.map(function (v) {
        var ll = new google.maps.LatLng(v.lat, v.lng);
        bounds.extend(ll);
        return ll;
      });
      return new google.maps.Polygon({
        paths: path,
        fillColor: polycolor,
        fillOpacity: fillopacity,
        strokeColor: polycolor,
        strokeWeight: strokeweight,
      });
    });

    var map = new google.maps.Map(canvas, {
      center: bounds.getCenter(),
      zoom: 8,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      draggable: false,
      disableDefaultUI: true,
      disableDoubleClickZoom: true,
      scrollwheel: false,
    });

    map.fitBounds(bounds);

    for (var i = 0; i < gmPolygons.length; i++) {
      gmPolygons[i].setMap(map);
    }

    return { map: map, polygons: gmPolygons };
  }

  exports.showMap = showMap;
})(typeof module !== "undefined" ? module.exports : (this.QMDisplay = {}));
