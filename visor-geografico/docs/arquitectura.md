# Arquitectura

## Visión general

```
┌─────────────────────────┐         ┌──────────────────────────┐
│        Navegador         │         │         Supabase          │
│  (Vercel, sitio estático)│  HTTPS  │  Storage  +  Postgres      │
│                           │ ───────▶│  (tabla "layers")          │
│  Leaflet + proj4js        │         │                            │
└─────────────────────────┘         └──────────────────────────┘
```

No hay backend propio (ni Python, ni Node en servidor). El navegador
habla directamente con Supabase usando su SDK JS y la *anon key*
(protegida con Row Level Security).

## Por qué esta arquitectura

- **Vercel** solo sirve archivos estáticos: no hay build, no hay
  funciones serverless que mantener, cero configuración.
- **Supabase** reemplaza al backend: Storage para los archivos de
  capas, Postgres para su metadata, autenticación lista si más
  adelante se necesita.
- La reproyección de coordenadas ocurre **en el cliente** con
  `proj4js`, porque Leaflet siempre dibuja en WGS84 y lo único que
  cambia al elegir otro sistema es cómo se *muestran* los valores,
  no cómo se dibuja el mapa.

## Tabla en Supabase

Ejecutar en el **SQL Editor** de Supabase:

```sql
create table layers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  epsg_code text not null,
  file_url text,
  created_at timestamp with time zone default now()
);

-- Habilitar Row Level Security
alter table layers enable row level security;

-- Política simple: cualquiera puede leer (ajustar según necesidad real)
create policy "Lectura pública" on layers
  for select using (true);

-- Política simple: cualquiera puede insertar (ajustar según necesidad real)
create policy "Inserción pública" on layers
  for insert with check (true);
```

> Estas políticas son deliberadamente abiertas para simplificar el
> proyecto de curso. En un entorno real se restringirían por usuario
> autenticado.

## Bucket de Storage (opcional)

Si además de la metadata quieres guardar el archivo original de la
capa: Supabase → Storage → **New bucket** → nómbralo `capas` y
márcalo como público (o privado si vas a servir los archivos con
URLs firmadas).

## Flujo de una carga de capa

1. El usuario selecciona un archivo GeoJSON en el navegador.
2. `layers.js` intenta detectar su EPSG (declarado en el archivo o
   por heurística de rango de valores).
3. Se muestra la detección al usuario para que la confirme o corrija.
4. Si el EPSG confirmado no es `EPSG:4326`, se reproyectan las
   coordenadas a WGS84 con `proj4js` antes de dibujar la capa en
   Leaflet.
5. (Opcional) se guarda el nombre y el EPSG en la tabla `layers` de
   Supabase con `saveLayerMetadata()`.

## Geoprocesamiento automatizado con GDAL / OGR (Backend)

El proyecto cuenta con un módulo de análisis espacial automatizado ([`geoprocesamiento_viviendas_colegios.py`](../geoprocesamiento_viviendas_colegios.py) y [`script_gdal.py`](../script_gdal.py)):

1. **Reproyección cartográfica oficial:** Transforma las coordenadas geográficas WGS84 (`EPSG:4326`) a **MAGNA-SIRGAS 2018 / Origen Nacional (`EPSG:9377`)** usando `osgeo.osr` para mediciones métricas exactas.
2. **Generación de Zonas de Influencia (Buffers OGR):** Crea anillos de influencia con radios exactos en metros alrededor de los colegios:
   - Alta prioridad: radio $\le 150$ m.
   - Media prioridad: radio $\le 300$ m.
   - Baja prioridad: radio $\le 500$ m.
3. **Cruce espacial y priorización:** Calcula la distancia euclidiana de cada predio a los colegios, clasifica el nivel de prioridad y enriquece los atributos.
4. **Productos generados:**
   - `data/viviendas_priorizadas_colegios.geojson`: Puntos con prioridades y colegios asignados.
   - `data/buffers_colegios.geojson`: Polígonos de amortiguamiento de los colegios para visualización web.
   - `data/viviendas_analisis.gpkg`: GeoPackage OGC con capas de viviendas, buffers e instituciones.
   - `tiles/viviendas_priorizadas/`: Teselas vectoriales MVT (`.pbf`) generadas con `gdal.VectorTranslate`.

Para ejecutar el proceso con un solo clic en Windows se incluye [`ejecutar_geoproceso.bat`](../ejecutar_geoproceso.bat).

