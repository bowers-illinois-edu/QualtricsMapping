# Tests for R code that parses, visualizes, and describes map drawing data
# from Qualtrics survey exports.
#
# Why these matter: The researcher's analysis pipeline starts here. They
# download a CSV from Qualtrics with one row per respondent. One column
# contains a WKT geometry string from the map drawing. Other columns contain
# survey responses (possibly from randomized questions, conjoint experiments,
# etc.). The researcher needs to:
#   1. Parse the WKT string into spatial objects (sf)
#   2. Merge spatial data with survey response data for joint analysis
#   3. Visualize what respondents drew
#   4. Compute spatial descriptives (area, centroid, overlap)
#   5. Use these as outcomes or treatments in statistical models
#
# WKT is the standard geometry format for tabular data. sf::st_as_sfc()
# parses it natively -- no custom parser needed.
#
# Run with: Rscript -e 'testthat::test_file("tests/R/test-parse-map-data.R")'

library(testthat)
library(sf)

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
# MapDrawing column now contains WKT strings.
sample_qualtrics_export <- data.frame(
  ResponseID = c("R_abc123", "R_def456", "R_ghi789"),
  MapDrawing = c(
    # Respondent 1: one triangle near Champaign, IL
    "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))",
    # Respondent 2: two polygons
    "MULTIPOLYGON(((-88.25 40.12, -88.23 40.10, -88.21 40.12, -88.25 40.12)), ((-88.30 40.15, -88.28 40.13, -88.26 40.15, -88.30 40.15)))",
    # Respondent 3: drew nothing (clicked Done immediately)
    ""
  ),
  zoom = c(14, 12, 14),
  Q1_community_attachment = c(4, 5, 3),
  Q2_years_in_neighborhood = c(10, 2, 7),
  MapAssignments = c(
    '{"overlayCondition":"ward_boundary","showTraffic":false}',
    '{"overlayCondition":"census_tract","showTraffic":true}',
    '{"overlayCondition":"control","showTraffic":false}'
  ),
  stringsAsFactors = FALSE
)


# --- Parsing tests ---

test_that("parse_coordinate_string converts POLYGON WKT to an sf polygon", {
  wkt <- "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
  result <- parse_coordinate_string(wkt)

  expect_s3_class(result, "sfc")
  expect_equal(length(result), 1)
  expect_true(sf::st_is(result[[1]], "POLYGON"))
})

test_that("parse_coordinate_string handles MULTIPOLYGON WKT", {
  wkt <- "MULTIPOLYGON(((-88.25 40.12, -88.23 40.10, -88.21 40.12, -88.25 40.12)), ((-88.30 40.15, -88.28 40.13, -88.26 40.15, -88.30 40.15)))"
  result <- parse_coordinate_string(wkt)
  expect_equal(length(result), 2)
})

test_that("parse_coordinate_string returns empty geometry for empty string", {
  result <- parse_coordinate_string("")
  expect_equal(length(result), 0)
})

test_that("parsed coordinates are in WGS84 (EPSG:4326)", {
  wkt <- "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
  result <- parse_coordinate_string(wkt)
  crs <- sf::st_crs(result)
  expect_equal(crs$epsg, 4326L)
})

test_that("WKT uses longitude-first order, parsed correctly by sf", {
  # WKT coordinates are x y = longitude latitude.
  # sf reads them correctly: x -> easting (lon), y -> northing (lat).
  wkt <- "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
  result <- parse_coordinate_string(wkt)
  bbox <- sf::st_bbox(result)
  # xmin/xmax should be longitude (negative, around -88)
  expect_true(bbox["xmin"] < -80)
  # ymin/ymax should be latitude (positive, around 40)
  expect_true(bbox["ymin"] > 30)
})

test_that("legacy format (pre-WKT) is still parseable for old data", {
  # Data collected before April 2026 used "lon lat,lon lat;lon lat" format.
  # The parser auto-detects and handles both.
  legacy <- "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164"
  result <- parse_coordinate_string(legacy)
  expect_equal(length(result), 1)
  expect_true(sf::st_is(result[[1]], "POLYGON"))
  bbox <- sf::st_bbox(result)
  expect_true(bbox["xmin"] < -80)
})

test_that("legacy format with multiple polygons is parseable", {
  legacy <- "-88.25 40.12,-88.23 40.10,-88.21 40.12;-88.30 40.15,-88.28 40.13,-88.26 40.15"
  result <- parse_coordinate_string(legacy)
  expect_equal(length(result), 2)
})

test_that("standard WKT is readable without custom parsing code", {
  # The whole point of WKT: sf::st_as_sfc handles it natively.
  # No need to source any custom R functions.
  wkt <- "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
  result <- sf::st_as_sfc(wkt, crs = 4326)
  expect_s3_class(result, "sfc")
  expect_equal(length(result), 1)
  expect_true(sf::st_is(result[[1]], "POLYGON"))
})


# --- Data frame conversion tests ---

test_that("parse_qualtrics_map_data converts a data frame to sf", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )

  expect_s3_class(result, "sf")
  expect_equal(nrow(result), 3)
  expect_true("Q1_community_attachment" %in% names(result))
  expect_true("Q2_years_in_neighborhood" %in% names(result))
  expect_true("ResponseID" %in% names(result))
})

test_that("respondents with no drawing get empty geometry, not NA or error", {
  # Dropping respondents who did not draw would bias the sample.
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )
  expect_true(sf::st_is_empty(result$geometry[3]))
  expect_equal(result$Q1_community_attachment[3], 3)
})


# --- Experimental assignment parsing ---

test_that("parse_assignments extracts JSON assignment columns", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing",
    assignments_col = "MapAssignments"
  )
  expect_true("overlayCondition" %in% names(result))
  expect_true("showTraffic" %in% names(result))
  expect_equal(result$overlayCondition[1], "ward_boundary")
  expect_equal(result$overlayCondition[2], "census_tract")
  expect_equal(result$overlayCondition[3], "control")
})

test_that("treatment assignments are available for use as factors in models", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing",
    assignments_col = "MapAssignments"
  )
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
  expect_true(descriptives$area_m2[1] > 0)
  expect_true(is.na(descriptives$area_m2[3]) || descriptives$area_m2[3] == 0)
})

test_that("spatial descriptives can be merged with survey data for analysis", {
  result <- parse_qualtrics_map_data(sample_qualtrics_export,
    coord_col = "MapDrawing"
  )
  descriptives <- compute_spatial_descriptives(result)

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
