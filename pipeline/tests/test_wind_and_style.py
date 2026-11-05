import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from wr_pipeline.process.wind import wind_json


def test_wind_json_layout():
    lat = np.arange(30, 40.01, 0.25)      # crescente, come dopo sortby
    lon = np.arange(-10, 0.01, 0.25)
    u = np.full((len(lat), len(lon)), 2.0)
    v = np.zeros_like(u)
    u[-1, :] = 9.0                         # ultima riga = latitudine piu' a nord
    out = json.loads(wind_json(lat, lon, u, v, pd.Timestamp("2026-11-05 12:00"), 0.5))
    hu, hv = out[0]["header"], out[1]["header"]
    assert (hu["parameterCategory"], hu["parameterNumber"], hv["parameterNumber"]) == (2, 2, 3)
    assert (hu["nx"], hu["ny"]) == (21, 21)
    assert hu["la1"] == 40.0 and hu["la2"] == 30.0 and hu["lo1"] == -10.0 and hu["lo2"] == 0.0
    assert hu["dx"] == 0.5 and hu["dy"] == 0.5
    assert len(out[0]["data"]) == hu["nx"] * hu["ny"]
    assert out[0]["data"][0] == 9.0        # prima riga = nord
    assert hu["refTime"] == "2026-11-05 12:00:00"


def _load_style():
    """Carica _style da maps.py senza importare cartopy."""
    src = Path(__file__).resolve().parents[1] / "src/wr_pipeline/render/maps.py"
    text = src.read_text(encoding="utf-8")
    body = text[text.index("def _style("):text.index("def render_map(")]
    ns = {}
    exec("import numpy as np\nimport matplotlib.pyplot as plt\n"
         "from matplotlib.colors import BoundaryNorm, LinearSegmentedColormap, ListedColormap\n" + body, ns)
    return ns["_style"]


def test_style_colors_map_one_to_one():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import to_rgb

    style = _load_style()
    levels = np.array([0.1, 1, 2, 5, 10])
    cols = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"]  # 4 fasce + 1 oltre
    var = {"label": "t", "colors": cols, "extend": "max"}
    fig, ax = plt.subplots(figsize=(4, 1), dpi=50)
    x = np.linspace(0, 12, 400)
    cf = ax.contourf(x, [0, 1], np.vstack([x, x]), levels=levels, extend="max", **style(var, levels))
    ax.set_axis_off(); fig.subplots_adjust(0, 0, 1, 1)
    fig.canvas.draw()
    img = np.asarray(fig.canvas.buffer_rgba())[:, :, :3] / 255.0
    w = img.shape[1]
    for value, expected in [(0.5, cols[0]), (1.5, cols[1]), (3, cols[2]), (7, cols[3]), (11.5, cols[4])]:
        px = img[img.shape[0] // 2, int(value / 12 * (w - 1))]
        assert np.allclose(px, to_rgb(expected), atol=0.03), (value, px, expected)
    plt.close(fig)


def test_style_wrong_color_count():
    style = _load_style()
    try:
        style({"label": "x", "colors": ["#000"], "extend": "max"}, np.array([0, 1, 2]))
    except ValueError:
        return
    raise AssertionError("doveva fallire")
