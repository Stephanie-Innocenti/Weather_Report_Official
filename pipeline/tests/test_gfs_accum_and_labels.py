from types import SimpleNamespace

import numpy as np

from wr_pipeline.render.labels import label_levels
from wr_pipeline.sources import noaa_gfs as g


def test_idx_keeps_forecast_period(monkeypatch):
    monkeypatch.setattr(
        g._session,
        "get",
        lambda url, timeout: SimpleNamespace(
            status_code=200,
            text="1:100:d=2026111600:APCP:surface:0-3 hour acc fcst:\n",
            raise_for_status=lambda: None,
        ),
    )
    assert g._idx("https://example.test/gfs") == [
        (100, "APCP", "surface", "0-3 hour acc fcst")
    ]


def test_idx_retries_temporary_404(monkeypatch):
    g._idx.cache_clear()
    responses = iter([
        SimpleNamespace(status_code=404),
        SimpleNamespace(
            status_code=200,
            text="1:100:d=2026111600:APCP:surface:0-3 hour acc fcst:\n",
            raise_for_status=lambda: None,
        ),
    ])
    delays = []
    monkeypatch.setattr(g._session, "get", lambda url, timeout: next(responses))
    monkeypatch.setattr(g.time, "sleep", delays.append)

    assert g._idx("https://example.test/retry") == [
        (100, "APCP", "surface", "0-3 hour acc fcst")
    ]
    assert delays == [g.INDEX_RETRY_BASE_SECONDS]
    g._idx.cache_clear()


def _rows():
    return [
        (0, "TMP", "2 m above ground", "12 hour fcst"),
        (100, "APCP", "surface", "6-12 hour acc fcst"),   # secchio da 6 ore (vecchio stile)
        (200, "APCP", "surface", "0-12 hour acc fcst"),   # accumulo continuo (nuovo stile)
        (300, "PRMSL", "mean sea level", "12 hour fcst"),
    ]


def test_accum_picks_continuous_window(monkeypatch):
    monkeypatch.setattr(g, "_idx", lambda url: _rows())
    spec = {"param": "APCP", "level": "surface", "accum": True}
    assert g._ranges("u", spec, 12) == [(200, 299)]
    assert g._ranges("u", spec, 6) == []             # nessuna finestra 0-6 in questo file


def test_accum_day_units_and_duplicates(monkeypatch):
    rows = [
        (0, "APCP", "surface", "0-3 hour acc fcst"),
        (50, "APCP", "surface", "0-3 hour acc fcst"),  # duplicato: ne serve uno solo
        (90, "APCP", "surface", "0-1 day acc fcst"),
        (150, "PRMSL", "mean sea level", "anl"),
    ]
    monkeypatch.setattr(g, "_idx", lambda url: rows)
    spec = {"param": "APCP", "level": "surface", "accum": True}
    assert g._ranges("u", spec, 3) == [(0, 49)]
    assert g._ranges("u", spec, 24) == [(90, 149)]


def test_non_accum_unchanged(monkeypatch):
    monkeypatch.setattr(g, "_idx", lambda url: _rows())
    assert g._ranges("u", {"param": "PRMSL", "level": "mean sea level"}) == [(300, None)]


def test_label_levels():
    lv = np.arange(-30, 31, 3)
    assert label_levels(lv, 6) == [v for v in lv if v % 6 == 0]
    assert label_levels(lv, 12) == [v for v in lv if v % 12 == 0]
    assert label_levels(lv, None) == list(lv)
