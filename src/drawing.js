/**
 * Interactive map drawing: create a map, manage polygon drawing, and
 * collect the result.
 *
 * This module creates a Google Map with drawing tools inside a container
 * element. Respondents can draw one or more polygons, delete individual
 * polygons, reset all drawings, and submit when done.
 */

(function (exports) {
  var layout =
    typeof require === "function" ? require("./layout") : this.QMLayout;
  var coordinates =
    typeof require === "function"
      ? require("./coordinates")
      : this.QMCoordinates;

  /**
   * Create a map canvas inside the given container element.
   *
   * @param {HTMLElement} container - DOM element to hold the map
   * @param {object} opts - { lat, lng, zoom }
   * @returns {object} context with map, drawingManager, polygons array
   */
  function createMapCanvas(container, opts) {
    var canvasStyle = layout.getCanvasStyle({
      containerWidth: container.offsetWidth || 375,
    });
    var interactionOpts = layout.getMapInteractionOptions();

    // Create the map canvas div
    var canvas = document.createElement("div");
    canvas.id = "map_canvas";
    canvas.style.width = canvasStyle.width;
    canvas.style.height = canvasStyle.height;
    canvas.style.minHeight = canvasStyle.minHeight;
    canvas.style.margin = "auto";
    container.appendChild(canvas);

    var center = new google.maps.LatLng(opts.lat, opts.lng);
    var mapOptions = {
      center: center,
      zoom: opts.zoom,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      scrollwheel: interactionOpts.scrollwheel,
      gestureHandling: interactionOpts.gestureHandling,
      maxZoom: 20,
      minZoom: 4,
      streetViewControl: false,
    };

    var map = new google.maps.Map(canvas, mapOptions);

    var drawingManager = new google.maps.drawing.DrawingManager({
      drawingControl: false,
      drawingControlOptions: {
        drawingModes: [google.maps.drawing.OverlayType.POLYGON],
      },
      polygonOptions: { editable: true },
    });
    drawingManager.setMap(map);
    // Start in drawing mode so the respondent can begin immediately
    drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);

    return {
      map: map,
      drawingManager: drawingManager,
      polygons: [],
      canvas: canvas,
      zoom: opts.zoom,
    };
  }

  /**
   * Add a completed polygon to the drawing context.
   */
  function addPolygon(ctx, polygon) {
    ctx.polygons.push(polygon);
  }

  /**
   * Remove a specific polygon from the context and the map.
   */
  function removePolygon(ctx, polygon) {
    polygon.setMap(null);
    ctx.polygons = ctx.polygons.filter(function (p) {
      return p !== polygon;
    });
  }

  /**
   * Clear all polygons from the context and the map.
   */
  function resetPolygons(ctx) {
    for (var i = 0; i < ctx.polygons.length; i++) {
      ctx.polygons[i].setMap(null);
    }
    ctx.polygons = [];
  }

  /**
   * Create the Draw/Stop/Reset/Done buttons.
   * Returns an object with button elements.
   *
   * @param {object} ctx - drawing context from createMapCanvas
   * @param {object} labels - optional label overrides (from i18n.getLabels)
   */
  function createButtons(ctx, labels) {
    labels = labels || { draw: "Draw", stop: "Stop", reset: "Reset", done: "Done" };
    var btnSize = layout.getButtonSize({
      viewportWidth:
        typeof window !== "undefined" ? window.innerWidth : 375,
    });

    function mkButton(text) {
      var btn = document.createElement("div");
      btn.className = "mapbutton";
      btn.style.fontSize = btnSize.fontSize + "px";
      btn.style.minWidth = btnSize.minWidth + "px";
      btn.style.minHeight = btnSize.minHeight + "px";
      btn.style.display = "inline-block";
      btn.style.cursor = "pointer";
      btn.innerHTML = "<b>" + text + "</b>";
      return btn;
    }

    return {
      draw: mkButton(labels.draw),
      stop: mkButton(labels.stop),
      reset: mkButton(labels.reset),
      done: mkButton(labels.done),
    };
  }

  /**
   * Collect the drawing result: coordinate string and zoom level.
   */
  function collectResult(ctx) {
    return {
      coordinates: coordinates.serializePolygons(ctx.polygons),
      zoom: ctx.zoom,
    };
  }

  exports.createMapCanvas = createMapCanvas;
  exports.addPolygon = addPolygon;
  exports.removePolygon = removePolygon;
  exports.resetPolygons = resetPolygons;
  exports.createButtons = createButtons;
  exports.collectResult = collectResult;
})(typeof module !== "undefined" ? module.exports : (this.QMDrawing = {}));
