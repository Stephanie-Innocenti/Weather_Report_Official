"""Lettura GRIB2 -> campi 2D ritagliati sulla regione, in unita' finali."""
from collections.abc import Iterator

import numpy as np
import pandas as pd
import xarray as xr


def open_param(grib_path, short_name: str) -> xr.DataArray:
    ds = xr.open_dataset(
        grib_path,
        engine="cfgrib",
        backend_kwargs={"filter_by_keys": {"shortName": short_name}, "indexpath": ""},
    )
    da = ds[list(ds.data_vars)[0]]
    # longitudine 0..360 -> -180..180, assi crescenti
    da = da.assign_coords(longitude=((da.longitude + 180) % 360) - 180)
    da = da.sortby("longitude").sortby("latitude")
    if "step" not in da.dims:
        da = da.expand_dims("step")
    return da


def iter_fields(da: xr.DataArray, var: dict) -> Iterator[tuple[int, pd.Timestamp, xr.DataArray]]:
    """Per ogni step: (ore, data valida, campo convertito)."""
    for i in range(da.sizes["step"]):
        sl = da.isel(step=i)
        hours = int(sl["step"].values / np.timedelta64(1, "h"))
        if var.get("skip_step0") and hours == 0:
            continue
        valid = pd.Timestamp(sl["valid_time"].values)
        yield hours, valid, sl * var["scale"] + var["offset"]


def crop(field: xr.DataArray, bbox: list[float]) -> xr.DataArray:
    west, south, east, north = bbox
    return field.sel(latitude=slice(south, north), longitude=slice(west, east))
