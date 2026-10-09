import subprocess
import os

def ejemplo_gdal_backend():
    archivo_entrada = "data/viviendas_priorizadas_colegios.geojson"
    archivo_salida = "data/viviendas_respaldo.gpkg"
    
    # Borra el archivo anterior si existe para evitar conflictos
    if os.path.exists(archivo_salida):
        os.remove(archivo_salida)

    # Comando GDAL para convertir GeoJSON a GeoPackage (GPKG)
    comando = f'ogr2ogr -f "GPKG" "{archivo_salida}" "{archivo_entrada}"'

    try:
        print("Iniciando geoprocesamiento GDAL local...")
        # shell=True permite que Anaconda en Windows reconozca el comando
        subprocess.run(comando, shell=True, check=True)
        print(f"¡Éxito total! GDAL procesó los datos y generó el archivo: {archivo_salida}")
        print("Requerimiento técnico de backend completado.")
        
    except subprocess.CalledProcessError as error:
        print("Error en GDAL:", error)

if __name__ == "__main__":
    ejemplo_gdal_backend()