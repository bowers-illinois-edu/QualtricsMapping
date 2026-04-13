# Tests for R code that parses, visualizes, and describes map drawing data
# from Qualtrics survey exports.
#
# Why these matter: The researcher's analysis pipeline starts here. They
# download a CSV from Qualtrics with one row per respondent. One column
# contains the coordinate string from the map drawing. Other columns contain
# survey responses (possibly from randomized questions, conjoint experiments,
# etc.). The researcher needs to:
#   1. Parse the coordinate string into spatial objects (sf)
#   2. Merge spatial data with survey response data for joint analysis
#   3. Visualize what respondents drew
#   4. Compute spatial descriptives (area, centroid, overlap)
#   5. Use these as outcomes or treatments in statistical models
#
# These tests verify that the R functions can do all of this correctly.
# Run with: Rscript -e 'testthat::test_file("tests/R/test-parse-map-data.R")'

library(testthat)
library(sf)

# Source the module under test.
# When run via test_file(), the working directory is the project root.
# We also handle being run from the tests/R/ directory directly.
.project_root <- if (file.exists("R/parse_map_data.R")) {
  "."
} else if (file.exists("../../R/parse_map_data.R")) {
  "../.."
} else {
  stop("Cannot find R/parse_map_data.R -- run from project root or tests/R/")
}
source(file.path(.project_root, "R", "parse_map_data.R"))

# --- Fixture data ---
# Simulates what a researcher would see in their Qualtrics CSV export.
# One row per respondent, MapDrawing column has the coordinate string.
sample_qualtrics_export <- data.frame(
  ResponseID = c("R_abc123", "R_def456", "R_ghi789"),
  # Respondent 1 drew one triangle, respondent 2 drew two polygons,
  # respondent 3 drew nothing (clicked Done immediately)
  MapDrawing = c(
    "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164",
    "-88.25 40.12,-88.23 40.10,-88.21 40.12;-88.30 40.15,-88.28 40.13,-88.26 40.15",
    ""
  ),
  zoom = c(14, 12, 14),
  # Survey response columns -- these come from the Qualtrics survey itself
  Q1_community_attachment = c(4, 5, 3),
  Q2_years_in_neighborhood = c(10, 2, 7),
  # Experimental assignments stored as JSON
  MapAssignments = c(
    '{"overlayCondition":"ward_boundary","showTraffic":false}',
    '{"overlayCondition":"census_tract","showTraffic":true}',
    '{"overlayCondition":"control","showTraffic":false}'
  ),
  stringsAsFactors = FALSE
)


# --- Parsing tests ---

test_that("parse_coordinate_string converts one polygon to an sf polygon", {
  coords_str <- "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164"
  result <- parse_coordinate_string(coords_str)

  expect_s3_class(result, "sfc")
  # Should have one polygon
  expect_equal(length(result), 1)
  # Should be a polygon geometry
  expect_true(sf::st_is(result[[1]], "POLYGON"))
})

test_that("parse_coordinate_string handles multiple polygons (semicolon-separated)", {
  coords_str <- "-88.25 40.12,-88.23 40.10,-88.21 40.12;-88.30 40.15,-88.28 40.13,-88.26 40.15"
  result <- parse_coordinate_string(coords_str)

  # Should produce a geometry collection or multipolygon with 2 parts
  # We store as a list of polygons so the researcher can work with each
  expect_equal(length(result), 2)
})

test_that("parse_coordinate_string returns empty geometry for empty string", {
  result <- parse_coordinate_string("")
  expect_equal(length(result), 0)
})

test_that("parsed coordinates are in WGS84 (EPSG:4326)", {
  coords_str <- "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164"
  result <- parse_coordinate_string(coords_str)
  crs <- sf::st_crs(result)
  expect_equal(crs$epsg, 4326L)
})

test_that("longitude comes first in the coordinate string (lon lat order)", {
  # This is a critical detail. The string format is "lon lat" but sf
  # expects coordinates as (x=lon, y=lat). Verify we read them correctly.
  coords_str <- "-88.2434 40.1164"
  result <- parse_coordinate_string(coords_str)
  # The point should be near Champaign, IL (lat ~40, lon ~-88)
  bbox <- sf::st_bbox(result)
  # xmin/xmax should be longitude (negative, around -88)
  expect_true(bbox["xmin"] < -80)
  # ymin/ymax should be latitude (positive, around 40)
  expect_true(bbox["ymin"] > 30)
})


# --- Data frame conversion tests ---

test_that("parse_qualtrics_map_data converts a data frame to sf", {
  # The main entry point: takes a Qualtrics CSV (as data.frame) and returns
  # an sf object with geometry and all other columns preserved.
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )

  expect_s3_class(result, "sf")
  expect_equal(nrow(result), 3)
  # Survey response columns should be preserved
  expect_true("Q1_community_attachment" %in% names(result))
  expect_true("Q2_years_in_neighborhood" %in% names(result))
  expect_true("ResponseID" %in% names(result))
})

test_that("respondents with no drawing get empty geometry, not NA or error", {
  # Why: dropping respondents who did not draw would bias the sample.
  # They should stay in the data with empty geometry so the researcher
  # can analyze non-response.
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )
  # Row 3 had empty MapDrawing
  expect_true(sf::st_is_empty(result$geometry[3]))
  # But the row should still exist with its survey responses
  expect_equal(result$Q1_community_attachment[3], 3)
})


# --- Experimental assignment parsing ---

test_that("parse_assignments extracts JSON assignment columns", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing",
    assignments_col = "MapAssignments"
  )
  # The JSON should be unpacked into columns
  expect_true("overlayCondition" %in% names(result))
  expect_true("showTraffic" %in% names(result))
  expect_equal(result$overlayCondition[1], "ward_boundary")
  expect_equal(result$overlayCondition[2], "census_tract")
  expect_equal(result$overlayCondition[3], "control")
})

test_that("treatment assignments are available for use as factors in models", {
  # Why: the researcher will run something like
  #   lm(Q1_community_attachment ~ overlayCondition, data = result)
  # The overlay condition must be a usable variable.
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing",
    assignments_col = "MapAssignments"
  )
  # Should be able to use overlayCondition as a predictor without error
  expect_no_error({
    lm(Q1_community_attachment ~ overlayCondition, data = result)
  })
})


# --- Spatial descriptives ---

test_that("compute_spatial_descriptives returns area and centroid", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )
  descriptives <- compute_spatial_descriptives(result)

  expect_true("area_m2" %in% names(descriptives))
  expect_true("centroid_lat" %in% names(descriptives))
  expect_true("centroid_lng" %in% names(descriptives))
  # Respondent 1 drew a triangle -- area should be positive
  expect_true(descriptives$area_m2[1] > 0)
  # Respondent 3 drew nothing -- area should be 0 or NA
  expect_true(is.na(descriptives$area_m2[3]) || descriptives$area_m2[3] == 0)
})

test_that("spatial descriptives can be merged with survey data for analysis", {
  # Why: the research question might be "do people with higher community
  # attachment draw larger areas?" This requires merging spatial descriptives
  # with survey responses.
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )
  descriptives <- compute_spatial_descriptives(result)

  # Merge should work by row position (same data frame)
  merged <- cbind(sf::st_drop_geometry(result), descriptives)
  expect_true("area_m2" %in% names(merged))
  expect_true("Q1_community_attachment" %in% names(merged))
  expect_equal(nrow(merged), 3)
})


# --- Visualization ---

test_that("plot_respondent_map returns a ggplot object", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )
  # Should be able to plot a single respondent's drawing
  p <- plot_respondent_map(result, respondent_id = "R_abc123")
  expect_s3_class(p, "ggplot")
})

test_that("plot_all_maps returns a ggplot showing all respondents", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )
  p <- plot_all_maps(result)
  expect_s3_class(p, "ggplot")
})
