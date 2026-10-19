@echo off
chcp 65001 > nul
echo =======================================================================
echo   Geoprocesamiento Automatizado GDAL/OGR: Viviendas vs Colegios
echo   Visor Geografico de Sabaneta
echo =======================================================================
echo.

REM 1. Probar con Python de QGIS
if exist "C:\Program Files\QGIS 4.2.2\bin\python-qgis.bat" (
    echo [INFO] Utilizando entorno GDAL de QGIS 4.2.2...
    "C:\Program Files\QGIS 4.2.2\bin\python-qgis.bat" "%~dp0geoprocesamiento_viviendas_colegios.py"
    goto fin
)

REM 2. Probar con Conda
if exist "C:\Users\%USERNAME%\miniconda3\python.exe" (
    echo [INFO] Utilizando entorno Miniconda...
    "C:\Users\%USERNAME%\miniconda3\python.exe" "%~dp0geoprocesamiento_viviendas_colegios.py"
    goto fin
)

REM 3. Probar con Python del PATH
python "%~dp0geoprocesamiento_viviendas_colegios.py"

:fin
echo.
pause
