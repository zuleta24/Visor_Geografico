# Sistemas de coordenadas soportados

## Dos conceptos distintos

- **Sistema de referencia (datum):** define el elipsoide y el origen
  geodésico (ej. WGS84, MAGNA-SIRGAS, Bogotá 1975).
- **Sistema de coordenadas (CRS):** cómo se representan las
  posiciones sobre ese datum: en grados (geográfico) o en metros,
  proyectadas sobre un plano (UTM, Transversa de Mercator, etc.).

Cada combinación datum + proyección tiene un **código EPSG** único,
que es lo que realmente identifica un sistema de forma inequívoca.

## Catálogo usado en este proyecto

| Sistema | EPSG | Tipo | Notas |
|---|---|---|---|
| WGS84 | `4326` | Geográfico | Estándar universal (GPS) |
| MAGNA-SIRGAS | `4686` | Geográfico | Datum oficial de Colombia, reemplazó a Bogotá 1975 |
| MAGNA-SIRGAS / Bogotá | `3116` | Proyectado | Origen único usado antes de 2020, meridiano de Bogotá |
| MAGNA-SIRGAS 2018 / Origen Nacional (CTM12) | `9377` | Proyectado | Sistema único oficial desde 2020 (Res. IGAC 371/2020 y 370/2021) |
| WGS84 / UTM 17N | `32617` | Proyectado | |
| WGS84 / UTM 18N | `32618` | Proyectado | Cubre el centro del país (Bogotá, Medellín) |
| WGS84 / UTM 19N | `32619` | Proyectado | |

## Cómo se detecta el CRS de una capa cargada

1. Si el archivo GeoJSON trae un miembro `"crs"` con el nombre EPSG,
   se usa directamente.
2. Si no lo trae (lo más común), se aplica una heurística sobre el
   rango de la primera coordenada:
   - Valores entre -180/180 y -90/90 → geográfico (WGS84/MAGNA-SIRGAS).
   - Falso este ≈ 5.000.000 → probablemente Origen Nacional (`9377`).
   - Falso este/norte ≈ 1.000.000 → probablemente Bogotá (`3116`).
   - Valores en metros fuera de esos rangos → probablemente UTM.
3. **El usuario siempre confirma o corrige** la detección antes de
   que la capa se añada al mapa. La heurística es un punto de
   partida, no un resultado infalible.

## Por qué no se reproyecta el mapa completo

Leaflet dibuja los mapas base (teselas de OpenStreetMap, etc.) en
Web Mercator (`EPSG:3857`) de forma interna, y eso no cambia. Lo que
este visor permite cambiar es **cómo se muestran las coordenadas**
de un punto (lectura del cursor, atributos), convirtiéndolas con
`proj4js` a partir del lat/lon que Leaflet ya maneja — sin tocar
cómo se dibuja el mapa.
