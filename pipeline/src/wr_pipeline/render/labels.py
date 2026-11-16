"""Utility per etichette e numeri sulle mappe (solo numpy)."""
import numpy as np


def label_levels(levels, every=None) -> list:
    """Livelli da etichettare: tutti, oppure solo i multipli di `every` (es. ogni 6 gradi)."""
    if not every:
        return list(levels)
    return [v for v in levels if abs(v / every - round(v / every)) < 1e-9]


def lattice(lon, lat, width_deg: float, cols: int) -> list[tuple[int, int]]:
    """Indici (riga, colonna) di un reticolo regolare di ~`cols` colonne, lontano dai bordi, per stampare valori."""
    if width_deg <= 0 or cols < 1:
        raise ValueError("width_deg e cols devono essere positivi")
    if len(lon) < 2 or len(lat) < 2:
        return []
    dlon = abs(float(lon[1] - lon[0]))
    dlat = abs(float(lat[1] - lat[0]))
    step = width_deg / cols
    sx, sy = max(1, round(step / dlon)), max(1, round(step / dlat))
    rows = range(max(sy // 2, 1), len(lat) - 1, sy)
    colsr = range(max(sx // 2, 1), len(lon) - 1, sx)
    return [(j, i) for j in rows for i in colsr]
