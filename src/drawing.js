/**
 * Interactive map drawing: create a map, manage polygon drawing via
 * Terra Draw, and collect the result.
 *
 * This module creates a Google Map with Terra Draw's polygon drawing
 * tool inside a container element. Terra Draw replaces the deprecated
 * Google Maps DrawingManager (removed May 2026). The base map is still
 * Google Maps; only the drawing layer changed.
 *
 * Respondents can draw one or more polygons, select and delete
 * individual polygons, reset all drawings, and submit when done.
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
   * Initializes a Google Map for the base layer and a Terra Draw
   * instance for polygon drawing on top of it.
   *
   * @param {HTMLElement} container - DOM element to hold the map
   * @param {object} opts - { lat, lng, zoom }
   * @returns {object} context with map, draw (TerraDraw), canvas, zoom
   */
  function createMapCanvas(container, opts) {
    var canvasStyle = layout.getCanvasStyle({
      containerWidth: container.offsetWidth || 375,
    });
    var interactionOpts = layout.getMapInteractionOptions();

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

    // Terra Draw provides the drawing UI, replacing DrawingManager.
    // Polygon mode for drawing, select mode for choosing polygons to delete.
    //
    // The UMD bundles export to namespaced globals:
    //   terraDraw.TerraDraw, terraDraw.TerraDrawPolygonMode, etc.
    //   terraDrawGoogleMapsAdapter.TerraDrawGoogleMapsAdapter
    // In Node (tests), the mock installs bare globals instead.
    var TD = typeof terraDraw !== "undefined" ? terraDraw : {};
    var TDClass = TD.TerraDraw || (typeof TerraDraw !== "undefined" ? TerraDraw : null);
    var TDPolygon = TD.TerraDrawPolygonMode || (typeof TerraDrawPolygonMode !== "undefined" ? TerraDrawPolygonMode : null);
    var TDSelect = TD.TerraDrawSelectMode || (typeof TerraDrawSelectMode !== "undefined" ? TerraDrawSelectMode : null);
    var TDAdapter = (typeof terraDrawGoogleMapsAdapter !== "undefined" ? terraDrawGoogleMapsAdapter.TerraDrawGoogleMapsAdapter : null)
      || (typeof TerraDrawGoogleMapsAdapter !== "undefined" ? TerraDrawGoogleMapsAdapter : null);

    var draw = new TDClass({
      adapter: new TDAdapter({ map: map, lib: google.maps }),
      modes: [
        new TDPolygon(),
        new TDSelect({
          flags: {
            polygon: {
              feature: {
                draggable: false,
                coordinates: {
                  midpoints: false,
                  draggable: false,
                },
              },
            },
          },
        }),
      ],
    });

    // Wait for Google Maps to finish rendering before starting Terra Draw.
    // The adapter attaches event listeners to the map's internal DOM, which
    // does not exist until the map fires its first 'idle' event.
    google.maps.event.addListenerOnce(map, "idle", function () {
      draw.start();
      draw.setMode("polygon");
    });

    return {
      map: map,
      draw: draw,
      canvas: canvas,
      zoom: opts.zoom,
    };
  }

  /**
   * Switch to polygon drawing mode.
   */
  function startDrawing(ctx) {
    ctx.draw.setMode("polygon");
  }

  /**
   * Switch to select mode (for choosing polygons to delete).
   */
  function stopDrawing(ctx) {
    ctx.draw.setMode("select");
  }

  /**
   * Remove the currently selected polygon, if any.
   */
  function deleteSelected(ctx) {
    var selectedId = ctx.draw.getSelectedFeatureId
      ? ctx.draw.getSelectedFeatureId()
      : null;
    if (selectedId != null) {
      ctx.draw.removeFeatures([selectedId]);
    }
  }

  /**
   * Clear all polygons from the drawing.
   */
  function resetDrawing(ctx) {
    ctx.draw.clear();
  }

  /**
   * Return the current polygon features as a GeoJSON array.
   */
  function getFeatures(ctx) {
    var snapshot = ctx.draw.getSnapshot();
    return snapshot.filter(function (f) {
      return f.geometry && f.geometry.type === "Polygon";
    });
  }

  /**
   * Create the Draw/Stop/Delete/Reset/Done buttons.
   * Returns an object with button elements.
   *
   * @param {object} ctx - drawing context from createMapCanvas
   * @param {object} labels - optional label overrides (from i18n.getLabels)
   */
  function createButtons(ctx, labels) {
    labels = labels || {
      draw: "Draw",
      stop: "Stop",
      delete: "Delete",
      reset: "Reset",
      done: "Done",
    };
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
      delete: mkButton(labels.delete),
      reset: mkButton(labels.reset),
      done: mkButton(labels.done),
    };
  }

  /**
   * Collect the drawing result: coordinate string and zoom level.
   */
  function collectResult(ctx) {
    var features = getFeatures(ctx);
    return {
      coordinates: coordinates.serializeGeoJSONPolygons(features),
      zoom: ctx.zoom,
    };
  }

  exports.createMapCanvas = createMapCanvas;
  exports.startDrawing = startDrawing;
  exports.stopDrawing = stopDrawing;
  exports.deleteSelected = deleteSelected;
  exports.resetDrawing = resetDrawing;
  exports.getFeatures = getFeatures;
  exports.createButtons = createButtons;
  exports.collectResult = collectResult;
})(typeof module !== "undefined" ? module.exports : (this.QMDrawing = {}));
