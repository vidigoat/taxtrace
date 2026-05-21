"""Tests for the OCM parser.

We test against synthetic OCM fixtures that follow the CCSDS KVN convention.
Real OCM files from the TraCSS dataset will be added as fixtures once extracted.
"""

from __future__ import annotations

from datetime import datetime

from skyshield.propagate.ocm import parse_ocm_epoch, parse_ocm_text

MINIMAL_OCM = """CCSDS_OCM_VERS = 2.0
CREATION_DATE = 2025-01-01T00:00:00
ORIGINATOR = AEROSPACE_TEST
META_START
OBJECT_NAME = TEST-SAT
OBJECT_DESIGNATOR = 25544
REF_FRAME = EME2000
TIME_SYSTEM = UTC
OD_EPOCH = 2024-12-28T00:00:00
USEABLE_START_TIME = 2025-01-01T12:00:00
USEABLE_STOP_TIME = 2025-01-08T12:00:00
META_STOP
ORB_START
2025-01-01T12:00:00 6800.0 0.0 0.0 0.0 7.5 0.0
2025-01-01T12:01:00 6799.5 450.0 0.1 -0.05 7.499 0.0001
2025-01-01T12:02:00 6798.0 900.0 0.2 -0.1 7.495 0.0002
ORB_STOP
"""

OCM_WITH_COVARIANCE = """CCSDS_OCM_VERS = 2.0
META_START
OBJECT_DESIGNATOR = 12345
REF_FRAME = EME2000
TIME_SYSTEM = UTC
OD_EPOCH = 2024-12-30T00:00:00
META_STOP
ORB_START
2025-01-01T12:00:00 7000.0 0.0 0.0 0.0 7.0 0.0
ORB_STOP
COV_START
COV_REF_FRAME = RIC
2025-01-01T12:00:00 0.01 0.0 0.0 0.0 0.0 0.0 0.1 0.0 0.0 0.0 0.0 0.1 0.0 0.0 0.0 1e-5 0.0 0.0 1e-5 0.0 1e-5
COV_STOP
"""


def test_parse_minimal():
    ocm = parse_ocm_text(MINIMAL_OCM)
    assert ocm.object_designator == "25544"
    assert ocm.object_name == "TEST-SAT"
    assert ocm.ref_frame == "EME2000"
    assert ocm.time_system == "UTC"
    assert ocm.sat_id == 25544
    assert len(ocm.states) == 3
    assert ocm.states[0].x == 6800.0
    assert ocm.states[1].vy == 7.499
    assert ocm.od_epoch == datetime(2024, 12, 28, 0, 0, 0)
    assert ocm.useable_start == datetime(2025, 1, 1, 12, 0, 0)
    assert ocm.useable_stop == datetime(2025, 1, 8, 12, 0, 0)


def test_state_matrix_shape():
    ocm = parse_ocm_text(MINIMAL_OCM)
    mat = ocm.state_matrix()
    assert mat.shape == (3, 6)


def test_od_age_filtering():
    """Per TraCSS §4.4, OD age must be < 14 days."""
    ocm = parse_ocm_text(MINIMAL_OCM)
    start = datetime(2025, 1, 1, 12, 0, 0)
    age = ocm.od_age_days(start)
    assert 4.0 < age < 5.0  # 2024-12-28 -> 2025-01-01 12:00 = ~4.5 days


def test_parse_epoch_formats():
    """Multiple CCSDS time formats should work."""
    assert parse_ocm_epoch("2025-01-01T12:00:00") == datetime(2025, 1, 1, 12, 0, 0)
    assert parse_ocm_epoch("2025-01-01T12:00:00.123456") == datetime(2025, 1, 1, 12, 0, 0, 123456)
    assert parse_ocm_epoch("2025-01-01T12:00:00Z") == datetime(2025, 1, 1, 12, 0, 0)
    # Day of year form
    assert parse_ocm_epoch("2025-001T12:00:00") == datetime(2025, 1, 1, 12, 0, 0)


def test_covariance_block():
    ocm = parse_ocm_text(OCM_WITH_COVARIANCE)
    assert len(ocm.covariances) == 1
    cov = ocm.covariances[0]
    assert len(cov.elements) == 21
    m = cov.as_matrix()
    assert m.shape == (6, 6)
    # Symmetric
    assert (m == m.T).all()


def test_invalid_designator_falls_back():
    text = "META_START\nOBJECT_DESIGNATOR = NOT_NUMERIC\nMETA_STOP\n"
    ocm = parse_ocm_text(text)
    assert isinstance(ocm.sat_id, int)


def test_extras_capture_unknown_fields():
    text = """META_START
OBJECT_DESIGNATOR = 99999
WEIRD_CUSTOM_FIELD = some-value
META_STOP
"""
    ocm = parse_ocm_text(text)
    assert ocm.extras.get("WEIRD_CUSTOM_FIELD") == "some-value"


def test_empty_text_returns_default_ocm():
    ocm = parse_ocm_text("")
    assert ocm.object_designator == "UNKNOWN"
    assert ocm.states == []
