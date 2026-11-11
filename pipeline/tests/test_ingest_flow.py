"""Test del flusso ingest con sorgente, lettura e rendering finti (niente rete, niente GRIB)."""
import datetime as dt
import json
import sys
import types

import pandas as pd

from wr_pipeline import cli, config, naming
from wr_pipeline.sources import noaa_gfs


class FakeField:
    """Imita il minimo di un DataArray usato dal flusso vettoriale."""

    class _C:
        values = None

    latitude = _C()
    longitude = _C()
    values = None

    def __getitem__(self, key):
        return self

    def __pow__(self, other):
        return self

    def __add__(self, other):
        return self

    def __mul__(self, other):
        return self


def _install_fakes(monkeypatch):
    seen = {"steps": [], "calls": []}

    src = types.ModuleType("fake_src")
    src.latest_run = lambda cfg, max_step, spec: dt.datetime(2026, 11, 4, 0)

    def download(cfg, run, spec, steps, target):
        seen["steps"] = list(steps)
        seen["calls"].append(spec["param"])
        return target

    src.download = download
    ext = types.ModuleType("wr_pipeline.process.extract")
    ext.open_param = lambda grib, short: None
    ext.crop = lambda field, bbox: field

    def iter_fields(da, var):
        for h in seen["steps"]:
            if var.get("skip_step0") and h == 0:
                continue
            yield h, pd.Timestamp("2026-11-04") + pd.Timedelta(hours=h), FakeField()

    ext.iter_fields = iter_fields
    wnd = types.ModuleType("wr_pipeline.process.wind")
    wnd.wind_json = lambda *a, **k: b"[]"
    rnd = types.ModuleType("wr_pipeline.render.maps")
    rnd.render_map = lambda *a, **k: b"img"

    monkeypatch.setitem(sys.modules, "fake_src", src)
    monkeypatch.setitem(sys.modules, "wr_pipeline.process.extract", ext)
    monkeypatch.setitem(sys.modules, "wr_pipeline.process.wind", wnd)
    monkeypatch.setitem(sys.modules, "wr_pipeline.render.maps", rnd)
    monkeypatch.setitem(cli.SOURCES, "ecmwf_opendata", "fake_src")
    return seen


def _manifest(tmp_path):
    return json.loads((tmp_path / "ecmwf-ifs/2026110400/manifest.json").read_text())


def test_available_gfs_runs_are_returned_oldest_first(monkeypatch):
    real_datetime = dt.datetime

    class FixedDateTime(real_datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 11, 16, 30, tzinfo=tz)

    statuses = iter([404, 200, 200])
    monkeypatch.setattr(noaa_gfs.dt, "datetime", FixedDateTime)
    monkeypatch.setattr(
        noaa_gfs._session,
        "head",
        lambda url, timeout: types.SimpleNamespace(status_code=next(statuses)),
    )

    runs = noaa_gfs.available_runs(144, limit=2)

    assert runs == [
        real_datetime(2026, 11, 11, 0),
        real_datetime(2026, 11, 11, 6),
    ]


def test_partial_then_complete_is_additive(monkeypatch, tmp_path):
    seen = _install_fakes(monkeypatch)
    out = str(tmp_path)
    base = ["ingest", "--model", "ecmwf-ifs", "--run", "latest", "--local", out]

    assert cli.main(base + ["--vars", "z500", "--steps-max", "12"]) == 0
    assert list(_manifest(tmp_path)["vars"]) == ["z500"]

    # senza --vars: completa tutto (z500 era parziale), manifest con tutte le variabili nell'ordine di models.yaml
    seen["calls"].clear()
    assert cli.main(base) == 0
    m = _manifest(tmp_path)
    assert list(m["vars"]) == list(config.load("models")["ecmwf-ifs"]["params"])
    assert max(m["vars"]["z500"]["steps"]) == 144
    assert m["vars"]["tp-acc"]["steps"][0] == 3  # lo step 0 viene saltato
    assert len(seen["calls"]) == 10  # 8 scalari + vento (u e v)
    assert (tmp_path / naming.data_key("ecmwf-ifs", "2026110400", "eu", "wind10m", 24)).exists()
    assert m["vars"]["wind10m"]["json_regions"] == ["eu"]
    assert m["planned_countries"]["al"] == "Albania"
    assert "al" not in m["regions"]

    # terzo giro: tutto completo, non scarica nulla
    seen["calls"].clear()
    existing_manifest = _manifest(tmp_path)
    existing_manifest.pop("planned_countries")
    (tmp_path / "ecmwf-ifs/2026110400/manifest.json").write_text(json.dumps(existing_manifest))
    assert cli.main(base) == 0
    assert seen["calls"] == []
    assert _manifest(tmp_path)["planned_countries"]["al"] == "Albania"


def test_forced_partial_keeps_other_vars(monkeypatch, tmp_path):
    seen = _install_fakes(monkeypatch)
    base = ["ingest", "--model", "ecmwf-ifs", "--run", "latest", "--local", str(tmp_path)]
    assert cli.main(base) == 0
    assert cli.main(base + ["--vars", "t850", "--force"]) == 0
    assert len(_manifest(tmp_path)["vars"]) == 9  # le altre non spariscono
    assert (tmp_path / naming.image_key("ecmwf-ifs", "2026110400", "it", "t2m", 0)).exists()
