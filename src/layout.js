/**
 * Layout and sizing for mobile-friendly map display.
 *
 * Many respondents will be on phones, possibly older or lower-end devices
 * in developing countries. Buttons must be large enough to tap (minimum
 * 44px per Apple HIG), the map must fill available width, and scroll/zoom
 * gestures must not conflict with page scrolling.
 */

(function (exports) {
  /**
   * Compute CSS styles for the map canvas element.
   */
  function getCanvasStyle(opts) {
    return {
      width: "100%",
      minHeight: "300px",
      // Height scales with container, but never below 300px
      height: Math.max(300, (opts.containerWidth || 375) * 0.8) + "px",
    };
  }

  /**
   * Compute button dimensions for a given viewport width.
   * Ensures touch targets meet the 44px minimum (Apple HIG).
   */
  function getButtonSize(opts) {
    var vw = opts.viewportWidth || 375;
    // Scale font with viewport: 2.5% of viewport width, floored at 14px
    var fontSize = Math.max(14, Math.ceil(vw * 0.025));
    // Button size: at least 44px, scales slightly with font
    var minDim = Math.max(44, fontSize * 2.5);

    return {
      fontSize: fontSize,
      minWidth: minDim,
      minHeight: minDim,
    };
  }

  /**
   * Map interaction options that work well on touch devices.
   */
  function getMapInteractionOptions() {
    return {
      // Prevent scroll-to-zoom, which fires during normal page scrolling
      scrollwheel: false,
      // "cooperative" requires two-finger pan on mobile, so single-finger
      // scroll is not captured by the map
      gestureHandling: "cooperative",
    };
  }

  exports.getCanvasStyle = getCanvasStyle;
  exports.getButtonSize = getButtonSize;
  exports.getMapInteractionOptions = getMapInteractionOptions;
})(typeof module !== "undefined" ? module.exports : (this.QMLayout = {}));
