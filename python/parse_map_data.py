"""
Parse, visualize, and describe map drawing data from Qualtrics exports.

The researcher downloads a CSV from Qualtrics. One column contains a WKT
(Well-Known Text) geometry string from the map drawing. Other columns contain
survey responses and experimental assignments. These functions turn that CSV
into a GeoDataFrame ready for spatial analysis.

WKT format:
    Single polygon:   POLYGON((-88.24 40.12, -88.23 40.11, ..., -88.24 40.12))
    Multiple:         MULTIPOLYGON(((...)), ((...)))
    Empty:            "" (empty string)

Coordinates are WGS84 (EPSG:4326), longitude first.

Because the format is standard WKT, no custom parser is needed:
    shapely.wkt.loads("POLYGON((-88.24 40.12, ...))")
works out of the box.

Requirements: pip install geopandas shapely matplotlib
         or:  uv add geopandas shapely matplotlib
"""

import json
import math

import geopandas as gpd
import pandas as pd
from shapely.geometry import Polygon, GeometryCollection, mapping
from shapely import wkt


def parse_coordinate_string(coord_str):
    """Parse a coordinate string into a list of shapely Polygon objects.

    Supports both WKT (current format) and the legacy "lon lat,lon lat;..."
    format for backward compatibility with data collected before April 2026.

    Args:
        coord_str: WKT or legacy coordinate string from MapDrawing column.

    Returns:
        List of shapely Polygon objects (may be empty).
    """
    if not coord_str or not coord_str.strip():
        return []

    coord_str = coord_str.strip()

    # Detect format: WKT starts with a geometry type keyword
    if coord_str.startswith(("POLYGON", "MULTIPOLYGON", "GEOMETRYCOLLECTION")):
        geom = wkt.loads(coord_str)
        if geom.geom_type == "MultiPolygon":
            return list(geom.geoms)
        return [geom]

    # Legacy format: "lon lat,lon lat;lon lat,lon lat"
    return _parse_legacy_coordinate_string(coord_str)


def _parse_legacy_coordinate_string(coords_str):
    """Parse the pre-WKT coordinate format for backward compatibility."""
    polygons = []
    for poly_str in coords_str.split(";"):
        vertices = []
        for vertex_str in poly_str.split(","):
            parts = vertex_str.strip().split(" ")
            lng, lat = float(parts[0]), float(parts[1])
            vertices.append((lng, lat))
        if len(vertices) > 0 and vertices[0] != vertices[-1]:
            vertices.append(vertices[0])
        while len(vertices) < 4:
            vertices.append(vertices[0])
        polygons.append(Polygon(vertices))
    return polygons


def to_geodataframe(df, coord_col="MapDrawing"):
    """Convert a pandas DataFrame to a GeoDataFrame with parsed geometries.

    Args:
        df: pandas DataFrame from a Qualtrics CSV export.
        coord_col: Name of the column containing WKT strings.

    Returns:
        GeoDataFrame with one row per respondent, CRS set to EPSG:4326.
    """
    geometries = []
    for wkt_str in df[coord_col]:
        polys = parse_coordinate_string(wkt_str)
        if len(polys) == 0:
            geometries.append(GeometryCollection())  # empty geometry
        elif len(polys) == 1:
            geometries.append(polys[0])
        else:
            geometries.append(GeometryCollection(polys))

    gdf = gpd.GeoDataFrame(df, geometry=geometries, crs="EPSG:4326")
    return gdf


def parse_qualtrics_map_data(df, coord_col="MapDrawing", assignments_col=None):
    """Full parsing: WKT to geometry + unpack JSON assignments.

    Args:
        df: pandas DataFrame from a Qualtrics CSV export.
        coord_col: Name of the WKT string column.
        assignments_col: Optional name of the JSON assignments column.

    Returns:
        GeoDataFrame with geometry and unpacked assignment columns.
    """
    gdf = to_geodataframe(df, coord_col=coord_col)

    if assignments_col and assignments_col in gdf.columns:
        assignments = gdf[assignments_col].apply(
            lambda x: json.loads(x) if isinstance(x, str) and x.strip() else {}
        )
        assignments_df = pd.json_normalize(assignments)
        for col in assignments_df.columns:
            gdf[col] = assignments_df[col].values

    return gdf


def compute_spatial_descriptives(gdf):
    """Compute area, centroid, and polygon count for each respondent.

    Area is computed in square meters by projecting to an equal-area CRS.

    Args:
        gdf: GeoDataFrame from to_geodataframe() or parse_qualtrics_map_data().

    Returns:
        DataFrame with columns: area_m2, centroid_lat, centroid_lng.
    """
    gdf_proj = gdf.to_crs(epsg=6933)  # World Cylindrical Equal Area

    areas = []
    centroid_lats = []
    centroid_lngs = []

    for idx, row in gdf.iterrows():
        geom = row.geometry
        geom_proj = gdf_proj.geometry.iloc[idx] if idx < len(gdf_proj) else geom

        if geom.is_empty:
            areas.append(float("nan"))
            centroid_lats.append(float("nan"))
            centroid_lngs.append(float("nan"))
        else:
            areas.append(geom_proj.area)
            centroid = geom.centroid
            centroid_lngs.append(centroid.x)
            centroid_lats.append(centroid.y)

    return pd.DataFrame(
        {
            "area_m2": areas,
            "centroid_lat": centroid_lats,
            "centroid_lng": centroid_lngs,
        }
    )


def plot_respondent_map(gdf, respondent_id, id_col="ResponseID"):
    """Plot a single respondent's map drawing.

    Args:
        gdf: GeoDataFrame from to_geodataframe().
        respondent_id: Value in the id_col to select.
        id_col: Column name for respondent IDs.

    Returns:
        matplotlib Figure.
    """
    import matplotlib.pyplot as plt

    row = gdf[gdf[id_col] == respondent_id]
    fig, ax = plt.subplots(1, 1, figsize=(8, 6))
    row.plot(ax=ax, color="steelblue", alpha=0.4, edgecolor="black")
    ax.set_title(f"Respondent: {respondent_id}")
    return fig
