"""Export del vento nel formato di leaflet-velocity (stile grib2json): due componenti, righe da nord a sud."""
import json

import numpy as np


def wind_json(lat, lon, u, v, valid, step_deg: float = 0.5) -> bytes:
    lat, lon = np.asarray(lat, dtype="float64"), np.asarray(lon, dtype="float64")
    sy = max(1, round(step_deg / abs(float(lat[1] - lat[0]))))
    sx = max(1, round(step_deg / abs(float(lon[1] - lon[0]))))
    lat2, lon2 = lat[::sy], lon[::sx]
    u2 = np.nan_to_num(np.asarray(u, dtype="float64")[::sy, ::sx])
    v2 = np.nan_to_num(np.asarray(v, dtype="float64")[::sy, ::sx])
    if lat2[0] < lat2[-1]:  # leaflet-velocity vuole la prima riga a nord
        lat2, u2, v2 = lat2[::-1], u2[::-1], v2[::-1]
    nx, ny = len(lon2), len(lat2)
    lo1, lo2, la1, la2 = float(lon2[0]), float(lon2[-1]), float(lat2[0]), float(lat2[-1])
    ref = valid.strftime("%Y-%m-%d %H:%M:%S")

    def component(number: int, name: str, arr) -> dict:
        header = {
            "parameterCategory": 2, "parameterNumber": number, "parameterNumberName": name,
            "parameterUnit": "m.s-1", "nx": nx, "ny": ny, "lo1": lo1, "la1": la1, "lo2": lo2, "la2": la2,
            "dx": (lo2 - lo1) / (nx - 1), "dy": (la1 - la2) / (ny - 1),
            "numberPoints": nx * ny, "refTime": ref, "forecastTime": 0,
        }
        return {"header": header, "data": np.round(arr, 1).ravel().tolist()}

    payload = [component(2, "Eastward wind", u2), component(3, "Northward wind", v2)]
    return json.dumps(payload, separators=(",", ":")).encode()
