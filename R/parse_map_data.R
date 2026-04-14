# Functions for parsing, visualizing, and describing map drawing data
# from Qualtrics survey exports.
#
# The researcher downloads a CSV from Qualtrics with one row per respondent.
# One column contains a WKT (Well-Known Text) geometry string from the map
# drawing exercise. Other columns contain survey responses and experimental
# assignment metadata. These functions turn that CSV into an sf object ready
# for spatial analysis merged with the survey response data.
#
# The WKT format means no custom parsing is needed:
#   sf::st_as_sfc("POLYGON((-88.24 40.12, ...))", crs = 4326)
# works out of the box. These helper functions add convenience for the full
# workflow: parse, merge, describe, and visualize.

library(sf)
library(jsonlite)

#' Parse a WKT coordinate string into an sfc geometry.
#'
#' The MapDrawing column in the Qualtrics CSV contains WKT:
#'   - Single polygon: POLYGON((-88.24 40.12, -88.23 40.11, ..., -88.24 40.12))
#'   - Multiple:       MULTIPOLYGON(((...)), ((...)))
#'   - Empty:          "" (empty string)
#'
#' Coordinates are in WGS84 (EPSG:4326), longitude first.
#'
#' @param wkt_str A single WKT string from the MapDrawing column.
#' @return An sfc object containing the geometry, in WGS84.
parse_coordinate_string <- function(coord_str) {
  if (is.na(coord_str) || nchar(trimws(coord_str)) == 0) {
    return(st_sfc(crs = 4326))
  }

  coord_str <- trimws(coord_str)

  # Detect format: WKT starts with a geometry type keyword;
  # the legacy format starts with a number (longitude).
  is_wkt <- grepl("^(POLYGON|MULTIPOLYGON|GEOMETRYCOLLECTION)", coord_str)

  if (is_wkt) {
    # WKT: sf parses it natively
    geom <- st_as_sfc(coord_str, crs = 4326)
    # If MULTIPOLYGON, extract individual polygons
    if (length(geom) == 1 && st_geometry_type(geom) == "MULTIPOLYGON") {
      return(st_cast(geom, "POLYGON"))
    }
    return(geom)
  }

  # Legacy format: "lon lat,lon lat;lon lat,lon lat"
  # Returns an sfc with one polygon per semicolon-separated group.
  parse_legacy_coordinate_string(coord_str)
}


#' Parse the legacy (pre-WKT) coordinate string format.
#'
#' Format: "lon lat,lon lat,lon lat;lon lat,lon lat,lon lat"
#' Commas separate vertices, semicolons separate polygons.
#' This function exists for backward compatibility with data collected
#' before the WKT migration.
#'
#' @param coords_str A legacy coordinate string.
#' @return An sfc object.
parse_legacy_coordinate_string <- function(coords_str) {
  poly_strings <- strsplit(coords_str, ";")[[1]]
  polygons <- lapply(poly_strings, function(ps) {
    vertex_strings <- strsplit(trimws(ps), ",")[[1]]
    coords <- do.call(rbind, lapply(vertex_strings, function(vs) {
      parts <- as.numeric(strsplit(trimws(vs), " ")[[1]])
      c(parts[1], parts[2])
    }))
    # Close the ring
    if (nrow(coords) > 0 &&
      (coords[1, 1] != coords[nrow(coords), 1] ||
        coords[1, 2] != coords[nrow(coords), 2])) {
      coords <- rbind(coords, coords[1, ])
    }
    # Degenerate polygon guard
    while (nrow(coords) < 4) {
      coords <- rbind(coords, coords[1, ])
    }
    st_polygon(list(coords))
  })
  st_sfc(polygons, crs = 4326)
}


#' Convert a Qualtrics export data frame to an sf object.
#'
#' @param df A data.frame from read.csv() of the Qualtrics export.
#' @param coord_col Name of the column containing WKT strings.
#' @param assignments_col Optional: name of the column containing JSON
#'   assignment metadata. If provided, the JSON is unpacked into columns.
#' @return An sf object with one row per respondent.
parse_qualtrics_map_data <- function(df, coord_col = "MapDrawing",
                                     assignments_col = NULL) {
  # Parse each respondent's WKT string into geometry
  geometries <- lapply(df[[coord_col]], parse_coordinate_string)

  # Combine: each respondent's geometry may have 0, 1, or many polygons.
  combined_geom <- lapply(geometries, function(geom) {
    if (length(geom) == 0) {
      st_geometrycollection()
    } else if (length(geom) == 1) {
      geom[[1]]
    } else {
      st_geometrycollection(geom)
    }
  })

  result <- st_sf(
    df,
    geometry = st_sfc(combined_geom, crs = 4326)
  )

  # Unpack JSON assignments if requested
  if (!is.null(assignments_col) && assignments_col %in% names(df)) {
    assignments_list <- lapply(df[[assignments_col]], function(json_str) {
      if (is.na(json_str) || nchar(trimws(json_str)) == 0) {
        return(list())
      }
      jsonlite::fromJSON(json_str)
    })
    all_keys <- unique(unlist(lapply(assignments_list, names)))
    for (key in all_keys) {
      result[[key]] <- sapply(assignments_list, function(a) {
        val <- a[[key]]
        if (is.null(val)) NA else val
      })
    }
  }

  result
}


#' Compute spatial descriptives for each respondent's drawing.
#'
#' Returns a data.frame with area (in square meters), centroid lat/lng,
#' and number of polygons drawn.
#'
#' @param sf_obj An sf object from parse_qualtrics_map_data().
#' @return A data.frame with columns: area_m2, centroid_lat, centroid_lng.
compute_spatial_descriptives <- function(sf_obj) {
  n <- nrow(sf_obj)
  area_m2 <- numeric(n)
  centroid_lat <- numeric(n)
  centroid_lng <- numeric(n)

  for (i in seq_len(n)) {
    geom <- sf_obj$geometry[i]
    if (st_is_empty(geom)) {
      area_m2[i] <- NA_real_
      centroid_lat[i] <- NA_real_
      centroid_lng[i] <- NA_real_
    } else {
      area_m2[i] <- as.numeric(st_area(geom))
      centroid <- st_centroid(geom)
      coords <- st_coordinates(centroid)
      centroid_lng[i] <- coords[1, "X"]
      centroid_lat[i] <- coords[1, "Y"]
    }
  }

  data.frame(
    area_m2 = area_m2,
    centroid_lat = centroid_lat,
    centroid_lng = centroid_lng
  )
}


#' Plot a single respondent's map drawing.
#'
#' @param sf_obj An sf object from parse_qualtrics_map_data().
#' @param respondent_id The ResponseID value to plot.
#' @return A ggplot object.
plot_respondent_map <- function(sf_obj, respondent_id) {
  if (!requireNamespace("ggplot2", quietly = TRUE)) {
    stop("ggplot2 is required for plotting")
  }
  row <- sf_obj[sf_obj$ResponseID == respondent_id, ]
  ggplot2::ggplot(row) +
    ggplot2::geom_sf(fill = "steelblue", alpha = 0.4) +
    ggplot2::labs(title = paste("Respondent:", respondent_id)) +
    ggplot2::theme_minimal()
}


#' Plot all respondents' drawings in a single map.
#'
#' @param sf_obj An sf object from parse_qualtrics_map_data().
#' @return A ggplot object.
plot_all_maps <- function(sf_obj) {
  if (!requireNamespace("ggplot2", quietly = TRUE)) {
    stop("ggplot2 is required for plotting")
  }
  ggplot2::ggplot(sf_obj) +
    ggplot2::geom_sf(fill = "steelblue", alpha = 0.4) +
    ggplot2::theme_minimal()
}
