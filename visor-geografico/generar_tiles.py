#!/usr/bin/env python3
"""
generar_tiles.py
------------------------------------------------------------------
1) Pide los datos a Supabase por su API REST (la misma que usa el
   frontend) — esto evita por completo el driver PG: de GDAL, que
   es frágil con tildes en Windows/conda.
2) Guarda un GeoJSON local.
3) Usa GDAL (VectorTranslate) sobre ESE ARCHIVO LOCAL para generar
   los Vector Tiles (.pbf). Aquí GDAL no toca la base de datos en
   ningún momento, solo lee un archivo de texto UTF-8 normal.
------------------------------------------------------------------
"""
import json
import requests
from osgeo import gdal

SUPABASE_URL = "https://bfmklcrfpwvrilvbyzhv.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_3FiXE1pivqaEui4ADP6Y6w_yHyic9Kp"

VISTA = "viviendas_priorizadas_colegios_geojson"
GEOJSON_LOCAL = "viviendas_priorizadas_colegios.geojson"
OUTPUT_DIR = "./tiles/viviendas_priorizadas"
MIN_ZOOM = 10
MAX_ZOOM = 17


def exportar_vista_a_geojson():
    print(f"Pidiendo datos a Supabase ({VISTA}) por la API REST...")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/{VISTA}",
        params={"select": "*"},
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        },
    )
    resp.raise_for_status()
    filas = resp.json()
    print(f"  -> {len(filas)} filas recibidas")

    features = []
    for fila in filas:
        geom = json.loads(fila.pop("geojson"))
        features.append({"type": "Feature", "geometry": geom, "properties": fila})

    geojson = {"type": "FeatureCollection", "features": features}
    with open(GEOJSON_LOCAL, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    print(f"  -> Guardado en {GEOJSON_LOCAL}")


def generar_tiles():
    gdal.UseExceptions()
    print("Generando Vector Tiles con GDAL (desde el archivo local)...")

    options = gdal.VectorTranslateOptions(
        format="MVT",
        datasetCreationOptions=[
            f"MINZOOM={MIN_ZOOM}",
            f"MAXZOOM={MAX_ZOOM}",
            "COMPRESS=NO",
        ],
        layerCreationOptions=["NAME=viviendas"],
    )
    gdal.VectorTranslate(OUTPUT_DIR, GEOJSON_LOCAL, options=options)
    print(f"Listo. Tiles en {OUTPUT_DIR}/{{z}}/{{x}}/{{y}}.pbf")


if __name__ == "__main__":
    exportar_vista_a_geojson()
    generar_tiles()