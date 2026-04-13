# Tests for R code that helps researchers prepare overlay data for the survey.
#
# Why these matter: The researcher needs to go from "I have census tract
# shapefiles" to "I have GeoJSON that my Qualtrics survey JavaScript can
# load and display." This is the bridge between the researcher's spatial
# data (in R) and the survey tool (in JavaScript).
#
# The workflow is:
#   1. Researcher loads boundary data in R (e.g., from tigris or sf)
#   2. Converts to GeoJSON suitable for the survey tool
#   3. Optionally hosts the GeoJSON at a URL the survey can fetch
#   4. The survey JavaScript receives a geocoded point, finds the
#      containing boundary, and displays it as a translucent overlay
#
# Run with: Rscript -e 'testthat::test_file("tests/R/test-overlay-setup.R")'

library(testthat)
library(sf)
library(jsonlite)

# Source the module under test.
.project_root <- if (file.exists("R/overlay_setup.R")) {
  "."
} else if (file.exists("../../R/overlay_setup.R")) {
  "../.."
} else {
  stop("Cannot find R/overlay_setup.R -- run from project root or tests/R/")
}
source(file.path(.project_root, "R", "overlay_setup.R"))

# --- Fixture data: a few fake census tracts ---
make_test_tracts <- function() {
  # Three adjacent census tracts as simple rectangles
  tract1 <- st_polygon(list(matrix(c(
    -88.26, 40.10,
    -88.24, 40.10,
    -88.24, 40.12,
    -88.26, 40.12,
    -88.26, 40.10
  ), ncol = 2, byrow = TRUE)))

  tract2 <- st_polygon(list(matrix(c(
    -88.24, 40.10,
    -88.22, 40.10,
    -88.22, 40.12,
    -88.24, 40.12,
    -88.24, 40.10
  ), ncol = 2, byrow = TRUE)))

  tract3 <- st_polygon(list(matrix(c(
    -88.22, 40.10,
    -88.20, 40.10,
    -88.20, 40.12,
    -88.22, 40.12,
    -88.22, 40.10
  ), ncol = 2, byrow = TRUE)))

  st_sf(
    TRACTCE = c("000100", "000200", "000300"),
    NAME = c("Tract 1", "Tract 2", "Tract 3"),
    geometry = st_sfc(tract1, tract2, tract3, crs = 4326)
  )
}


# --- GeoJSON conversion ---

test_that("boundaries_to_geojson converts sf to a GeoJSON string", {
  tracts <- make_test_tracts()
  geojson_str <- boundaries_to_geojson(tracts)

  # Should be valid JSON
  parsed <- jsonlite::fromJSON(geojson_str)
  expect_equal(parsed$type, "FeatureCollection")
  expect_equal(length(parsed$features$type), 3)
})

test_that("GeoJSON output preserves property columns", {
  tracts <- make_test_tracts()
  geojson_str <- boundaries_to_geojson(tracts)
  parsed <- jsonlite::fromJSON(geojson_str)

  # The TRACTCE and NAME columns should appear in properties
  expect_true("TRACTCE" %in% names(parsed$features$properties))
  expect_true("NAME" %in% names(parsed$features$properties))
})

test_that("GeoJSON output is in WGS84", {
  tracts <- make_test_tracts()
  geojson_str <- boundaries_to_geojson(tracts)
  # GeoJSON RFC 7946 requires WGS84. If the input is in a different CRS,
  # boundaries_to_geojson should transform it.
  # Read back as sf to check CRS directly -- more reliable than parsing
  # the nested JSON coordinate structure.
  tmp <- tempfile(fileext = ".geojson")
  writeLines(geojson_str, tmp)
  read_back <- st_read(tmp, quiet = TRUE)
  expect_equal(st_crs(read_back)$epsg, 4326L)
  bbox <- st_bbox(read_back)
  expect_true(bbox["xmin"] < 0)   # longitude negative (western hemisphere)
  expect_true(bbox["ymin"] > 0)   # latitude positive (northern hemisphere)
  unlink(tmp)
})


# --- Point-in-polygon lookup ---

test_that("find_containing_boundary returns the tract containing a point", {
  tracts <- make_test_tracts()
  # A point inside tract 2
  point <- st_point(c(-88.23, 40.11))
  point_sf <- st_sf(geometry = st_sfc(point, crs = 4326))

  result <- find_containing_boundary(tracts, point_sf)
  expect_equal(nrow(result), 1)
  expect_equal(result$TRACTCE, "000200")
})

test_that("find_containing_boundary returns empty sf when point is outside all tracts", {
  tracts <- make_test_tracts()
  # A point far away
  point <- st_point(c(-70.0, 42.0))
  point_sf <- st_sf(geometry = st_sfc(point, crs = 4326))

  result <- find_containing_boundary(tracts, point_sf)
  expect_equal(nrow(result), 0)
})

test_that("find_containing_boundary works when point is on a shared edge", {
  # Edge case: a point exactly on the boundary between two tracts.
  # st_intersects should pick up at least one.
  tracts <- make_test_tracts()
  point <- st_point(c(-88.24, 40.11)) # on the edge between tract 1 and 2
  point_sf <- st_sf(geometry = st_sfc(point, crs = 4326))

  result <- find_containing_boundary(tracts, point_sf)
  expect_true(nrow(result) >= 1)
})


# --- Preparing overlay for the survey ---

test_that("prepare_overlay_for_point selects the right tract and returns GeoJSON", {
  # This is the full workflow: given all tracts and a geocoded point,
  # find the containing tract and return its GeoJSON for the survey JS.
  tracts <- make_test_tracts()
  point <- st_point(c(-88.23, 40.11))
  point_sf <- st_sf(geometry = st_sfc(point, crs = 4326))

  overlay <- prepare_overlay_for_point(tracts, point_sf)

  # Should be a GeoJSON string containing just the matching tract
  parsed <- jsonlite::fromJSON(overlay)
  expect_equal(parsed$type, "FeatureCollection")
  expect_equal(length(parsed$features$type), 1)
  expect_equal(parsed$features$properties$TRACTCE, "000200")
})

test_that("prepare_overlay_for_point returns NULL when no tract contains the point", {
  tracts <- make_test_tracts()
  point <- st_point(c(-70.0, 42.0))
  point_sf <- st_sf(geometry = st_sfc(point, crs = 4326))

  overlay <- prepare_overlay_for_point(tracts, point_sf)
  expect_null(overlay)
})


# --- Example workflow: getting census tract data ---
# This test documents the recommended workflow for researchers
# who want to use census tract boundaries as overlays.

test_that("documented workflow: sf object to survey-ready GeoJSON", {
  # Step 1: Researcher has an sf object (from tigris, census API, shapefile, etc.)
  tracts <- make_test_tracts()

  # Step 2: Convert to GeoJSON for the survey
  geojson_str <- boundaries_to_geojson(tracts)

  # Step 3: The GeoJSON should be valid and parseable by JavaScript
  parsed <- jsonlite::fromJSON(geojson_str)
  expect_equal(parsed$type, "FeatureCollection")

  # Step 4: The researcher can save this to a file and host it
  # (or embed it directly in the Qualtrics JavaScript)
  tmp <- tempfile(fileext = ".geojson")
  writeLines(geojson_str, tmp)
  expect_true(file.exists(tmp))

  # Step 5: Reading it back should produce valid GeoJSON
  read_back <- readLines(tmp)
  parsed_back <- jsonlite::fromJSON(paste(read_back, collapse = ""))
  expect_equal(parsed_back$type, "FeatureCollection")

  unlink(tmp)
})
