# Functions for preparing overlay boundary data for the survey tool.
#
# Workflow:
#   1. Researcher loads boundary data in R (e.g., from tigris, sf, a shapefile)
#   2. Converts to GeoJSON with boundaries_to_geojson()
#   3. Hosts the GeoJSON at a URL or embeds it in the survey JavaScript
#   4. The survey JS receives a geocoded point and uses it to find the
#      containing boundary, then displays it as a translucent overlay
#
# These functions handle steps 1-3 in R and provide the spatial lookup
# that can also be done server-side if needed.

library(sf)
library(jsonlite)

#' Convert an sf object of boundaries to a GeoJSON string.
#'
#' The output is suitable for loading in the browser via Google Maps
#' Data layer (google.maps.Data.addGeoJson). If the input CRS is not
#' WGS84, it is transformed automatically (GeoJSON RFC 7946 requires WGS84).
#'
#' @param sf_obj An sf object containing boundary polygons.
#' @return A GeoJSON string (FeatureCollection).
boundaries_to_geojson <- function(sf_obj) {
  # Ensure WGS84
  if (!is.na(st_crs(sf_obj)) && st_crs(sf_obj)$epsg != 4326) {
    sf_obj <- st_transform(sf_obj, 4326)
  }
  # sf::st_write to GeoJSON string via a temporary connection
  tmp <- tempfile(fileext = ".geojson")
  st_write(sf_obj, tmp, driver = "GeoJSON", quiet = TRUE)
  geojson_str <- paste(readLines(tmp, warn = FALSE), collapse = "\n")
  unlink(tmp)
  geojson_str
}


#' Find which boundary feature(s) contain a given point.
#'
#' @param boundaries An sf object of boundary polygons.
#' @param point An sf object with a single point geometry.
#' @return An sf object containing the matching boundary rows (may be empty).
find_containing_boundary <- function(boundaries, point) {
  # st_intersects returns a sparse list; we want rows that intersect
  hits <- st_intersects(point, boundaries)[[1]]
  if (length(hits) == 0) {
    return(boundaries[integer(0), ])
  }
  boundaries[hits, ]
}


#' Full workflow: given boundaries and a point, return GeoJSON of the
#' containing boundary for use in the survey.
#'
#' @param boundaries An sf object of boundary polygons.
#' @param point An sf object with a single point geometry.
#' @return A GeoJSON string of the containing boundary, or NULL if none.
prepare_overlay_for_point <- function(boundaries, point) {
  containing <- find_containing_boundary(boundaries, point)
  if (nrow(containing) == 0) {
    return(NULL)
  }
  boundaries_to_geojson(containing)
}
