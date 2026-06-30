"""Konvertera Göteborgs JUR-shapefiler (EPSG:3007, SWEREF99 12 00) till GeoJSON i
WGS84 (EPSG:4326) för MapLibre. Skriver till public/geo/.

Kräver: pyshp (shapefile), pyproj.  Kör: python scripts/shp2geojson.py
"""
import json
import os
import shapefile  # pyshp
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "geo")
OUT = os.path.join(ROOT, "public", "geo")
os.makedirs(OUT, exist_ok=True)

# EPSG:3007 (SWEREF99 12 00) -> EPSG:4326 (lon/lat)
tf = Transformer.from_crs("EPSG:3007", "EPSG:4326", always_xy=True)

# (shapefil utan ändelse, utdatanamn, namn-fält att lyfta som "namn")
LAYERS = [
    ("Jur_stadsomraden_xu_region",    "stadsomraden",   "NAMN"),
    ("JUR_PRIMÄROMRÅDEN_XU_region",   "primaromraden",  "PRIMÄRNAMN"),
    ("Jur_mellanomraden_xu_region",   "mellanomraden",  None),
    ("JUR_BASOMRÅDEN_XU_region",      "basomraden",     None),
]


def reproj_ring(ring):
    return [list(tf.transform(x, y)) for (x, y) in ring]


def part_rings(shape):
    """Dela upp en pyshp-polygon i ringar efter parts-index."""
    pts = shape.points
    idx = list(shape.parts) + [len(pts)]
    return [pts[idx[i]:idx[i + 1]] for i in range(len(idx) - 1)]


def to_geometry(shape):
    rings = [reproj_ring(r) for r in part_rings(shape)]
    if len(rings) == 1:
        return {"type": "Polygon", "coordinates": rings}
    # Flera ringar: behandla som MultiPolygon med en ring per polygon
    # (räcker för visning; hål hanteras inte separat men ger korrekt yttre kontur)
    return {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}


def convert(base, out_name, name_field):
    path = os.path.join(SRC, base)
    sf = shapefile.Reader(path, encoding="cp1252")
    fields = [f[0] for f in sf.fields[1:]]
    features = []
    for sr in sf.iterShapeRecords():
        rec = dict(zip(fields, sr.record))
        props = {k: (v.strip() if isinstance(v, str) else v) for k, v in rec.items()}
        if name_field and name_field in props:
            props["namn"] = props[name_field]
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": to_geometry(sr.shape),
        })
    fc = {"type": "FeatureCollection", "features": features}
    out_path = os.path.join(OUT, out_name + ".geojson")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False)
    size_kb = os.path.getsize(out_path) // 1024
    print(f"{out_name}: {len(features)} features -> {out_path} ({size_kb} kB)")


if __name__ == "__main__":
    for base, out_name, name_field in LAYERS:
        convert(base, out_name, name_field)
    print("Klart.")
