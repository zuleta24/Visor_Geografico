# Visor Geográfico · Sistemas de Coordenadas de Colombia

Visor web hecho con **Leaflet + proj4js**, que permite cargar capas GeoJSON,
detectar (con confirmación del usuario) su sistema de coordenadas de origen,
y visualizar cualquier punto del mapa en distintos sistemas de referencia
usados en Colombia (WGS84, MAGNA-SIRGAS, Bogotá, Origen Nacional, UTM).

   🔗 **URL pública:** [https://visorgeografico.vercel.app](https://visorgeografico.vercel.app)

## Arquitectura

Dos piezas, sin backend propio:

- **Frontend** (esta carpeta): HTML/CSS/JS puro, sin build. Se despliega
  directo en **Vercel** como sitio estático.
- **Supabase**: guarda los archivos de capas (Storage) y su metadata
  (tabla `layers` en Postgres), consumido directo desde el navegador.

Detalle completo en [`docs/arquitectura.md`](docs/arquitectura.md).

## Estructura del proyecto

```
visor-geografico/
├── index.html              # estructura de la página
├── css/
│   └── style.css           # estilos
├── js/
│   ├── crs.js               # catálogo de sistemas de coordenadas + proj4
│   ├── layers.js             # carga y detección de CRS de capas GeoJSON
│   ├── supabaseClient.js     # conexión a Supabase
│   └── main.js                # inicialización del mapa y de la UI
├── docs/
│   ├── arquitectura.md
│   ├── sistemas-coordenadas.md
│   └── manual-usuario.md
└── README.md
```

## Cómo correrlo en local

No requiere instalación ni build. Basta con levantar cualquier servidor
estático desde la carpeta del proyecto, por ejemplo:

```bash
npx serve .
```

y abrir la URL que te muestre en la terminal (normalmente `http://localhost:3000`).

## Configurar Supabase

1. Reemplaza `TU_SUPABASE_URL` y `TU_SUPABASE_ANON_KEY` en
   `js/supabaseClient.js` con los valores de tu proyecto
   (Supabase → Project Settings → API).
2. Crea la tabla `layers` con el SQL que está en
   [`docs/arquitectura.md`](docs/arquitectura.md).

## Desplegar en Vercel

1. Sube este repositorio a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repo.
3. Como es un sitio estático, no necesitas configurar ningún *build command*:
   deja "Framework Preset" en **Other** y el "Output Directory" en la raíz.
4. Deploy. Cada push a `main` vuelve a desplegar automáticamente.

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Sistemas de coordenadas soportados](docs/sistemas-coordenadas.md)
- [Manual de usuario](docs/manual-usuario.md)
