/**
 * Tests for mobile device compatibility.
 *
 * Why these matter: Many respondents will be on phones -- possibly older
 * or lower-end phones in developing countries. The map canvas must fill the
 * screen, buttons must be large enough to tap, and the drawing interaction
 * must not require hover or right-click.
 *
 * We cannot fully simulate touch interaction in jsdom, but we can verify
 * that the layout and sizing logic produces usable dimensions.
 */

var googleMaps = require("./mocks/google-maps");

beforeAll(function () {
  googleMaps.install();
});
afterAll(function () {
  googleMaps.uninstall();
});

// Module under test -- will be created in src/layout.js
var layout = require("../src/layout");

describe("map canvas sizing", function () {
  test("canvas width fills available container width", function () {
    var config = layout.getCanvasStyle({ containerWidth: 375 });
    // On a phone, the map should use all available width
    expect(config.width).toBe("100%");
  });

  test("canvas has a minimum height so the map is usable", function () {
    var config = layout.getCanvasStyle({ containerWidth: 375 });
    // parseFloat so "300px" -> 300
    var height = parseFloat(config.minHeight);
    // At least 300px -- smaller makes polygon drawing impractical
    expect(height).toBeGreaterThanOrEqual(300);
  });
});

describe("button sizing for touch targets", function () {
  test("buttons meet minimum touch target size on small screens", function () {
    // Apple and Google guidelines: minimum 44px (Apple) / 48dp (Material).
    // We use 44px as the floor.
    var size = layout.getButtonSize({ viewportWidth: 320 });
    expect(size.minWidth).toBeGreaterThanOrEqual(44);
    expect(size.minHeight).toBeGreaterThanOrEqual(44);
  });

  test("button font size scales with viewport but has a floor", function () {
    var small = layout.getButtonSize({ viewportWidth: 320 });
    var large = layout.getButtonSize({ viewportWidth: 1024 });
    // Font should be larger on larger screens
    expect(large.fontSize).toBeGreaterThan(small.fontSize);
    // But never below a readable minimum (14px)
    expect(small.fontSize).toBeGreaterThanOrEqual(14);
  });
});

describe("scroll and gesture behavior", function () {
  test("map configuration disables scroll-to-zoom to prevent accidental zooming", function () {
    // Why: on a phone, scroll-zoom is triggered by normal page scrolling.
    // Respondents end up zooming the map when trying to scroll past it.
    var mapOpts = layout.getMapInteractionOptions();
    expect(mapOpts.scrollwheel).toBe(false);
    // gestureHandling: "cooperative" requires two-finger pan on mobile,
    // preventing single-finger scroll from being captured by the map.
    expect(mapOpts.gestureHandling).toBe("cooperative");
  });
});
