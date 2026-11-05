"""Rendering di una mappa (matplotlib + cartopy) -> bytes WebP."""
import io

import matplotlib

matplotlib.use("Agg")
import cartopy.crs as ccrs
import cartopy.feature as cfeature
import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, LinearSegmentedColormap, ListedColormap
import numpy as np
from PIL import Image

PC = ccrs.PlateCarree()


def _levels(var: dict) -> np.ndarray:
    if "levels_list" in var:
        return np.array(var["levels_list"], dtype=float)
    lo, hi, step = var["levels"]
    return np.arange(lo, hi + step / 2, step)


def _style(var: dict, levels: np.ndarray) -> dict:
    """Argomenti di colore per contourf. Tre modi, in ordine:
    colors = un colore per fascia (+1 per ogni estremo aperto), stops = gradiente ancorato ai valori, cmap = nome matplotlib."""
    if "colors" in var:
        ext = var.get("extend", "neither")
        n = len(levels) - 1 + {"neither": 0, "min": 1, "max": 1, "both": 2}[ext]
        if len(var["colors"]) != n:
            raise ValueError(f"{var['label']}: servono {n} colori, ce ne sono {len(var['colors'])}")
        return {"cmap": ListedColormap(var["colors"]), "norm": BoundaryNorm(levels, ncolors=n, extend=ext)}
    if "stops" in var:
        lo, hi = float(levels[0]), float(levels[-1])
        pts = [(min(max((float(v) - lo) / (hi - lo), 0.0), 1.0), c) for v, c in var["stops"]]
        pts[0], pts[-1] = (0.0, pts[0][1]), (1.0, pts[-1][1])
        return {"cmap": LinearSegmentedColormap.from_list("wr", pts, N=512)}
    return {"cmap": plt.get_cmap(var["cmap"])}


def render_map(field, var: dict, region: dict, meta: dict, vectors=None) -> bytes:
    """field: DataArray 2D (latitude, longitude) gia' ritagliato e convertito.
    meta: model_label, run (datetime), step (int), valid (datetime), attribution."""
    west, south, east, north = region["bbox"]
    lon, lat, vals = field["longitude"].values, field["latitude"].values, field.values
    levels = _levels(var)

    width = 10.0
    height = float(np.clip(width * (north - south) / (east - west), 5.0, 9.0)) + 1.6
    fig = plt.figure(figsize=(width, height), dpi=100)
    ax = fig.add_subplot(1, 1, 1, projection=PC)
    ax.set_extent([west, east, south, north], crs=PC)
    fig.subplots_adjust(left=0.03, right=0.97, top=0.89, bottom=0.14)

    mappable = None
    if var["kind"] == "contour":
        ax.add_feature(cfeature.OCEAN.with_scale("50m"), facecolor="#dbe9f4", zorder=0)
        ax.add_feature(cfeature.LAND.with_scale("50m"), facecolor="#f3f0e8", zorder=0)
        cs = ax.contour(lon, lat, vals, levels=levels, colors="#222222", linewidths=0.8, transform=PC, zorder=1)
        ax.clabel(cs, fmt="%d", fontsize=7)
    else:
        if "mask_below" in var:
            vals = np.ma.masked_less(vals, var["mask_below"])
        mappable = ax.contourf(
            lon, lat, vals, levels=levels, **_style(var, levels),
            extend=var.get("extend", "neither"), transform=PC, zorder=1,
        )

    if vectors is not None:  # frecce sottocampionate (vento)
        u, v = vectors
        sy, sx = max(1, u.shape[0] // 18), max(1, u.shape[1] // 26)
        ax.quiver(lon[::sx], lat[::sy], u.values[::sy, ::sx], v.values[::sy, ::sx],
                  transform=PC, color="#1b1b1b", width=0.0022, zorder=3)

    if var["kind"] == "fill" and "lines" in var:
        lo, hi, st = var["lines"]
        cl = ax.contour(lon, lat, field.values, levels=np.arange(lo, hi + st / 2, st),
                        colors="#1b1b1b", linewidths=0.6, transform=PC, zorder=2)
        ax.clabel(cl, fmt="%d", fontsize=7)

    ax.add_feature(cfeature.COASTLINE.with_scale("50m"), linewidth=0.7, zorder=2)
    ax.add_feature(cfeature.BORDERS.with_scale("50m"), linewidth=0.5, linestyle=":", zorder=2)

    if mappable is not None:
        cb = fig.colorbar(mappable, ax=ax, orientation="horizontal", pad=0.05, shrink=0.85, aspect=45)
        cb.set_label(f"{var['label']} ({var['unit']})", fontsize=8)
        cb.ax.tick_params(labelsize=7)
        cb.set_ticks(levels[:: max(1, len(levels) // 12)])

    title = f"{meta['model_label']}  |  {var['label']} ({var['unit']})"
    sub = f"Run {meta['run']:%d/%m/%Y %H} UTC   +{meta['step']:03d}h   valido {meta['valid']:%a %d/%m/%Y %H} UTC"
    ax.text(0, 1.065, title, transform=ax.transAxes, fontsize=11, fontweight="bold")
    ax.text(0, 1.015, sub, transform=ax.transAxes, fontsize=8.5, color="#333333")
    fig.text(0.01, 0.006, meta["attribution"], fontsize=6, color="#666666")

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    buf.seek(0)
    out = io.BytesIO()
    Image.open(buf).convert("RGB").save(out, "WEBP", quality=82, method=4)
    return out.getvalue()
