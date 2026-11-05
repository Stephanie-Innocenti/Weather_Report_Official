import datetime as dt

from wr_pipeline import config, naming


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
