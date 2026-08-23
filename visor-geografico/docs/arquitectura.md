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
