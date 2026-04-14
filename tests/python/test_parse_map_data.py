"""
Tests for Python code that parses, visualizes, and describes map drawing
data from Qualtrics survey exports.

Why these matter: Same rationale as the R tests -- the researcher's analysis
pipeline must be able to ingest WKT strings, merge them with survey response
data, and do spatial analysis. Some researchers will use Python
(geopandas/shapely) instead of R (sf). Both paths must work.

The format is WKT (Well-Known Text), so parsing is one line:
    shapely.wkt.loads("POLYGON((-88.24 40.12, ...))")

Run with: python -m pytest tests/python/test_parse_map_data.py -v
Requires: pip install geopandas shapely matplotlib pytest
"""

import json
import pytest

import sys
import os

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "python")
)
from parse_map_data import (
    parse_coordinate_string,
    parse_qualtrics_map_data,
    compute_spatial_descriptives,
    plot_respondent_map,
    to_geodataframe,
)


# --- Fixture data (WKT format) ---

SAMPLE_CSV_ROWS = [
    {
        "ResponseID": "R_abc123",
        "MapDrawing": "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))",
        "zoom": 14,
        "Q1_community_attachment": 4,
        "Q2_years_in_neighborhood": 10,
        "MapAssignments": '{"overlayCondition":"ward_boundary","showTraffic":false}',
    },
    {
        "ResponseID": "R_def456",
        "MapDrawing": "MULTIPOLYGON(((-88.25 40.12, -88.23 40.10, -88.21 40.12, -88.25 40.12)), ((-88.30 40.15, -88.28 40.13, -88.26 40.15, -88.30 40.15)))",
        "zoom": 12,
        "Q1_community_attachment": 5,
        "Q2_years_in_neighborhood": 2,
        "MapAssignments": '{"overlayCondition":"census_tract","showTraffic":true}',
    },
    {
        "ResponseID": "R_ghi789",
        "MapDrawing": "",
        "zoom": 14,
        "Q1_community_attachment": 3,
        "Q2_years_in_neighborhood": 7,
        "MapAssignments": '{"overlayCondition":"control","showTraffic":false}',
    },
]


# --- Parsing tests ---


class TestParseCoordinateString:
    def test_one_polygon(self):
        wkt = "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
        result = parse_coordinate_string(wkt)
        assert len(result) == 1
        assert result[0].geom_type == "Polygon"

    def test_multiple_polygons(self):
        wkt = "MULTIPOLYGON(((-88.25 40.12, -88.23 40.10, -88.21 40.12, -88.25 40.12)), ((-88.30 40.15, -88.28 40.13, -88.26 40.15, -88.30 40.15)))"
        result = parse_coordinate_string(wkt)
        assert len(result) == 2

    def test_empty_string(self):
        result = parse_coordinate_string("")
        assert len(result) == 0

    def test_longitude_first(self):
        """WKT uses x y = longitude latitude order."""
        wkt = "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
        result = parse_coordinate_string(wkt)
        centroid = result[0].centroid
        assert centroid.x < -80  # longitude
        assert centroid.y > 30  # latitude

    def test_standard_wkt_no_custom_parser_needed(self):
        """shapely.wkt.loads handles it directly -- no custom code."""
        from shapely import wkt as shapely_wkt
        wkt = "POLYGON((-88.2434 40.1164, -88.2334 40.1064, -88.2234 40.1164, -88.2434 40.1164))"
        geom = shapely_wkt.loads(wkt)
        assert geom.geom_type == "Polygon"
        assert not geom.is_empty


# --- DataFrame conversion ---


class TestParseQualtricsCsv:
    def test_converts_to_geodataframe(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        assert hasattr(gdf, "geometry")
        assert len(gdf) == 3

    def test_preserves_survey_columns(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        assert "Q1_community_attachment" in gdf.columns
        assert "Q2_years_in_neighborhood" in gdf.columns
        assert "ResponseID" in gdf.columns

    def test_empty_drawing_produces_empty_geometry(self):
        """Respondents who did not draw should remain in the data."""
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        assert gdf.geometry.iloc[2].is_empty
        assert gdf.iloc[2]["Q1_community_attachment"] == 3

    def test_crs_is_wgs84(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        assert gdf.crs.to_epsg() == 4326


# --- Assignment parsing ---


class TestAssignmentParsing:
    def test_unpacks_json_assignments(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = parse_qualtrics_map_data(
            df, coord_col="MapDrawing", assignments_col="MapAssignments"
        )
        assert "overlayCondition" in gdf.columns
        assert gdf.iloc[0]["overlayCondition"] == "ward_boundary"
        assert gdf.iloc[2]["overlayCondition"] == "control"

    def test_assignments_usable_as_categorical_variable(self):
        """Researcher should be able to group by overlay condition."""
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = parse_qualtrics_map_data(
            df, coord_col="MapDrawing", assignments_col="MapAssignments"
        )
        grouped = gdf.groupby("overlayCondition")["Q1_community_attachment"].mean()
        assert len(grouped) == 3


# --- Spatial descriptives ---


class TestSpatialDescriptives:
    def test_computes_area(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        desc = compute_spatial_descriptives(gdf)
        assert desc["area_m2"].iloc[0] > 0

    def test_computes_centroid(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        desc = compute_spatial_descriptives(gdf)
        assert "centroid_lat" in desc.columns
        assert "centroid_lng" in desc.columns
        assert desc["centroid_lat"].iloc[0] > 30

    def test_empty_geometry_gets_nan_descriptives(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        desc = compute_spatial_descriptives(gdf)
        import math

        assert math.isnan(desc["area_m2"].iloc[2]) or desc["area_m2"].iloc[2] == 0


# --- Visualization ---


class TestVisualization:
    def test_plot_respondent_returns_figure(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        fig = plot_respondent_map(gdf, respondent_id="R_abc123")
        assert fig is not None
