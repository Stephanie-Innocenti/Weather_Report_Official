import datetime as dt

import pytest

from wr_pipeline import config, naming
from wr_pipeline.process import extract


def test_image_key():
    assert naming.image_key("ecmwf-ifs", "2026110400", "it", "t2m", 24) == "ecmwf-ifs/2026110400/it/t2m/f024.webp"


def test_run_id_roundtrip():
    r = dt.datetime(2026, 11, 4, 12)
    assert naming.parse_run_id(naming.run_id(r)) == r


def test_steps():
    assert config.expand_steps({"start": 0, "stop": 12, "every": 3}) == [0, 3, 6, 9, 12]
    assert config.expand_steps({"start": 0, "stop": 144, "every": 3}, 6) == [0, 3, 6]


def test_configs_consistent():
    models, variables, regions = config.load("models"), config.load("variables"), config.load("regions")
    for m in models.values():
        assert set(m["params"]) <= set(variables)
        assert set(m["regions"]) <= set(regions)
        assert {"t500", "snow-depth"} <= set(m["params"])
        assert set(m.get("region_bboxes", {})) <= set(m["regions"])


def test_model_region_bboxes_do_not_mutate_shared_regions():
    from wr_pipeline.cli import _regions_for_model

    shared = {"eu": {"label": "Europa", "bbox": [-25, 30, 45, 72]}}
    model = {"region_bboxes": {"eu": [-23.5, 30, 45, 70.5]}}

    effective = _regions_for_model(shared, model)

    assert effective["eu"]["bbox"] == [-23.5, 30, 45, 70.5]
    assert shared["eu"]["bbox"] == [-25, 30, 45, 72]


def test_param_spec():
    assert config.param_spec("2t") == {"param": "2t"}
    assert config.param_spec({"param": "gh", "levelist": 500})["levelist"] == 500


def test_gfs_ranges(monkeypatch):
    from wr_pipeline.sources import noaa_gfs as g

    rows = [(0, "PRMSL", "mean sea level"), (100, "HGT", "500 mb"), (250, "TMP", "850 mb")]
    monkeypatch.setattr(g, "_idx", lambda url: rows)
    assert g._ranges("u", {"param": "HGT", "level": "500 mb"}) == [(100, 249)]
    assert g._ranges("u", {"param": "TMP", "level": "850 mb"}) == [(250, None)]
    assert g._ranges("u", {"param": "TMP", "level": "2 m above ground"}) == []


def test_ecmwf_available_runs_uses_newest_source_per_cycle(monkeypatch):
    from wr_pipeline.sources import ecmwf

    runs = {
        "google": {
            0: dt.datetime(2026, 11, 15, 0),
            12: dt.datetime(2026, 11, 15, 12),
        },
        "aws": {
            0: dt.datetime(2026, 11, 16, 0),
            12: dt.datetime(2026, 11, 16, 12),
        },
    }

    class FakeClient:
        def __init__(self, source):
            self.source = source

        def latest(self, **kwargs):
            return runs[self.source][kwargs["time"]]

    monkeypatch.setattr(
        ecmwf, "_clients", lambda cfg: [(name, FakeClient(name)) for name in ("google", "aws")]
    )
    cfg = {"runs": [0, 12], "stream": "oper"}

    assert ecmwf.available_runs(cfg, 144, {"param": "2t"}, limit=3) == [
        dt.datetime(2026, 11, 15, 12),
        dt.datetime(2026, 11, 16, 0),
        dt.datetime(2026, 11, 16, 12),
    ]
    assert ecmwf.latest_run(cfg, 144, {"param": "2t"}) == dt.datetime(2026, 11, 16, 12)


def test_open_param_reports_missing_grib_field(monkeypatch, tmp_path):
    monkeypatch.setattr(extract.xr, "open_dataset", lambda *args, **kwargs: extract.xr.Dataset())

    with pytest.raises(RuntimeError, match="Nessun campo GRIB con shortName='sde'"):
        extract.open_param(tmp_path / "empty.grib2", "sde")
