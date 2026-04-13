"""
Tests for Python code that parses, visualizes, and describes map drawing
data from Qualtrics survey exports.

Why these matter: Same rationale as the R tests -- the researcher's analysis
pipeline must be able to ingest the coordinate strings, merge them with
survey response data, and do spatial analysis. Some researchers will use
Python (geopandas/shapely) instead of R (sf). Both paths must work.

The key integration point: the Qualtrics CSV has one row per respondent.
Some columns are survey responses (possibly from randomized questions or
conjoint experiments). One column is the map drawing coordinate string.
Other columns record experimental assignments (which overlay was shown,
what zoom level, etc.). The researcher needs all of this in one data
structure for analysis.

Run with: python -m pytest tests/python/test_parse_map_data.py -v
Requires: pip install geopandas shapely matplotlib pytest
"""

import json
import pytest

# Module under test -- will be created in python/parse_map_data.py
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


# --- Fixture data ---

SAMPLE_CSV_ROWS = [
    {
        "ResponseID": "R_abc123",
        "MapDrawing": "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164",
        "zoom": 14,
        "Q1_community_attachment": 4,
        "Q2_years_in_neighborhood": 10,
        "MapAssignments": '{"overlayCondition":"ward_boundary","showTraffic":false}',
    },
    {
        "ResponseID": "R_def456",
        "MapDrawing": "-88.25 40.12,-88.23 40.10,-88.21 40.12;-88.30 40.15,-88.28 40.13,-88.26 40.15",
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
        coords = "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164"
        result = parse_coordinate_string(coords)
        # Should return a list of shapely Polygon objects
        assert len(result) == 1
        assert result[0].geom_type == "Polygon"

    def test_multiple_polygons(self):
        coords = "-88.25 40.12,-88.23 40.10,-88.21 40.12;-88.30 40.15,-88.28 40.13,-88.26 40.15"
        result = parse_coordinate_string(coords)
        assert len(result) == 2

    def test_empty_string(self):
        result = parse_coordinate_string("")
        assert len(result) == 0

    def test_longitude_first(self):
        """The coordinate string uses lon-lat order. Verify we parse correctly."""
        coords = "-88.2434 40.1164,-88.2334 40.1064,-88.2234 40.1164"
        result = parse_coordinate_string(coords)
        # Centroid should be near Champaign IL (lon ~ -88, lat ~ 40)
        centroid = result[0].centroid
        assert centroid.x < -80  # longitude
        assert centroid.y > 30  # latitude

    def test_precision_preserved(self):
        coords = "-88.24342 40.11641"
        result = parse_coordinate_string(coords)
        # With only one point, we get a degenerate polygon, but the
        # coordinate values should be preserved
        bounds = result[0].bounds
        assert abs(bounds[0] - (-88.24342)) < 0.0001


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
        # Row 3 had no drawing
        assert gdf.geometry.iloc[2].is_empty
        # But survey data is preserved
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
        # Respondent 1 drew a triangle -- area should be positive
        assert desc["area_m2"].iloc[0] > 0

    def test_computes_centroid(self):
        import pandas as pd

        df = pd.DataFrame(SAMPLE_CSV_ROWS)
        gdf = to_geodataframe(df, coord_col="MapDrawing")
        desc = compute_spatial_descriptives(gdf)
        assert "centroid_lat" in desc.columns
        assert "centroid_lng" in desc.columns
        # Centroid should be near Champaign
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
        # Should return a matplotlib Figure
        assert fig is not None
