# ESPECIFICACIÓN TÉCNICA Y FUNCIONAL INTEGRAL DEL SISTEMA DE INFORMACIÓN GEOGRÁFICA (SIG) DE SABANETA

**Documento Maestro de Arquitectura, Requisitos, Geoprocesamiento, Operación y Manual de Usuario**  
*Autores del Sistema:* Jacobo Flórez · Sebastián Zuleta · Ana Sofía Sáenz  
*Municipio de Referencia:* Sabaneta, Antioquia, Colombia  
*Plataforma Productiva:* [https://visorgeografico.vercel.app](https://visorgeografico.vercel.app)  
*Versión del Documento:* 2.4.0 (Edición Exhaustiva para Transferencia Técnica y Documental)

---

## ÍNDICE GENERAL

1. [RESUMEN EJECUTIVO Y CONTEXTO DEL PROYECTO](#1-resumen-ejecutivo-y-contexto-del-proyecto)
   - 1.1. Propósito General del Sistema
   - 1.2. Misión y Visión de la Solución
   - 1.3. Problema Territorial que Resuelve
   - 1.4. Público Objetivo y Perfiles de Usuario
   - 1.5. Contexto Territorial: Municipio de Sabaneta
2. [ESPECIFICACIÓN DE REQUISITOS DEL SISTEMA](#2-especificación-de-requisitos-del-sistema)
   - 2.1. Requisitos Funcionales (RF-01 a RF-16)
   - 2.2. Requisitos No Funcionales (RNF-01 a RNF-08)
3. [ARQUITECTURA Y ASPECTOS TÉCNICOS (MANUAL DEL DESARROLLADOR)](#3-arquitectura-y-aspectos-técnicos-manual-del-desarrollador)
   - 3.1. Arquitectura General y Paradigma de Diseño
   - 3.2. Estructura de Directorios del Código Fuente
   - 3.3. Pila Tecnológica y Librerías Empleadas
   - 3.4. Modelo y Esquema de Base de Datos (PostgreSQL / Supabase / PostGIS)
   - 3.5. Formatos de Intercambio y Archivos Cartográficos
   - 3.6. Algoritmos y Lógica de Negocio Clave
   - 3.7. Pipeline de Geoprocesamiento Backend con GDAL / OGR
   - 3.8. Comunicación con Servicios Externos y APIs
4. [GUÍA DE USO PASO A PASO (MANUAL DEL USUARIO FINAL)](#4-guía-de-uso-paso-a-paso-manual-del-usuario-final)
   - 4.1. Acceso a la Plataforma y Pantalla de Bienvenida
   - 4.2. Exploración del Mapa y Capas Base
   - 4.3. Panel de Herramientas Espaciales y Control de Capas
   - 4.4. Selector y Conversión Dinámica de Sistemas de Coordenadas
   - 4.5. Buscador Avanzado y Filtros de Instituciones
   - 4.6. Ficha Detallada de Institución, Rutas de Transporte y Calificaciones
   - 4.7. Comparador Multicriterio de Instituciones Educativas
   - 4.8. Visualización de Viviendas y Filtros de Priorización Escolar
   - 4.9. Herramientas de Medición (Distancia, Área) y Captura de Coordenadas
   - 4.10. Módulo de Análisis de Cobertura y Simulación de Nuevas Sedes
   - 4.11. Sección de Preguntas Frecuentes y Enlaces Institucionales
5. [GUÍA DE MANTENIMIENTO, DESPLIEGUE Y OPERACIÓN (MANUAL DEL ADMINISTRADOR)](#5-guía-de-mantenimiento-despliegue-y-operación-manual-del-administrador)
   - 5.1. Requisitos Previos del Entorno
   - 5.2. Puesta en Marcha en Entorno Local
   - 5.3. Despliegue Continuo en Vercel
   - 5.4. Configuración y Aprovisionamiento en Supabase
   - 5.5. Panel de Administración: Autenticación y Flujos de Trabajo
   - 5.6. Gestión de Instituciones (CRUD) y Asistente Cartográfico de Ubicación
   - 5.7. Carga y Normalización de Nuevas Capas Geográficas
   - 5.8. Ejecución Automatizada del Geoproceso Espacial (Python / GDAL)
   - 5.9. Políticas de Respaldo, Seguridad y Diagnóstico de Fallos

---

## 1. RESUMEN EJECUTIVO Y CONTEXTO DEL PROYECTO

### 1.1. Propósito General del Sistema
El **Visor Geográfico de Sabaneta** es una plataforma web integral de Sistemas de Información Geográfica (SIG), desarrollada para centralizar, visualizar, analizar y democratizar la información geoespacial del municipio de Sabaneta (Antioquia, Colombia). 

El sistema fusiona dos mundos:
1. **Un geovisor analítico y pedagógico para la ciudadanía y la comunidad académica**, capaz de ilustrar la distribución territorial de colegios públicos, privados, universidades, la malla vial municipal y el parque habitacional, facilitando la conversión de coordenadas entre los estándares geodésicos vigentes en Colombia (Resoluciones IGAC 371/2020 y 370/2021).
2. **Un centro de inteligencia territorial y administración para la toma de decisiones**, dotado de algoritmos de proximidad espacial (GDAL/OGR), análisis de déficit de cobertura escolar, simulación de nuevos equipamientos y gestión dinámica (CRUD) respaldada por una infraestructura basada en la nube (*Serverless BaaS*).

### 1.2. Misión y Visión de la Solución
- **Misión:** Proporcionar una solución web cartográfica de alto rendimiento, libre de fricciones de instalación y universalmente accesible, que articule los datos abiertos de planeación municipal, la infraestructura educativa y las dinámicas residenciales, empoderando a ciudadanos, familias, estudiantes y gestores públicos con herramientas precisas de geoprocesamiento métrico y análisis territorial.
- **Visión:** Consolidarse como la plataforma modelo de referencia subregional en el Valle de Aburrá para la integración de geotecnologías ligeras en el navegador (*Vector Tiles*, Leaflet, Proj4js) articuladas a bases de datos espaciales y servicios en tiempo real, erradicando la obsolescencia técnica en la gestión del equipamiento social.

### 1.3. Problema Territorial que Resuelve
Sabaneta, con una extensión territorial aproximada de $15{,}0\text{ km}^2$, es el municipio más pequeño de Colombia en superficie continental, pero uno de los más densamente poblados y con mayores tasas de crecimiento urbano vertical del país. Esta particularidad genera retos cruciales:
- **Dispersión y fragmentación de la información:** Los datos de instituciones educativas, infraestructura vial y registros catastrales o residenciales solían residir en hojas de cálculo aisladas, repositorios desarticulados de OpenStreetMap o visores pesados de escritorio (QGIS/ArcGIS) inaccesibles para el ciudadano de a pie.
- **Confusión y desactualización en Sistemas de Coordenadas:** Históricamente en Colombia han coexistido múltiples proyecciones (WGS84 geográfico, MAGNA-SIRGAS origen Bogotá EPSG:3116, zonas UTM 17N/18N/19N y la nueva proyección unificada oficial MAGNA-SIRGAS 2018 / Origen Nacional EPSG:9377). Los usuarios y técnicos enfrentaban dificultades recurrentes para reproyectar capas y corroborar posiciones en campo.
- **Desarticulación entre oferta educativa y demanda habitacional:** Familias y administradores locales carecían de una herramienta visual para medir la distancia real a pie entre las viviendas y las instituciones educativas, desconociendo qué zonas residenciales se encuentran a más de 150 m, 300 m o 500 m de un equipamiento escolar (zonas de déficit de cobertura).
- **Falta de retroalimentación comunitaria:** No existía un canal público que permitiera contrastar indicadores objetivos (cupos libres, relación estudiante-docente, recursos tecnológicos) con la valoración cualitativa de la comunidad.

### 1.4. Público Objetivo y Perfiles de Usuario
1. **Ciudadanos, Familias y Estudiantes:**
   - Buscan conocer la oferta educativa pública y privada más próxima a su residencia.
   - Requieren calcular rutas accesibles paso a paso hasta las sedes educativas.
   - Consultan cupos disponibles, recursos pedagógicos y calificaciones ciudadanas.
   - Acceden a información transparente sobre trámites municipales oficiales (*Mi Cuenta Sabaneta*).
2. **Planificadores Urbanos, Investigadores y Analistas Territoriales:**
   - Evalúan la cobertura territorial mediante radios métricos adaptativos ($300\text{ m}$ a $3{,}0\text{ km}$).
   - Identifican vacíos de servicio o conglomerados residenciales desatendidos.
   - Simulan el impacto de implantar una nueva sede educativa para maximizar la cobertura municipal antes de ejecutar presupuestos de obra pública.
   - Exportan capas de viviendas desprovistas de cobertura en formatos GeoJSON y CSV para análisis especializado.
3. **Administradores del Sistema y Personal de la Alcaldía:**
   - Gestionan de forma centralizada el inventario de equipamientos (altas, modificaciones, bajas).
   - Localizan puntos con precisión milimétrica mediante un mapa de asistencia geográfica y geocodificador Nominatim.
   - Suben capas temáticas en formatos vectoriales estándar (GeoJSON o Shapefiles zipeados) con detección automática de proyección.

### 1.5. Contexto Territorial: Municipio de Sabaneta
Sabaneta, conocido tradicionalmente como el *"Vallecito de Encanto"* o *"El Rinconcito de Antioquia"*, se emplaza en la vertiente oriental del río Medellín-Aburrá, limitando al norte con Envigado, al sur con Caldas, al occidente con La Estrella e Itagüí, y al oriente con Envigado. Sus coordenadas geográficas de referencia se ubican en torno a $\text{Latitud } 6.1515^\circ\text{ N}, \text{Longitud } -75.6165^\circ\text{ W}$. Presenta una combinación de áreas urbanas de altísima densidad y zonas veredales de ladera (Cañaveralejo, María Auxiliadora, Las Lomitas, La Doctora, Pan de Azúcar), lo que hace indispensable el uso de modelos espaciales métricos precisos.

---

## 2. ESPECIFICACIÓN DE REQUISITOS DEL SISTEMA

### 2.1. Requisitos Funcionales (RF)

| Código | Denominación | Descripción Detallada |
| :--- | :--- | :--- |
| **RF-01** | **Visualización Cartográfica Multicapa** | El sistema debe renderizar un mapa base interactivo de Leaflet con selector flotante para cuatro proveedores cartográficos: OpenStreetMap Estándar, CartoDB Positron (Claro), CartoDB Dark Matter (Oscuro) y OpenTopoMap (Topográfico). |
| **RF-02** | **Directorio e Interacción de Instituciones** | Carga y renderizado automatizado de instituciones educativas oficiales (colegios públicos, colegios privados, universidades) y complementarias (OpenStreetMap) con codificación por colores y simbología diferenciada. |
| **RF-03** | **Deduplicación Difusa de Datos Espaciales** | Al incorporar datos externos (ej. OSM), el sistema debe ejecutar en tiempo real un algoritmo que normalice nombres, elimine prefijos administrativos y descarte registros redundantes frente al inventario oficial. |
| **RF-04** | **Ficha de Detalle y Métricas Institucionales** | Cada marcador de institución debe desplegar un modal exhaustivo con: foto, tipo, sector, estrato socioeconómico, dirección, horario, contacto telefónico, web, matrícula estudiantil, cupos disponibles, número de docentes y recursos informáticos. |
| **RF-05** | **Sistema Ciudadano de Calificación y Opiniones** | Los usuarios pueden otorgar valoraciones (1 a 5 estrellas) a cada institución. El sistema debe calcular en la base de datos el promedio ponderado y almacenar el volumen total de opiniones. |
| **RF-06** | **Trazado de Rutas Óptimas a Pie / Vehicular** | Integración de *Leaflet Routing Machine* conectada a la *Geolocation API* del navegador para calcular, renderizar la trayectoria vial y desplegar un botón de cancelación de ruta. |
| **RF-07** | **Buscador Predictivo y Filtros Cruzados** | Sección lateral que permite filtrar dinámicamente instituciones por texto libre (nombre o dirección), clasificación (colegio/universidad), régimen (público/privado) y estrato socioeconómico (1 al 6), ejecutando vuelo suave (*flyTo*) e indicación visual de pulso. |
| **RF-08** | **Comparador Gráfico de Instituciones** | Herramienta que permite seleccionar de 2 a 6 instituciones simultáneamente para comparar sus métricas clave (Estrato, Cupos Libres, Plantel Docente, Estudiantes) mediante histogramas interactivos en SVG. |
| **RF-09** | **Capa Vectorial de Malla Vial** | Ingesta paginada y despliegue vectorizado de la red vial de Sabaneta (>1000 tramos), con estilo de renderizado temático y ventana informativa con atributos viales (tipo de calzada, nombre, velocidad y superficie). |
| **RF-10** | **Visualización de Viviendas y Zonas de Influencia** | Renderizado de predios residenciales priorizados mediante teselas vectoriales (*Vector Tiles* MVT `.pbf`) y superposición de anillos concéntricos poligonales de amortiguamiento (*buffers*) de 150 m, 300 m y 500 m. |
| **RF-11** | **Filtrado Dinámico de Prioridad Residencial** | Interfaz de control que permite encender u ocultar predios según su nivel de proximidad escolar: Alta ($\le 150\text{ m}$), Media ($\le 300\text{ m}$), Baja ($\le 500\text{ m}$) y Sin Prioridad ($> 500\text{ m}$). |
| **RF-12** | **Conversión y Lectura Multiatril de Coordenadas** | Panel de telemetría de cursor que traduce en tiempo real la posición del mouse al sistema seleccionado: WGS84 (4326), MAGNA-SIRGAS (4686), MAGNA Bogotá (3116), Origen Nacional CTM12 (9377) o UTM 17N/18N/19N. |
| **RF-13** | **Carga y Reproyección de Capas al Vuelo** | Asistente para que usuarios o administradores carguen archivos GeoJSON o Shapefiles zipeados (`.zip`), detectando automáticamente su proyección (por miembros `crs`, WKT `.prj` o rangos numéricos) y reproyectando a WGS84. |
| **RF-14** | **Caja de Herramientas Geodésicas de Medición** | Herramientas interactivas en pantalla para: a) Captura seriada de puntos con exportación a CSV; b) Medición acumulada de distancias lineales; c) Medición de áreas poligonales sobre la esfera terrestre. |
| **RF-15** | **Motor de Cobertura y Simulador de Nuevas Sedes** | Herramienta analítica que evalúa porcentajes de predios y superficie cubierta según radio variable, identifica focos desatendidos, permite implantar sedes hipotéticas y computa la ganancia territorial. |
| **RF-16** | **Panel de Control Administrativo Seguro (CRUD)** | Módulo protegido por credenciales para crear, listar, modificar y eliminar registros de instituciones, respaldado por un selector geográfico con geocodificación inversa. |

### 2.2. Requisitos No Funcionales (RNF)

| Código | Categoría | Criterio de Aceptación |
| :--- | :--- | :--- |
| **RNF-01** | **Rendimiento y Ligereza** | El visor inicial debe alcanzar un *First Contentful Paint* (FCP) inferior a 1,5 segundos en conexiones 4G estándar. El despliegue de miles de puntos de vivienda no debe congelar el hilo principal de la interfaz gracias al uso de *Vector Tiles* pre-compilados y capas vectoriales optimizadas. |
| **RNF-02** | **Seguridad y Control de Acceso** | Separación estricta de privilegios en base de datos mediante *Row Level Security* (RLS). Las llaves públicas anónimas expuestas en cliente solo poseen permisos de lectura o inserción pública controlada; las modificaciones y borrados en tablas maestras exigen tokens JWT válidos otorgados por Supabase Auth. |
| **RNF-03** | **Escalabilidad y Disponibilidad** | Arquitectura 100% *Serverless / Jamstack* alojada en la Red de Entrega de Contenidos (Edge CDN) global de Vercel, garantizando tolerancia a picos de tráfico con disponibilidad operativa del 99,9% sin mantenimiento de servidores dedicados. |
| **RNF-04** | **Precisión Cartográfica y Geodésica** | Las mediciones de distancia y reproyecciones deben ajustarse estrictamente a las definiciones oficiales publicadas en el registro EPSG y por el Instituto Geográfico Agustín Codazzi (IGAC), empleando el elipsoide GRS80 y la proyección CTM12 para EPSG:9377. |
| **RNF-05** | **Usabilidad y Accesibilidad (UI/UX)** | Interfaz adaptativa construida bajo la filosofía *Dark Theme* con contrastes cromáticos en cumplimiento con las pautas WCAG 2.1 nivel AA. Panel lateral colapsable, controles accesibles por teclado (Escape, Enter) y tipografía monoespaciada para coordenadas. |
| **RNF-06** | **Interoperabilidad y Estándares Abiertos** | Compatibilidad integral con formatos abiertos geoespaciales consagrados por el *Open Geospatial Consortium* (OGC): GeoJSON, OGC GeoPackage (`.gpkg`), Shapefile (ESRI) y Mapbox Vector Tiles (`.pbf`). |
| **RNF-07** | **Capacidad en Tiempo Real** | Actualización reactiva del lienzo cartográfico y de las tablas de datos ante eventos de inserción, actualización o eliminación en la base de datos sin requerir el refresco completo de la página web (*WebSockets* / Polling fallback). |
| **RNF-08** | **Mantenibilidad y Código Desacoplado** | Arquitectura modular en JavaScript nativo estructurada en capas independientes (presentación, estado, geocálculo, cliente de base de datos) sin dependencia de frameworks pesados (React/Angular/Vue), reduciendo la deuda técnica. |

---

## 3. ARQUITECTURA Y ASPECTOS TÉCNICOS (MANUAL DEL DESARROLLADOR)

### 3.1. Arquitectura General y Paradigma de Diseño
El sistema opera bajo un patrón desacoplado en dos capas principales (*Frontend Jamstack + BaaS en la Nube*) complementado por una tubería de geoprocesamiento *offline/batch* en Python:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            NAVEGADOR CLIENTE (WEB)                          │
├──────────────────────────────────────┬──────────────────────────────────────┤
│          VISOR PÚBLICO               │        PANEL DE ADMINISTRACIÓN       │
│          (index.html)                │         (administracion.html)        │
│ ┌──────────────────────────────────┐ │ ┌──────────────────────────────────┐ │
│ │ - Motor Cartográfico (Leaflet)   │ │ │ - Autenticación Supabase Auth    │ │
│ │ - Lectura y Conversión CRS       │ │ │ - CRUD Instituciones Educativas  │ │
│ │ - Routing Machine (Rutas)        │ │ │ - Asistente Picker de Ubicación  │ │
│ │ - Buscador Predictivo & Filtros  │ │ │ - Importador de Capas (Zip/JSON) │ │
│ │ - Comparador de Instituciones    │ │ │ - Sincronizador Realtime         │ │
│ │ - Simulador de Cobertura         │ │ │ - Visualizador Espejo            │ │
│ └──────────────────────────────────┘ │ └──────────────────────────────────┘ │
└───────────────────▲──────────────────────────────────▲──────────────────────┘
                    │ HTTPS / REST / WebSockets         │
┌───────────────────▼──────────────────────────────────▼──────────────────────┐
│                       SUPABASE PLATFORM (BaaS / Cloud)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Supabase Auth: Gestión de identidades, sesiones y emisión de tokens JWT. │
│ 2. PostgreSQL 15 + PostGIS: Tablas relacionales y espaciales con RLS.       │
│    - layers (Catálogo y geometrías GeoJSON)                                 │
│    - instituciones_educativas (Directorio escolar y métricas)               │
│    - vias_sabaneta (Red vial vectorizada)                                   │
│ 3. Supabase Realtime: Publicación y suscripción (CDC vía WebSockets).       │
│ 4. Supabase Storage: Bucket de almacenamiento de capas vectoriales crudas.  │
└───────────────────────────────────▲─────────────────────────────────────────┘
                                    │ Extracción REST
┌───────────────────────────────────┴─────────────────────────────────────────┐
│              PIPELINE BACKEND DE GEOPROCESAMIENTO (Python + GDAL/OGR)        │
├─────────────────────────────────────────────────────────────────────────────┤
│ Scripts: geoprocesamiento_viviendas_colegios.py | generar_tiles.py          │
│ • Reproyección métrica WGS84 -> MAGNA-SIRGAS 2018 Origen Nacional (EPSG:9377)│
│ • Creación de Buffers OGR euclidianos exactos (150 m, 300 m, 500 m)         │
│ • Spatial Join & Distance Computation (Viviendas vs Colegios)               │
│ • Generación de Productos: .geojson | .gpkg (OGC) | .pbf (Vector Tiles MVT) │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2. Estructura de Directorios del Código Fuente

```text
Visor_Geografico-2/
└── visor-geografico/
    ├── index.html                      # Punto de entrada del Geovisor público
    ├── administracion.html             # Módulo administrativo y panel de gestión
    ├── vercel.json                     # Configuración de enrutamiento y cabeceras Vercel
    ├── README.md                       # Resumen rápido del proyecto
    ├── ejecutar_geoproceso.bat         # Automatizador Windows para pipeline GDAL
    ├── geoprocesamiento_viviendas_colegios.py # Geoprocesamiento central GDAL/OGR
    ├── generar_tiles.py                # Generador de Mapbox Vector Tiles (.pbf)
    ├── script_gdal.py                  # Wrapper resiliente para entornos Conda/QGIS
    ├── css/
    │   ├── style.css                   # Hoja de estilos global, temas y layout
    │   └── admin-modal.css             # Estilos modales del panel administrativo
    ├── js/
    │   ├── crs.js                      # Definiciones proj4js y motor de conversión
    │   ├── layers.js                   # Manejador de capas, parser Zip y detección CRS
    │   ├── supabaseClient.js           # Inicialización y métodos del cliente Supabase
    │   ├── main.js                     # Inicialización del mapa base del Geovisor
    │   ├── instituciones.js            # Lógica de equipamientos, modales, opiniones y rutas
    │   ├── vias.js                     # Carga paginada y visualización de la red vial
    │   ├── viviendas.js                # Renderizado de Vector Tiles y filtros de prioridad
    │   ├── visor-buscador.js           # Buscador predictivo, filtros y flyTo
    │   ├── comparador-instituciones.js # Comparador de 2 a 6 colegios con gráficos SVG
    │   ├── analisis-cobertura.js       # Análisis de proximidad, zonas críticas y simulación
    │   ├── herramientas-capa.js        # Herramientas de medición métrica y captura
    │   ├── tiempo-real-instituciones.js# Escucha reactiva WebSockets/Polling
    │   ├── admin-filtros.js            # Filtros dinámicos en tabla administrativa
    │   ├── admin-ubicacion.js          # Asistente de geocodificación y selector en mapa
    │   └── landing.js                  # Control de presentación y bienvenida
    ├── data/
    │   ├── colegios-universidades-sabaneta.geojson # Capa vectorial de referencia
    │   ├── viviendas_base.geojson       # Registro crudo de predios residenciales
    │   ├── viviendas_priorizadas_colegios.geojson # Predios enriquecidos con métricas
    │   ├── buffers_colegios.geojson     # Polígonos de amortiguamiento (150m, 300m, 500m)
    │   ├── viviendas_analisis.gpkg      # OGC GeoPackage multicapa generado
    │   └── viviendas_respaldo.gpkg      # Respaldo binario del análisis espacial
    ├── tiles/
    │   └── viviendas_priorizadas/       # Directorio de teselas MVT (.pbf) zooms 10 al 17
    │       ├── metadata.json
    │       └── {z}/{x}/{y}.pbf
    └── docs/
        ├── arquitectura.md              # Documentación técnica inicial
        ├── sistemas-coordenadas.md      # Reseña geodésica de estándares colombianos
        └── manual-usuario.md            # Guía operativa resumida
```

### 3.3. Pila Tecnológica y Librerías Empleadas

#### A. Tecnologías Frontend (Cliente)
- **HTML5 Semántico y CSS3 Puro:** Variables nativas CSS (Custom Properties), soporte Flexbox y CSS Grid. No requiere preprocessadores (SASS/LESS).
- **JavaScript Moderno (ES6+):** Código nativo estructurado mediante clausuras (*IIFE*), funciones asíncronas (`async/await`) y eventos desacoplados.
- **Leaflet (v1.9.4):** Biblioteca líder para visualización cartográfica ligera y eficiente.
- **Leaflet.VectorGrid (v1.3.0):** Motor de renderizado en cliente para teselas vectoriales *Mapbox Vector Tiles* (`.pbf`).
- **Leaflet Routing Machine (v3.3.4):** Generación y despliegue de cálculo de itinerarios viales y trazado de rutas.
- **Proj4js (v2.9.2):** Motor matemático para reproyección y transformación cartográfica de coordenadas al vuelo.
- **JSZip (v3.10.1) & shpjs (v6.2.0):** Descompresión en memoria del cliente y lectura binaria de archivos Shapefiles (`.shp` + `.dbf` + `.prj`).
- **Supabase JS Client (v2.x):** SDK oficial para consumo de PostgREST, autenticación JWT y canales de eventos Realtime.

#### B. Tecnologías de Backend, Nube y Base de Datos
- **Supabase Cloud:** Plataforma BaaS sustentada sobre **PostgreSQL 15** con soporte espacial PostGIS.
- **Vercel Edge Platform:** Infraestructura de servidor estático global sin necesidad de compilación (*No-build Jamstack*).

#### C. Tecnologías de Geoprocesamiento Espacial
- **Python (v3.10+):** Lenguaje base de geoprocesamiento.
- **GDAL / OGR (v3.x / osgeo):** Librería C/C++ vinculada para transformaciones espaciales, álgebra de geometrías, generación de buffers euclidianos y traducción de formatos a MVT y GeoPackage.

---

### 3.4. Modelo y Esquema de Base de Datos (PostgreSQL / Supabase / PostGIS)

#### 1. Tabla `layers` (Catálogo de Capas Dinámicas)
Almacena la metadata y estructuras geográficas registradas por usuarios o administradores:

```sql
CREATE TABLE layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  epsg_code TEXT NOT NULL,
  file_url TEXT,
  geojson_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Políticas de Seguridad de Fila (RLS)
ALTER TABLE layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de capas" 
  ON layers FOR SELECT USING (true);

CREATE POLICY "Inserción controlada de capas" 
  ON layers FOR INSERT WITH CHECK (true);
```

#### 2. Tabla `instituciones_educativas` (Directorio Maestro)
Estructura relacional con las características físicas, pedagógicas y de contacto:

```sql
CREATE TABLE instituciones_educativas (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('colegio', 'universidad')),
  sector TEXT NOT NULL CHECK (sector IN ('publico', 'privado')),
  direccion TEXT,
  latitud DOUBLE PRECISION NOT NULL,
  longitud DOUBLE PRECISION NOT NULL,
  telefono TEXT,
  sitio_web TEXT,
  horario TEXT,
  imagen_url TEXT,
  descripcion TEXT,
  estrato INTEGER CHECK (estrato BETWEEN 1 AND 6),
  num_estudiantes INTEGER DEFAULT 0,
  cupos_disponibles INTEGER DEFAULT 0,
  recursos_tecnologicos INTEGER DEFAULT 0,
  num_docentes INTEGER DEFAULT 0,
  calificacion NUMERIC(2,1) DEFAULT 0.0,
  num_opiniones INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE instituciones_educativas ENABLE ROW LEVEL SECURITY;

-- Lectura abierta para todo el público
CREATE POLICY "Lectura pública de instituciones" 
  ON instituciones_educativas FOR SELECT USING (true);

-- Modificaciones reservadas para usuarios administradores autenticados
CREATE POLICY "Gestión administrativa total" 
  ON instituciones_educativas 
  FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

-- Permiso de actualización exclusivo para calificación ciudadana (campos específicos)
CREATE POLICY "Actualización comunitaria de calificaciones" 
  ON instituciones_educativas 
  FOR UPDATE 
  USING (true) 
  WITH CHECK (true);
```

#### 3. Tabla `vias_sabaneta` (Infraestructura Vial)
Almacena la malla de conectividad municipal:
- `id`: Identificador único serial / BIGINT.
- `nombre`: Nombre o nomenclatura vial (ej. "Carrera 45", "Calle 75 Sur").
- `highway`: Jerarquía vial según convención OSM (ej. *primary, secondary, residential, tertiary*).
- `surface`: Tipo de rodadura (pavimento, asfalto, adoquín).
- `oneway`: Indicador de sentido vial (yes/no).
- `maxspeed`: Límite reglamentario de velocidad.
- `lanes`: Número de carriles.
- `geojson_data` / `geom`: Geometría `LineString` o `MultiLineString`.

---

### 3.5. Formatos de Intercambio y Archivos Cartográficos

| Archivo / Recurso | Formato | Estándar | Finalidad Técnica |
| :--- | :--- | :--- | :--- |
| `colegios-universidades-sabaneta.geojson` | GeoJSON (RFC 7946) | WGS84 (EPSG:4326) | Base cartográfica semilla con puntos institucionales oficiales. |
| `viviendas_base.geojson` | GeoJSON (RFC 7946) | WGS84 (EPSG:4326) | Capa bruta de predios residenciales de Sabaneta. |
| `viviendas_priorizadas_colegios.geojson` | GeoJSON (RFC 7946) | WGS84 (EPSG:4326) | Capa enriquecida con distancia en metros, id de colegio y nivel de prioridad. |
| `buffers_colegios.geojson` | GeoJSON (RFC 7946) | WGS84 (EPSG:4326) | Polígonos de amortiguamiento euclidiano de 150m, 300m y 500m. |
| `viviendas_analisis.gpkg` | OGC GeoPackage | EPSG:4326 (SQLite binario) | Base de datos geoespacial portátil multicapa (3 capas: viviendas, buffers, instituciones). |
| `tiles/viviendas_priorizadas/{z}/{x}/{y}.pbf` | Mapbox Vector Tile | MVT / Protocol Buffers | Teselas vectoriales piramidales optimizadas para consumo web sin sobrecarga de memoria. |

---

### 3.6. Algoritmos y Lógica de Negocio Clave

#### A. Detección Heurística de CRS y Reproyección (`layers.js`, `crs.js`)
Dado que los archivos GeoJSON a menudo omiten la definición estandarizada de proyección, el sistema evalúa la primera tupla de coordenadas $(X, Y)$ bajo la siguiente lógica:

$$\text{Rango geográfico: } -180 \le X \le 180 \quad \land \quad -90 \le Y \le 90 \implies \text{EPSG:4326 (WGS84)}$$
$$\text{Falso Este cercano a } 5{,}000{,}000\text{ m} \implies \text{EPSG:9377 (MAGNA-SIRGAS Origen Nacional)}$$
$$\text{Falso Este / Norte cercanos a } 1{,}000{,}000\text{ m} \implies \text{EPSG:3116 (MAGNA-SIRGAS Bogotá)}$$
$$\text{Coordenadas planas métricas } (X \in [100{,}000, 900{,}000]) \implies \text{EPSG:32617, 32618 o 32619 (UTM)}$$

Si el archivo proviene de un Shapefile zipeado, se examina el fichero `.prj` interpretando los textos clave WKT:
- `MAGNA-SIRGAS_2018_Origen-Nacional` $\implies$ `EPSG:9377`
- `Colombia_Bogota_Zone` $\implies$ `EPSG:3116`
- `UTM_Zone_18N` $\implies$ `EPSG:32618`

Una vez confirmado el CRS, la reproyección a WGS84 para su renderizado se computa de forma recursiva en el árbol de geometrías usando Proj4js:

```javascript
function transformCoordinatesDeep(coords, fromEpsg) {
  if (typeof coords[0] === 'number') {
    const pt = convertToWGS84(coords[0], coords[1], fromEpsg);
    return [pt.lon, pt.lat];
  }
  return coords.map((c) => transformCoordinatesDeep(c, fromEpsg));
}
```

#### B. Deduplicación Difusa de Entidades Educativas (`instituciones.js`)
Para combinar las fuentes oficiales con OpenStreetMap sin duplicar marcadores, se implementó un algoritmo de similitud por tokens de Jaccard normalizados:
1. Se limpia el texto: minúsculas, eliminación de diacríticos y supresión de prefijos institucionales (`"i.e."`, `"colegio"`, `"instituto"`, `"gimnasio"`, `"universidad"`).
2. Se eliminan palabras vacías o *stopwords* (`"de"`, `"la"`, `"el"`, `"los"`, `"del"`).
3. Se calcula el coeficiente de coincidencia sobre los conjuntos de tokens resultantes $A$ y $B$:

$$\text{Similitud}(A, B) = \frac{|A \cap B|}{\min(|A|, |B|)}$$

Si el índice resultante es $\ge 0{,}60$, el registro complementario se clasifica como duplicado y se excluye automáticamente de la vista.

#### C. Algoritmo de Calificación Ciudadana (Promedio Ponderado Continuo)
Para evitar bloqueos por tablas secundarias y mantener máxima eficiencia transaccional, la nueva calificación se actualiza atómicamente:

$$\overline{C}_{\text{nuevo}} = \frac{(\overline{C}_{\text{actual}} \cdot N) + C_{\text{usuario}}}{N + 1}$$

donde $\overline{C}$ representa la calificación promedio y $N$ el volumen acumulado de opiniones.

#### D. Fórmulas de Medición Geodésica (`herramientas-capa.js`)
- **Distancia Lineal (Fórmula de Haversine):**
  Para dos puntos $(\phi_1, \lambda_1)$ y $(\phi_2, \lambda_2)$ sobre un radio terrestre medio $R = 6{,}371{,}008{,}8\text{ m}$:

  $$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
  $$d = 2 R \arcsin(\min(1, \sqrt{a}))$$

- **Área Poligonal Esférica (Método de Chamberlain–Duquette):**
  Calcula el área de un polígono cerrado sobre la esfera en metros cuadrados:

  $$A = \left| \frac{R^2}{2} \sum_{i=1}^{n} (\lambda_{i+1} - \lambda_i)(2 + \sin(\phi_i) + \sin(\phi_{i+1})) \right|$$

---

### 3.7. Pipeline de Geoprocesamiento Backend con GDAL / OGR

Implementado en `geoprocesamiento_viviendas_colegios.py`, ejecuta el siguiente flujo riguroso:

```
[viviendas_base.geojson] (EPSG:4326)   [colegios.geojson] (EPSG:4326)
                  │                                  │
                  ▼                                  ▼
      Reproyección a EPSG:9377            Reproyección a EPSG:9377
         (Origen Nacional)                  (Origen Nacional)
                  │                                  │
                  │                 ┌────────────────┴────────────────┐
                  │                 │  Generación de Buffers OGR      │
                  │                 │  - Alta prioridad:  <= 150 m    │
                  │                 │  - Media prioridad: <= 300 m    │
                  │                 │  - Baja prioridad:  <= 500 m    │
                  │                 └────────────────┬────────────────┘
                  │                                  │
                  ▼                                  ▼
       ┌────────────────────────────────────────────────────────┐
       │   Cálculo de Distancias Euclidianas Exactas en Metros │
       │   y Clasificación Jerárquica de Proximidad             │
       └──────────────────────────┬─────────────────────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
[GeoJSON Enriquecido]    [OGC GeoPackage .gpkg]     [Mapbox Vector Tiles]
- viviendas_priorizadas  - Capa 1: Viviendas        - tiles/viviendas_priorizadas/
- buffers_colegios       - Capa 2: Buffers Colegios   {z}/{x}/{y}.pbf (Zooms 10-17)
                         - Capa 3: Instituciones
```

El script aprovecha `osgeo.ogr` para los cálculos geométricos y `gdal.VectorTranslate` con opciones optimizadas:
```python
options = gdal.VectorTranslateOptions(
    format="MVT",
    datasetCreationOptions=["MINZOOM=10", "MAXZOOM=17", "COMPRESS=NO"],
    layerCreationOptions=["NAME=viviendas"]
)
```

---

## 4. GUÍA DE USO PASO A PASO (MANUAL DEL USUARIO FINAL)

### 4.1. Acceso a la Plataforma y Pantalla de Bienvenida
1. Ingrese a la URL pública: [https://visorgeografico.vercel.app](https://visorgeografico.vercel.app).
2. Será recibido por la **Pantalla de Bienvenida (Landing Screen)**, la cual presenta una introducción didáctica sobre la territorialidad de Sabaneta y un resumen de las capacidades del sistema.
3. Presione el botón central **"Abrir el geovisor"**. La cortina inicial se desplazará suavemente dando acceso al espacio de trabajo.

### 4.2. Exploración del Mapa y Capas Base
- **Navegación:** Arrastre con el botón izquierdo del ratón para desplazarse (*Pan*). Utilice la rueda del mouse o los botones `+` y `-` ubicados en la esquina inferior derecha para controlar el zoom.
- **Selector de Mapa Base:** En la esquina superior derecha, sitúe el cursor sobre el ícono de capas flotante para alternar entre:
  - *OpenStreetMap Estándar:* Vista urbana convencional con nombres de calles.
  - *CartoDB Claro:* Mapa limpio de tonos blancos y grises, óptimo para destacar capas temáticas.
  - *CartoDB Oscuro:* Fondo oscuro de alto contraste, ideal para lectura nocturna y análisis de calor.
  - *OpenTopoMap:* Representación de curvas de nivel, relieve y orografía del municipio.

### 4.3. Panel de Herramientas Espaciales y Control de Capas
En la barra lateral izquierda encontrará el panel de control:
- **Colapso del Panel:** Para maximizar el área de trabajo cartográfico, haga clic en el botón superior **"Ocultar panel"**. El mapa se expandirá al 100% del ancho disponible.
- **Control de Capas (Encendido / Apagado):** Cada capa temática cuenta con una casilla de selección (*checkbox*) que permite activar o desactivar su visualización de forma independiente:
  - *Colegios públicos* (marcador azul)
  - *Colegios privados* (marcador naranja)
  - *Universidades privadas* (marcador morado)
  - *Colegios OSM consulta básica* (marcador amarillo)
  - *Red vial de Sabaneta* (líneas rojas/estilizadas)
  - *Viviendas priorizadas por cercanía* (puntos coloreados por prioridad)
  - *Zonas de influencia escolar* (anillos concéntricos de 150m, 300m y 500m)
  - *Límite municipal* (polígono discontinuo esmeralda)

### 4.4. Selector y Conversión Dinámica de Sistemas de Coordenadas
1. Ubique la sección **"Sistema de coordenadas"** en la barra lateral.
2. Despliegue el menú y seleccione el sistema de referencia de su interés:
   - `EPSG:4326 · WGS84 (Geográfico)` $\to$ Muestra Latitud / Longitud en grados decimales.
   - `EPSG:4686 · MAGNA-SIRGAS (Geográfico)` $\to$ Datum oficial de Colombia en grados.
   - `EPSG:9377 · MAGNA-SIRGAS 2018 / Origen Nacional` $\to$ Coordenadas métricas oficiales vigentes (Norte / Este en metros).
   - `EPSG:3116 · MAGNA-SIRGAS / Bogotá` $\to$ Proyección métrica histórica anterior a 2020.
   - `EPSG:32618 · WGS84 / UTM zona 18N` $\to$ Proyección métrica UTM correspondiente al centro de Colombia.
3. Desplace el cursor sobre el mapa: el panel **"Lectura del cursor"** actualizará instantáneamente los valores numéricos correspondientes al punto exacto donde se ubica el mouse.

### 4.5. Buscador Avanzado y Filtros de Instituciones
En la sección superior **"Buscar institución"**:
1. Escriba parte del nombre o de la dirección en la casilla de texto (ej. *"Alcázares"*, *"Calle 75"*).
2. Utilice los filtros combinados si desea restringir los resultados:
   - **Tipo:** Todos, Solo Colegios o Solo Universidades.
   - **Sector:** Todos, Solo Públicos o Solo Privados.
   - **Estrato:** Cualquier estrato o filtrar un nivel específico del 1 al 6.
3. La lista inferior mostrará los resultados coincidentes en tiempo real con un contador de coincidencias.
4. Haga clic sobre cualquier elemento de la lista: el mapa ejecutará una transición suave de vuelo (*flyTo*) hacia la institución, activará una animación de pulso visual sobre el marcador y abrirá su ficha informativa.

### 4.6. Ficha Detallada de Institución, Rutas de Transporte y Calificaciones
Al hacer clic sobre cualquier marcador escolar en el mapa se despliega la **Ficha Técnica Integral**:
- **Cabecera:** Fotografía oficial del plantel, nombre completo, estrato socioeconómico y tipo de sector.
- **Sistema de Calificación:** Visualización de estrellas doradas y promedio numérico. Al pulsar *"Escribir una opinión"*, el usuario puede seleccionar una puntuación de 1 a 5 estrellas y registrar su valoración en la base de datos de Supabase.
- **Datos de Contacto y Atención:** Dirección física, línea telefónica, enlace directo al sitio web oficial y horario de atención.
- **Indicadores Académicos:** Cuadrícula con matrículas activas, cupos disponibles, dotación de docentes y equipos tecnológicos.
- **Trazado de Ruta Paso a Paso:** Al hacer clic en el botón verde **"Cómo llegar (Ruta)"**, el sistema solicitará permiso para acceder a la ubicación GPS del usuario y trazar la trayectoria óptima a pie o en vehículo mediante una línea luminosa. Para cancelar el enrutamiento, pulse el botón flotante rojo **"Quitar ruta"**.

### 4.7. Comparador Multicriterio de Instituciones Educativas
1. Haga clic en el botón con ícono de balanza/comparador situado en la barra de controles del mapa.
2. Se abrirá la ventana modal del **Comparador Institucional**.
3. Seleccione entre 2 y 6 instituciones del menú desplegable.
4. El sistema generará automáticamente histogramas comparativos agrupados en cuatro dimensiones:
   - **Estrato:** Comparativa de localización socioeconómica.
   - **Cupos disponibles:** Visualización de disponibilidad para nuevos estudiantes.
   - **Cuerpo docente:** Dotación de profesores.
   - **Estudiantes matriculados:** Tamaño de la comunidad escolar.

### 4.8. Visualización de Viviendas y Filtros de Priorización Escolar
1. Active la capa **"Viviendas priorizadas"**.
2. Aparecerá un control flotante con cuatro casillas de verificación correspondientes a los niveles de servicio:
   - **Alta Prioridad (Rojo):** Viviendas situadas a una distancia $\le 150\text{ m}$ de un colegio.
   - **Media Prioridad (Amarillo):** Viviendas situadas entre $151\text{ m}$ y $300\text{ m}$.
   - **Baja Prioridad (Verde):** Viviendas situadas entre $301\text{ m}$ y $500\text{ m}$.
   - **Sin Prioridad (Gris):** Viviendas situadas a más de $500\text{ m}$ de cualquier institución.
3. Al hacer clic en cualquier predio residencial, se desplegará una ventana emergente que detalla: código de predio, barrio, colegio más próximo asignado, distancia euclidiana exacta en metros y área estimada en $m^2$.

### 4.9. Herramientas de Medición y Captura de Coordenadas
En la barra de herramientas flotante del mapa:
- **Capturar Coordenadas:** Pulse el botón de punto. Cada clic que realice sobre el mapa fijará un marcador secuencial ($1, 2, 3\dots$) indicando sus coordenadas en el sistema activo. Puede copiar valores individuales al portapapeles o descargar la lista completa en un archivo CSV.
- **Medir Distancia:** Pulse el ícono de regla. Haga clics sucesivos sobre el trazado que desee medir. Una línea elástica indicará la longitud de cada segmento y el metraje total acumulado (en metros o kilómetros). Pulse `Enter` para finalizar o `Escape` para cancelar.
- **Medir Área:** Pulse el ícono de polígono. Haga clic en los vértices del terreno. El sistema computará el área total en metros cuadrados ($m^2$), hectáreas ($\text{ha}$) o kilómetros cuadrados ($km^2$), además del perímetro.

### 4.10. Módulo de Análisis de Cobertura y Simulación Territorial
1. Pulse el botón de análisis de cobertura en la barra del mapa.
2. Defina el **Radio de Cobertura Deseado** mediante el deslizador (desde $300\text{ m}$ hasta $3{,}0\text{ km}$).
3. Seleccione qué tipos de instituciones desea incluir en el cálculo (Colegios, Universidades, Públicos, Privados).
4. El motor computará y desplegará:
   - Porcentaje global de viviendas cubiertas vs desatendidas.
   - Porcentaje de superficie municipal cubierta.
   - Desglose estadístico por barrios y zonas críticas.
5. **Simulador de Nueva Sede (What-If):** Puede pulsar *"Sugerir mejor ubicación"* para que el sistema identifique el centroide del mayor vacío de cobertura, o hacer clic directamente en el mapa para ubicar una institución hipotética. La herramienta calculará al instante cuántas viviendas adicionales se beneficiarían y el porcentaje de incremento en cobertura municipal.
6. Permite descargar la lista de predios sin cobertura en formatos CSV o GeoJSON.

### 4.11. Sección de Preguntas Frecuentes y Enlaces Institucionales
Al pie de página del visor se ubica la sección acordeón de **Preguntas Frecuentes**, orientada a resolver trámites cotidianos de la ciudadanía:
- Pasos para solicitar cupos educativos en la plataforma oficial **Mi Cuenta Sabaneta**.
- Procedimiento para radicación de traslados institucionales.
- Información sobre convocatorias de becas municipales.
- Criterios de enfoque diferencial y beneficios para población con discapacidad o víctimas del conflicto armado.

---

## 5. GUÍA DE MANTENIMIENTO, DESPLIEGUE Y OPERACIÓN (MANUAL DEL ADMINISTRADOR)

### 5.1. Requisitos Previos del Entorno
Para el mantenimiento del código fuente y la ejecución del pipeline espacial se requiere:
- **Sistema Operativo:** Windows 10/11, macOS o distribuciones Linux (Ubuntu 20.04+).
- **Node.js (Opcional, para pruebas locales):** Versión 18.x o superior con gestor `npx` o `pnpm`.
- **Python:** Versión 3.10 o 3.11 con entorno GDAL configurado (disponible a través de QGIS Desktop, OSGeo4W o Miniconda/Anaconda).
- **Navegador Web Moderno:** Google Chrome 110+, Mozilla Firefox 110+, Microsoft Edge o Safari 16+.

### 5.2. Puesta en Marcha en Entorno Local
El frontend carece de fase de compilación (*build-less*). Para levantarlo localmente:

1. Clonar el repositorio de trabajo:
   ```bash
   git clone https://github.com/usuario/Visor_Geografico-2.git
   cd Visor_Geografico-2/visor-geografico
   ```
2. Iniciar un servidor HTTP estático en la raíz de `visor-geografico/`:
   - Con Python:
     ```bash
     python -m http.server 3000
     ```
   - Con Node / npx:
     ```bash
     npx serve .
     ```
3. Abra su navegador en `http://localhost:3000`.

### 5.3. Despliegue Continuo en Vercel
El repositorio está configurado para integración y despliegue continuo (CI/CD) automático:
1. Conectar la cuenta de GitHub con la organización en [Vercel](https://vercel.com).
2. Crear un nuevo proyecto importando el repositorio `Visor_Geografico-2`.
3. Establecer el directorio raíz (*Root Directory*) en `visor-geografico`.
4. En **Framework Preset**, seleccionar **Other**.
5. Dejar vacíos los campos *Build Command* y *Output Directory*.
6. Pulsar **Deploy**. Cada confirmación (*push*) a la rama `main` compilará y actualizará la versión pública en segundos.

### 5.4. Configuración y Aprovisionamiento en Supabase
1. Acceda a la consola de [Supabase](https://supabase.com) y cree un nuevo proyecto.
2. Ingrese a **Project Settings $\to$ API** y copie:
   - `Project URL`
   - `anon public key`
3. Pegue estas credenciales en el archivo `js/supabaseClient.js`:
   ```javascript
   const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
   const SUPABASE_ANON_KEY = 'TU_ANON_KEY_PUBLICA';
   ```
4. Diríjase al **SQL Editor** de Supabase y ejecute las sentencias DDL provistas en la [Sección 3.4](#34-modelo-y-esquema-de-base-de-datos-postgresql--supabase--postgis) para crear las tablas `layers` e `instituciones_educativas`.
5. En **Authentication $\to$ Users**, cree las cuentas de correo y contraseña asignadas a los administradores autorizados.
6. En **Database $\to$ Replication**, active la réplica en tiempo real para la tabla `instituciones_educativas` si desea habilitar la sincronización reactiva instantánea vía WebSockets.

### 5.5. Panel de Administración: Acceso y Flujos de Trabajo
1. En la barra de navegación superior del visor, haga clic en el enlace **"Administración"** (o acceda directamente a `administracion.html`).
2. Introduzca las credenciales de correo electrónico y contraseña del administrador.
3. Al autenticarse satisfactoriamente, el sistema ocultará la pantalla de inicio de sesión y desplegará la consola administrativa compuesta por:
   - **Barra de herramientas:** Botón para crear nueva institución y botón de cierre de sesión.
   - **Tabla interactiva de instituciones:** Listado con ordenamiento, indicadores y acciones (Editar / Eliminar).
   - **Filtros administrativos:** Búsqueda rápida por nombre/dirección, tipo, sector y estrato.
   - **Consola Cartográfica Espejo:** Mapa de verificación con lectura de coordenadas en vivo y selector de CRS.
   - **Módulo de Importación de Capas:** Área de soltado (*drag & drop*) de ficheros geográficos.

### 5.6. Gestión de Instituciones (CRUD) y Asistente Cartográfico
- **Creación / Edición:** Al pulsar `+ Nueva institución` o el botón de edición en cualquier fila de la tabla, se abre el modal administrativo:
  - Formulario estructurado en 4 secciones: *Datos Básicos*, *Ubicación*, *Contacto e Imagen* e *Indicadores Académicos*.
  - **Selector Cartográfico Integrado:** El modal incluye un mini-mapa interactivo donde el administrador puede fijar la posición haciendo clic sobre el mapa, arrastrar el marcador con precisión métrica o escribir la dirección y presionar *"Buscar dirección"* para invocar el geocodificador Nominatim.
  - Validación de coherencia espacial: El sistema alertará visualmente si el punto fijado se sale de los límites territoriales de Sabaneta.
- **Eliminación Segura:** Al presionar el botón de eliminar, el sistema solicita confirmación explícita mediante un modal de confirmación antes de impactar la base de datos de Supabase.

### 5.7. Carga y Normalización de Nuevas Capas Geográficas
1. En la sección lateral derecha de administración, localice el recuadro **"Importar capa"**.
2. Arrastre un archivo `.geojson`, `.json` o un archivo Shapefile comprimido en `.zip` (que contenga obligatoriamente `.shp`, `.dbf` y `.prj`).
3. El motor de detección leerá la cabecera y sugerirá el sistema de referencia espacial detectado (ej. `EPSG:9377`).
4. El administrador puede ratificar la sugerencia o corregirla en el desplegable.
5. Al pulsar **"Confirmar y añadir capa"**, el archivo se reproyecta a WGS84, se dibuja en el mapa, se lista en las capas importadas y se respalda opcionalmente en Supabase con `saveLayerMetadata()`.

### 5.8. Ejecución Automatizada del Geoproceso Espacial (Python / GDAL)
Cuando se actualicen los predios de viviendas o las instituciones y se requiera recalcular las zonas de influencia y las teselas vectoriales:

- **Método Rápido (Windows):**
  Haga doble clic sobre el archivo por lotes `ejecutar_geoproceso.bat`. Este script detecta automáticamente los intérpretes de Python que contienen las librerías `osgeo` (instalaciones de QGIS o Conda) y lanza el pipeline.
- **Método por Consola (CLI):**
  ```bash
  python script_gdal.py
  # O invocando directamente el pipeline:
  python geoprocesamiento_viviendas_colegios.py
  ```
El proceso ejecutará secuencialmente:
1. La reproyección oficial a MAGNA-SIRGAS 2018 / Origen Nacional (`EPSG:9377`).
2. La creación de polígonos de amortiguamiento OGR euclidianos (150m, 300m, 500m).
3. El cruce espacial métrico y clasificación de prioridad de cada vivienda.
4. La regeneración de `viviendas_priorizadas_colegios.geojson` y `buffers_colegios.geojson`.
5. La consolidación del archivo binario OGC GeoPackage `viviendas_analisis.gpkg`.
6. La compilación piramidal de *Vector Tiles* MVT `.pbf` en la carpeta `tiles/viviendas_priorizadas/`.

### 5.9. Políticas de Respaldo, Seguridad y Diagnóstico de Fallos

#### A. Respaldos Periódicos
- **Base de Datos Relacional:** Genere respaldos periódicos de la base de datos de Supabase mediante `pg_dump` o a través del menú *Database $\to$ Backups* de la consola en la nube.
- **Capas Espaciales:** Mantenga sincronizado el directorio `data/` del repositorio Git. El archivo `data/viviendas_respaldo.gpkg` conserva una copia binaria congelada de las entidades analíticas para restauración inmediata en caso de corrupción de archivos JSON.

#### B. Solución de Problemas Comunes (Troubleshooting)

1. **Error: "No se pudo importar GDAL/OGR en este entorno de Python"**
   - *Causa:* El intérprete de Python utilizado no tiene compilados los bindings de GDAL.
   - *Solución:* Ejecute el script usando el entorno de QGIS (`python-qgis.bat`) o instale GDAL en un entorno virtual conda:
     ```bash
     conda create -n sig python=3.11 gdal
     conda activate sig
     python geoprocesamiento_viviendas_colegios.py
     ```

2. **Error al guardar en Supabase en el panel de administración**
   - *Causa:* Sesión caducada o políticas RLS denegando la operación.
   - *Solución:* Cierre sesión y vuelva a ingresar. Verifique en el SQL Editor de Supabase que las políticas de `ALL` para usuarios autenticados se encuentren activas en `instituciones_educativas`.

3. **Las teselas vectoriales no cargan en el mapa localmente**
   - *Causa:* Servidor local bloqueando archivos `.pbf` por tipo MIME o restricciones de CORS.
   - *Solución:* Utilice `npx serve .` o un servidor HTTP que no filtre binarios. En producción, Vercel gestiona las extensiones `.pbf` de manera transparente.

4. **El trazado de rutas no funciona al presionar "Cómo llegar"**
   - *Causa:* Permisos de geolocalización denegados en el navegador o conexión no segura (HTTP en vez de HTTPS fuera de localhost).
   - *Solución:* Asegúrese de acceder mediante protocolo seguro `https://` y permitir el acceso a la ubicación geográfica en la configuración del navegador.

---
*Fin del Documento Técnico y Funcional Maestro.*

