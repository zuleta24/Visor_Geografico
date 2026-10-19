#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
geoprocesamiento_viviendas_colegios.py
=============================================================================
Geoprocesamiento Automatizado con GDAL/OGR: Análisis de Proximidad y Priorización
de Viviendas frente a Instituciones Educativas en el Municipio de Sabaneta.
-----------------------------------------------------------------------------
Autores: Jacobo Flórez · Sebastián Zuleta · Ana Sofía Sáenz
Proyecto: Visor Geográfico de Sabaneta - Sistemas de Coordenadas de Colombia

Funcionalidades implementadas con GDAL / OGR:
  1. Reproyección cartográfica estandarizada:
     - Entrada en WGS84 (EPSG:4326).
     - Reproyección al sistema oficial de Colombia: MAGNA-SIRGAS 2018 /
       Origen Nacional (EPSG:9377) para cálculo métrico euclidiano exacto.
  2. Generación automatizada de Zonas de Influencia (Buffers poligonales):
     - Buffer Alta Prioridad (<= 150 m).
     - Buffer Media Prioridad (<= 300 m).
     - Buffer Baja Prioridad (<= 500 m).
  3. Análisis espacial de proximidad (Spatial Join / Nearest Neighbor):
     - Medición de distancias en metros de cada vivienda a cada institución.
     - Clasificación jerárquica de prioridad (Alta, Media, Baja).
  4. Generación y exportación multiformato:
     - GeoJSON enriquecido para el visor web (data/ y raíz).
     - GeoJSON de polígonos de Zonas de Influencia (data/buffers_colegios.geojson).
     - GeoPackage multicapa OGC (data/viviendas_analisis.gpkg).
     - Teselas vectoriales Mapbox Vector Tiles (.pbf) con gdal.VectorTranslate.
=============================================================================
"""

import os
import sys
import json
import shutil
from pathlib import Path

# Activar excepciones en GDAL / OGR
try:
    from osgeo import gdal, ogr, osr
    gdal.UseExceptions()
    ogr.UseExceptions()
    osr.UseExceptions()
except ImportError:
    print("[ERROR] No se pudo importar GDAL/OGR en este entorno de Python.")
    print("Asegúrate de ejecutar con un entorno que tenga GDAL (ej. QGIS python-qgis.bat o Conda).")
    sys.exit(1)


# =============================================================================
# CONFIGURACIÓN Y PARÁMETROS DE GEOPROCESAMIENTO
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent

# Archivo de entrada base: usa viviendas_base.geojson si existe
ARCHIVO_VIVIENDAS_BASE = BASE_DIR / "data" / "viviendas_base.geojson"
if not ARCHIVO_VIVIENDAS_BASE.exists():
    ARCHIVO_VIVIENDAS_BASE = BASE_DIR / "data" / "viviendas_priorizadas_colegios.geojson"

ARCHIVO_COLEGIOS_BASE  = BASE_DIR / "data" / "colegios-universidades-sabaneta.geojson"

# Salidas
SALIDA_GEOJSON_DATA   = BASE_DIR / "data" / "viviendas_priorizadas_colegios.geojson"
SALIDA_GEOJSON_RAIZ   = BASE_DIR / "viviendas_priorizadas_colegios.geojson"
SALIDA_BUFFERS_GEOJSON= BASE_DIR / "data" / "buffers_colegios.geojson"
SALIDA_GPKG           = BASE_DIR / "data" / "viviendas_analisis.gpkg"
SALIDA_GPKG_RESPALDO  = BASE_DIR / "data" / "viviendas_respaldo.gpkg"
DIR_VECTOR_TILES      = BASE_DIR / "tiles" / "viviendas_priorizadas"

# Parámetros métricos de zonas de influencia (en metros)
UMBRAL_ALTA  = 150.0   # <= 150 m
UMBRAL_MEDIA = 300.0   # > 150 m y <= 300 m
UMBRAL_BAJA  = 500.0   # > 300 m y <= 500 m


def obtener_srs_y_transformaciones():
    """
    Crea los sistemas de referencia espacial y los objetos de transformación:
      - WGS84 (EPSG:4326)
      - MAGNA-SIRGAS 2018 / Origen Nacional CTM12 (EPSG:9377)
    """
    srs_4326 = osr.SpatialReference()
    srs_4326.ImportFromEPSG(4326)
    srs_4326.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    srs_9377 = osr.SpatialReference()
    srs_9377.ImportFromEPSG(9377)
    srs_9377.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    trans_a_9377 = osr.CoordinateTransformation(srs_4326, srs_9377)
    trans_a_4326 = osr.CoordinateTransformation(srs_9377, srs_4326)

    return srs_4326, srs_9377, trans_a_9377, trans_a_4326


def cargar_features(archivo_geojson):
    """Carga un FeatureCollection desde un archivo GeoJSON UTF-8."""
    with open(archivo_geojson, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("features", [])


def ejecutar_analisis_proximidad():
    """
    Ejecuta el geoprocesamiento completo entre viviendas y colegios.
    """
    print("=" * 75)
    print("GEOPROCESAMIENTO GDAL/OGR: VIVIENDAS VS COLEGIOS DE SABANETA")
    print("=" * 75)
    print(f"Versión de GDAL en uso: {gdal.__version__}")
    print(f"Cargando viviendas base desde: {ARCHIVO_VIVIENDAS_BASE}")
    print(f"Cargando colegios base desde:  {ARCHIVO_COLEGIOS_BASE}")

    srs_4326, srs_9377, trans_a_9377, trans_a_4326 = obtener_srs_y_transformaciones()

    features_viviendas = cargar_features(ARCHIVO_VIVIENDAS_BASE)
    features_colegios  = cargar_features(ARCHIVO_COLEGIOS_BASE)

    print(f"  -> {len(features_viviendas)} registros de viviendas/predios encontrados")
    print(f"  -> {len(features_colegios)} instituciones educativas encontradas")

    # 1. Preparar Geometrías de Colegios en EPSG:9377
    colegios_prep = []
    for idx, c in enumerate(features_colegios, start=1):
        coords = c["geometry"]["coordinates"]
        pt = ogr.Geometry(ogr.wkbPoint)
        pt.AddPoint(coords[0], coords[1])
        pt.Transform(trans_a_9377)

        props = c.get("properties", {})
        colegios_prep.append({
            "id": idx,
            "nombre": props.get("nombre", f"Colegio #{idx}"),
            "tipo": props.get("tipo", "colegio"),
            "sector": props.get("sector", "publico"),
            "direccion": props.get("direccion", ""),
            "geom_9377": pt,
            "coords_orig": coords
        })

    # 2. Generar Polígonos de Buffers de Colegios (150m, 300m, 500m)
    print("\nGenerando polígonos de zonas de influencia (Buffers OGR en EPSG:9377)...")
    buffers_features = []

    for c in colegios_prep:
        for radio, nivel in [(UMBRAL_ALTA, "alta"), (UMBRAL_MEDIA, "media"), (UMBRAL_BAJA, "baja")]:
            # Generar buffer en metros con OGR
            geom_buffer = c["geom_9377"].Buffer(radio)
            # Reproyectar a WGS84 para exportación GeoJSON
            geom_buffer_wgs84 = geom_buffer.Clone()
            geom_buffer_wgs84.Transform(trans_a_4326)

            geojson_geom = json.loads(geom_buffer_wgs84.ExportToJson())

            buffers_features.append({
                "type": "Feature",
                "geometry": geojson_geom,
                "properties": {
                    "colegio_id": c["id"],
                    "colegio_nombre": c["nombre"],
                    "colegio_sector": c["sector"],
                    "zona": f"Influencia {nivel.capitalize()} ({int(radio)}m)",
                    "prioridad": nivel,
                    "buffer_m": radio
                }
            })

    print(f"  -> {len(buffers_features)} polígonos de buffer generados exitosamente.")

    # 3. Análisis de Proximidad y Priorización de Viviendas
    print("\nRealizando cálculo de distancias euclidianas exactas y clasificación...")
    viviendas_priorizadas = []
    estadisticas = {"alta": 0, "media": 0, "baja": 0, "sin_prioridad": 0}

    # Mantener registro de predios únicos
    predios_vistos = set()

    for v in features_viviendas:
        v_props = v.get("properties", {})
        coords = v["geometry"]["coordinates"]

        predio_id = v_props.get("id") or v_props.get("predio_id") or 1
        predio_cod = v_props.get("predio") or f"PRED-{predio_id:03d}"
        barrio = v_props.get("barrio") or "Centro"
        tipo = v_props.get("tipo") or "residencial"
        sector = v_props.get("sector") or "urbano"
        area_m2 = v_props.get("area_m2") or 100.0

        pt_vivienda = ogr.Geometry(ogr.wkbPoint)
        pt_vivienda.AddPoint(coords[0], coords[1])
        pt_vivienda.Transform(trans_a_9377)

        # Buscar todos los colegios dentro del umbral máximo (500m)
        colegios_cercanos = []
        for c in colegios_prep:
            distancia_m = pt_vivienda.Distance(c["geom_9377"])
            if distancia_m <= UMBRAL_BAJA:
                if distancia_m <= UMBRAL_ALTA:
                    prio = "alta"
                    buf_val = UMBRAL_ALTA
                elif distancia_m <= UMBRAL_MEDIA:
                    prio = "media"
                    buf_val = UMBRAL_MEDIA
                else:
                    prio = "baja"
                    buf_val = UMBRAL_BAJA

                colegios_cercanos.append({
                    "colegio": c,
                    "distancia_m": round(distancia_m, 1),
                    "prioridad": prio,
                    "buffer_m": buf_val
                })

        # Si tiene colegios en su zona de influencia
        if colegios_cercanos:
            # Ordenar por proximidad
            colegios_cercanos.sort(key=lambda x: x["distancia_m"])

            for rel in colegios_cercanos:
                c_info = rel["colegio"]
                estadisticas[rel["prioridad"]] += 1

                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [coords[0], coords[1]]
                    },
                    "properties": {
                        "predio": predio_cod,
                        "predio_id": predio_id,
                        "barrio": barrio,
                        "tipo": tipo,
                        "sector": sector,
                        "area_m2": area_m2,
                        "colegio_id": c_info["id"],
                        "colegio_nombre": c_info["nombre"],
                        "colegio_sector": c_info["sector"],
                        "distancia_m": rel["distancia_m"],
                        "buffer_m": rel["buffer_m"],
                        "prioridad": rel["prioridad"]
                    }
                }
                viviendas_priorizadas.append(feature)
        else:
            # Si ninguna institución está a <= 500m, calcular el colegio más cercano
            dist_min = float("inf")
            c_mas_cercano = None
            for c in colegios_prep:
                d = pt_vivienda.Distance(c["geom_9377"])
                if d < dist_min:
                    dist_min = d
                    c_mas_cercano = c

            estadisticas["sin_prioridad"] += 1
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [coords[0], coords[1]]
                },
                "properties": {
                    "predio": predio_cod,
                    "predio_id": predio_id,
                    "barrio": barrio,
                    "tipo": tipo,
                    "sector": sector,
                    "area_m2": area_m2,
                    "colegio_id": c_mas_cercano["id"] if c_mas_cercano else None,
                    "colegio_nombre": c_mas_cercano["nombre"] if c_mas_cercano else "Ninguno cercano",
                    "colegio_sector": c_mas_cercano["sector"] if c_mas_cercano else "n/a",
                    "distancia_m": round(dist_min, 1) if c_mas_cercano else 999.0,
                    "buffer_m": UMBRAL_BAJA,
                    "prioridad": "sin prioridad"
                }
            }
            viviendas_priorizadas.append(feature)

    print("\nResumen estadístico de priorización:")
    print(f"  • Alta prioridad  (<= {int(UMBRAL_ALTA)}m): {estadisticas['alta']}")
    print(f"  • Media prioridad (<= {int(UMBRAL_MEDIA)}m): {estadisticas['media']}")
    print(f"  • Baja prioridad  (<= {int(UMBRAL_BAJA)}m): {estadisticas['baja']}")
    print(f"  • Sin prioridad   (> {int(UMBRAL_BAJA)}m):  {estadisticas['sin_prioridad']}")
    print(f"  • Total relaciones generadas: {len(viviendas_priorizadas)}")

    # 4. Guardar GeoJSON de Viviendas Priorizadas
    fc_viviendas = {
        "type": "FeatureCollection",
        "name": "viviendas_priorizadas_colegios",
        "features": viviendas_priorizadas
    }

    # Guardar en data/ y en la raíz
    for ruta in [SALIDA_GEOJSON_DATA, SALIDA_GEOJSON_RAIZ]:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(fc_viviendas, f, ensure_ascii=False, indent=2)
        print(f"  [OK] Guardado GeoJSON viviendas: {ruta}")

    # 5. Guardar GeoJSON de Polígonos de Zonas de Influencia (Buffers)
    fc_buffers = {
        "type": "FeatureCollection",
        "name": "buffers_colegios_sabaneta",
        "features": buffers_features
    }
    with open(SALIDA_BUFFERS_GEOJSON, "w", encoding="utf-8") as f:
        json.dump(fc_buffers, f, ensure_ascii=False, indent=2)
    print(f"  [OK] Guardado GeoJSON buffers:   {SALIDA_BUFFERS_GEOJSON}")

    # 6. Generar GeoPackage Multicapa con GDAL / OGR
    exportar_geopackage(fc_viviendas, fc_buffers, features_colegios, srs_4326)

    # 7. Actualizar Vector Tiles MVT
    actualizar_vector_tiles()

    print("\n" + "=" * 75)
    print("¡GEOPROCESAMIENTO GDAL/OGR COMPLETADO EXITOSAMENTE!")
    print("=" * 75)


def exportar_geopackage(fc_viviendas, fc_buffers, features_colegios, srs_4326):
    """
    Crea un archivo OGC GeoPackage (.gpkg) multicapa usando el driver GPKG de OGR.
    """
    print("\nGenerando GeoPackage multicapa OGC con driver OGR...")

    driver = ogr.GetDriverByName("GPKG")
    for gpkg_path in [SALIDA_GPKG, SALIDA_GPKG_RESPALDO]:
        if gpkg_path.exists():
            try:
                gpkg_path.unlink()
            except Exception:
                pass

        ds = driver.CreateDataSource(str(gpkg_path))
        if ds is None:
            print(f"  [WARN] No se pudo crear {gpkg_path}")
            continue

        # Capa 1: Viviendas priorizadas (Puntos)
        lyr_viviendas = ds.CreateLayer("viviendas_priorizadas", srs_4326, ogr.wkbPoint)
        campos_viviendas = [
            ("predio", ogr.OFTString),
            ("barrio", ogr.OFTString),
            ("colegio_nombre", ogr.OFTString),
            ("colegio_sector", ogr.OFTString),
            ("distancia_m", ogr.OFTReal),
            ("prioridad", ogr.OFTString),
            ("buffer_m", ogr.OFTReal),
            ("area_m2", ogr.OFTReal),
        ]
        for nombre_col, tipo_col in campos_viviendas:
            lyr_viviendas.CreateField(ogr.FieldDefn(nombre_col, tipo_col))

        for feat in fc_viviendas["features"]:
            coords = feat["geometry"]["coordinates"]
            geom = ogr.Geometry(ogr.wkbPoint)
            geom.AddPoint(coords[0], coords[1])
            geom.FlattenTo2D()

            ogr_feat = ogr.Feature(lyr_viviendas.GetLayerDefn())
            ogr_feat.SetGeometry(geom)
            for k, _ in campos_viviendas:
                val = feat["properties"].get(k)
                if val is not None:
                    ogr_feat.SetField(k, val)
            lyr_viviendas.CreateFeature(ogr_feat)

        # Capa 2: Buffers de Colegios (Polígonos)
        lyr_buffers = ds.CreateLayer("buffers_colegios", srs_4326, ogr.wkbPolygon)
        campos_buffers = [
            ("colegio_nombre", ogr.OFTString),
            ("colegio_sector", ogr.OFTString),
            ("zona", ogr.OFTString),
            ("prioridad", ogr.OFTString),
            ("buffer_m", ogr.OFTReal),
        ]
        for nombre_col, tipo_col in campos_buffers:
            lyr_buffers.CreateField(ogr.FieldDefn(nombre_col, tipo_col))

        for feat in fc_buffers["features"]:
            geom = ogr.CreateGeometryFromJson(json.dumps(feat["geometry"]))
            geom.FlattenTo2D()
            ogr_feat = ogr.Feature(lyr_buffers.GetLayerDefn())
            ogr_feat.SetGeometry(geom)
            for k, _ in campos_buffers:
                val = feat["properties"].get(k)
                if val is not None:
                    ogr_feat.SetField(k, val)
            lyr_buffers.CreateFeature(ogr_feat)

        # Capa 3: Instituciones Educativas (Puntos)
        lyr_colegios = ds.CreateLayer("instituciones_educativas", srs_4326, ogr.wkbPoint)
        campos_colegios = [
            ("nombre", ogr.OFTString),
            ("tipo", ogr.OFTString),
            ("sector", ogr.OFTString),
            ("direccion", ogr.OFTString),
        ]
        for nombre_col, tipo_col in campos_colegios:
            lyr_colegios.CreateField(ogr.FieldDefn(nombre_col, tipo_col))

        for feat in features_colegios:
            coords = feat["geometry"]["coordinates"]
            geom = ogr.Geometry(ogr.wkbPoint)
            geom.AddPoint(coords[0], coords[1])
            geom.FlattenTo2D()
            ogr_feat = ogr.Feature(lyr_colegios.GetLayerDefn())
            ogr_feat.SetGeometry(geom)
            for k, _ in campos_colegios:
                val = feat.get("properties", {}).get(k)
                if val is not None:
                    ogr_feat.SetField(k, val)
            lyr_colegios.CreateFeature(ogr_feat)

        ds = None  # Cierra y guarda el DataSource
        print(f"  [OK] GeoPackage multicapa guardado: {gpkg_path}")


def actualizar_vector_tiles():
    """
    Genera las teselas vectoriales Mapbox Vector Tiles (.pbf) usando gdal.VectorTranslate.
    """
    print("\nActualizando Vector Tiles (.pbf) con gdal.VectorTranslate...")
    try:
        if DIR_VECTOR_TILES.exists():
            shutil.rmtree(DIR_VECTOR_TILES)

        options = gdal.VectorTranslateOptions(
            format="MVT",
            datasetCreationOptions=[
                "MINZOOM=10",
                "MAXZOOM=17",
                "COMPRESS=NO",
            ],
            layerCreationOptions=["NAME=viviendas"],
        )
        gdal.VectorTranslate(str(DIR_VECTOR_TILES), str(SALIDA_GEOJSON_DATA), options=options)
        print(f"  [OK] Vector tiles generados en: {DIR_VECTOR_TILES}")
    except Exception as e:
        print(f"  [WARN] No se pudo generar Vector Tiles directamente: {e}")


if __name__ == "__main__":
    ejecutar_analisis_proximidad()
