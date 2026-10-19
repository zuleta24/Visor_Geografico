"""
script_gdal.py
=============================================================================
Módulo principal de Geoprocesamiento Backend con GDAL / OGR
-----------------------------------------------------------------------------
Ejecuta el pipeline completo de geoprocesamiento automatizado:
  1. Reproyección de coordenadas a MAGNA-SIRGAS 2018 / Origen Nacional (EPSG:9377).
  2. Generación de zonas de influencia (Buffers de 150m, 300m y 500m).
  3. Análisis espacial de proximidad entre Viviendas y Colegios de Sabaneta.
  4. Generación de GeoPackage (.gpkg), GeoJSON enriquecido y Vector Tiles (.pbf).
=============================================================================
"""

import sys
import subprocess
from pathlib import Path

def ejecutar_geoprocesamiento():
    print("Iniciando geoprocesamiento GDAL local (Viviendas vs Colegios)...")
    try:
        # Intento 1: Importar y ejecutar directamente el módulo Python con GDAL/OGR
        import geoprocesamiento_viviendas_colegios
        geoprocesamiento_viviendas_colegios.ejecutar_analisis_proximidad()
        print("\n¡Éxito total! GDAL/OGR procesó los datos espaciales y generó los productos.")
        print("Requerimiento técnico de backend completado.")
    except ImportError:
        # Intento 2: Si este python no tiene osgeo, buscar python con GDAL (QGIS o Conda)
        script_path = Path(__file__).resolve().parent / "geoprocesamiento_viviendas_colegios.py"
        
        candidatos = [
            r"C:\Program Files\QGIS 4.2.2\bin\python-qgis.bat",
            r"C:\Users\sofis\miniconda3\python.exe",
            "python"
        ]
        
        ejecutado = False
        for python_exe in candidatos:
            try:
                subprocess.run([python_exe, str(script_path)], check=True)
                ejecutado = True
                print("\n¡Éxito total! GDAL procesó los datos y generó los archivos.")
                print("Requerimiento técnico de backend completado.")
                break
            except Exception:
                continue
                
        if not ejecutado:
            print("[ERROR] No se pudo ejecutar GDAL. Verifica la instalación de QGIS o Conda.")

if __name__ == "__main__":
    ejecutar_geoprocesamiento()