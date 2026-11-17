# MANUAL DE USUARIO
## Visor Geográfico de Sabaneta · Sistemas de Información Geográfica (SIG)

**Autores:** Jacobo Flórez · Sebastián Zuleta · Ana Sofía Sáenz  
**Entidad / Territorio:** Municipio de Sabaneta, Antioquia, Colombia  
**Acceso Web:** [https://visorgeografico.vercel.app](https://visorgeografico.vercel.app)  
**Versión del Manual:** 2.5 (Actualizada a Noviembre 2026)

---

## ÍNDICE DEL MANUAL DE USUARIO

1. [INTRODUCCIÓN Y PROPÓSITO](#1-introducción-y-propósito)
2. [REQUISITOS DEL SISTEMA Y CÓMO INGRESAR](#2-requisitos-del-sistema-y-cómo-ingresar)
3. [DESCRIPCIÓN GENERAL DE LA INTERFAZ](#3-descripción-general-de-la-interfaz)
4. [MAPA BASE Y NAVEGACIÓN CARTOGRÁFICA](#4-mapa-base-y-navegación-cartográfica)
5. [PANEL LATERAL: GESTIÓN DE CAPAS Y COORDENADAS](#5-panel-lateral-gestión-de-capas-y-coordenadas)
   - 5.1. Control de Capas Temáticas
   - 5.2. Selector y Lectura de Sistemas de Coordenadas en Vivo
   - 5.3. Buscador Predictivo y Filtros de Instituciones
6. [DIRECTORIO INSTITUCIONAL Y EXPORTACIÓN DE INFORMES (PDF / EXCEL)](#6-directorio-institucional-y-exportación-de-informes-pdf--excel)
7. [FICHA DETALLADA, ENRUTAMIENTO Y CALIFICACIONES CIUDADANAS](#7-ficha-detallada-enrutamiento-y-calificaciones-ciudadanas)
8. [COMPARADOR DE INSTITUCIONES Y OFERTA DE BECAS](#8-comparador-de-instituciones-y-oferta-de-becas)
9. [VIVIENDAS PRIORIZADAS Y ZONAS DE INFLUENCIA ESCOLAR](#9-viviendas-priorizadas-y-zonas-de-influencia-escolar)
10. [CAJA DE HERRAMIENTAS: MEDICIÓN Y MI UBICACIÓN GPS](#10-caja-de-herramientas-medición-y-mi-ubicación-gps)
11. [MÓDULO DE ANÁLISIS DE COBERTURA Y SIMULACIÓN TERRITORIAL](#11-módulo-de-análisis-de-cobertura-y-simulación-territorial)
12. [SECCIÓN DE AYUDA, PREGUNTAS FRECUENTES Y CONTACTO](#12-sección-de-ayuda-preguntas-frecuentes-y-contacto)

---

## 1. INTRODUCCIÓN Y PROPÓSITO

El **Visor Geográfico de Sabaneta** es una aplicación web interactiva diseñada para que cualquier ciudadano, padre de familia, estudiante, docente o investigador explore la infraestructura educativa, la red de movilidad y las características residenciales del municipio de Sabaneta.

El sistema le permite:
- Ubicar colegios oficiales, colegios privados y universidades sobre un mapa dinámico.
- Consultar indicadores académicos: cupos libres, estudiantes matriculados, número de docentes y recursos informáticos.
- Trazar rutas guiadas a pie o en vehículo desde su ubicación actual hasta cualquier institución.
- Comparar de 2 a 6 instituciones simultáneamente con histogramas interactivos y revisar las convocatorias de becas municipales.
- Descargar informes oficiales en formatos PDF y Excel.
- Calificar el servicio educativo de las instituciones y compartir opiniones públicas.
- Conocer la distancia real en metros entre las viviendas de Sabaneta y los colegios más cercanos (niveles de prioridad y zonas de influencia de 150 m, 300 m y 500 m).
- Convertir coordenadas en vivo a sistemas geodésicos oficiales de Colombia (WGS84, MAGNA-SIRGAS, Origen Nacional CTM12, UTM).

---

## 2. REQUISITOS DEL SISTEMA Y CÓMO INGRESAR

### Requisitos Técnicos
- **Dispositivo:** Computador de escritorio, portátil, tableta o teléfono inteligente.
- **Navegador Web:** Google Chrome, Mozilla Firefox, Microsoft Edge, Safari o cualquier navegador web moderno con soporte para JavaScript.
- **Conexión a Internet:** Conexión de banda ancha o datos móviles (se recomienda una velocidad mínima de 2 Mbps).
- **Permisos Opcionales:** Acceso a la geolocalización del dispositivo (requerido para las funciones "Mi Ubicación" y "Cómo llegar").

### Acceso a la Aplicación
1. Abra su navegador web habitual.
2. Ingrese la dirección: `https://visorgeografico.vercel.app`
3. Al ingresar, visualizará la **Pantalla de Bienvenida (Landing Screen)**.
4. Haga clic sobre el botón esmeralda **"Abrir el geovisor"** para cargar el mapa interactivo.

---

## 3. DESCRIPCIÓN GENERAL DE LA INTERFAZ

La interfaz del sistema está distribuida en áreas ergonómicas pensadas para evitar la fatiga visual mediante una paleta de tonos oscuros (*Dark Theme*):

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Geovisor Sabaneta   [Inicio]  [Instituciones]  [Comparador & Becas]  [FAQ] │
├─────────────────────────┬────────────────────────────────────────────────────────┤
│ PANEL LATERAL (Sidebar) │ MAPA PRINCIPAL (Lienzo Cartográfico Leaflet)           │
│ ┌─────────────────────┐ │                                                        │
│ │ 🔍 Buscar Colegio   │ │ [Herramientas de Medición]    [Selector de Mapas Base] │
│ ├─────────────────────┤ │ [Mi Ubicación GPS]                                     │
│ │ 📂 Capas del Mapa   │ │                                                        │
│ ├─────────────────────┤ │       📍 Marcador Institución                          │
│ │ 🌐 Sistema de Coord │ │                                                        │
│ ├─────────────────────┤ │                                                        │
│ │ 🎯 Lectura Cursor   │ │                                                        │
│ └─────────────────────┘ │ [Escala Métrica]                    [Controles Zoom]   │
├─────────────────────────┴────────────────────────────────────────────────────────┤
│ SECCIÓN INFERIOR: Preguntas Frecuentes, Trámites Municipales y Pie de Página     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

1. **Barra de Navegación Superior (Top Navbar):** Permite saltar entre el mapa principal, el directorio general de instituciones, el comparador de becas, las preguntas frecuentes y el acceso administrativo.
2. **Panel Lateral (Sidebar):** Contiene el buscador predictivo, las casillas para encender/apagar capas temáticas, el selector de sistemas de coordenadas y la lectura de posición en vivo.
3. **Lienzo Cartográfico:** Muestra el territorio de Sabaneta con sus vías, colegios, universidades, límites y predios residenciales.
4. **Controles Flotantes:** Botón para colapsar/expandir el panel lateral, botones de medición, botón de ubicación GPS y menú de mapas base.

---

## 4. MAPA BASE Y NAVEGACIÓN CARTOGRÁFICA

### Navegación
- **Desplazamiento (Pan):** Mantenga presionado el botón izquierdo del ratón (o deslice un dedo en pantallas táctiles) y arrastre el mapa en cualquier dirección.
- **Acercar / Alejar (Zoom):** Use la rueda del ratón o pulse los botones `+` y `−` situados en la esquina inferior derecha.
- **Expandir Área de Mapa:** Pulse el botón **"Ocultar panel"** para ocultar la barra lateral y ver el mapa a pantalla completa. Para restaurar el panel, vuelva a hacer clic en **"Mostrar panel"**.

### Selección de Mapas Base
En la esquina superior derecha del mapa, sitúe el cursor sobre el ícono de capas para alternar entre cuatro estilos:
1. **OpenStreetMap Estándar:** Vista cartográfica urbana tradicional con nombres de calles y puntos de interés.
2. **OpenStreetMap Claro (CartoDB Positron):** Mapa minimalista en escala de grises, ideal para resaltar colores temáticos.
3. **OpenStreetMap Oscuro (CartoDB Dark Matter):** Fondo nocturno de alto contraste, ideal para una visualización sin deslumbramiento.
4. **OpenStreetMap Topográfico (OpenTopoMap):** Representa el relieve del terreno, curvas de nivel y orografía montañosa de Sabaneta.

---

## 5. PANEL LATERAL: GESTIÓN DE CAPAS Y COORDENADAS

### 5.1. Control de Capas Temáticas
En la sección **"Capas del mapa"**, active o desactive las casillas de verificación para visualizar u ocultar entidades:
- **Colegios públicos** (Marcador azul brillante): Instituciones oficiales administradas por el municipio.
- **Colegios privados** (Marcador naranja): Instituciones de carácter particular.
- **Universidades privadas** (Marcador morado): Sedes de educación superior.
- **Colegios OSM (consulta básica)** (Marcador amarillo): Datos adicionales de OpenStreetMap.
- **Red vial de Sabaneta** (Líneas esmeralda/rojas): Más de mil tramos viales del municipio con información de calzada y velocidad.
- **Límite municipal** (Polígono esmeralda discontinuo): Contorno territorial oficial de Sabaneta.
- **Viviendas priorizadas por cercanía:** Muestra los predios residenciales clasificados por su proximidad a colegios.
- **Zonas de influencia escolar:** Muestra los polígonos concéntricos de 150 m, 300 m y 500 m alrededor de los planteles.

### 5.2. Selector y Lectura de Sistemas de Coordenadas en Vivo
En la sección **"Sistema de coordenadas"**:
1. Despliegue la lista de sistemas cartográficos disponibles:
   - `WGS84 (Geográfico) — EPSG:4326`: Estándar satelital GPS universal (Latitud / Longitud en grados decimales).
   - `MAGNA-SIRGAS (Geográfico) — EPSG:4686`: Datum geocéntrico oficial de Colombia.
   - `MAGNA-SIRGAS 2018 / Origen Nacional (CTM12) — EPSG:9377`: Sistema de proyección único oficial en Colombia desde 2020. Expresa posiciones en **Norte (Y)** y **Este (X)** en metros.
   - `MAGNA-SIRGAS / Bogotá — EPSG:3116`: Sistema proyectado tradicional (pre-2020).
   - `WGS84 / UTM zona 18N — EPSG:32618`: Proyección transversal conforme en metros para la zona central de Colombia.
2. Seleccione el sistema deseado.
3. Desplace el ratón sobre cualquier parte del mapa: el bloque **"Lectura del cursor"** se actualizará instantáneamente mostrando las coordenadas del puntero en el sistema elegido.

### 5.3. Buscador Predictivo y Filtros de Instituciones
En la parte superior de la barra lateral se ubica el buscador:
1. **Búsqueda por Texto:** Escriba parte del nombre o de la dirección de la institución (ej. *"José Félix"*, *"Cra 45"*, *"Alcázares"*).
2. **Filtros Combinados:**
   - **Tipo:** Todos, Colegios o Universidades.
   - **Sector:** Todos, Público o Privado.
   - **Estrato:** Seleccione un estrato de 1 a 6 o deje "Todos".
3. A medida que escribe o cambia los filtros, la lista de resultados se actualizará y los marcadores no coincidentes desaparecerán del mapa.
4. Haga clic sobre cualquier institución de la lista de resultados: el mapa **volará suavemente** (*flyTo*) hacia la ubicación, activará un destello visual sobre el marcador y desplegará su ficha de detalle.

---

## 6. DIRECTORIO INSTITUCIONAL Y EXPORTACIÓN DE INFORMES (PDF / EXCEL)

En la barra de navegación superior, haga clic en el botón **"Instituciones"**. Se abrirá una ventana modal de pantalla completa con el **Directorio e Informe General de Instituciones Educativas**.

### Características de la Ventana:
- **Tabla Completa:** Lista detallada de todas las instituciones con: Nombre, Tipo, Sector, Estrato, Dirección, Número de Estudiantes, Cupos Disponibles, Docentes y Canales de Contacto.
- **Exportar a PDF:** Al hacer clic en el botón rojo/rosado **"Exportar a PDF"**, el sistema genera y descarga automáticamente un documento en orientación horizontal con encabezado municipal, colores corporativos y paginación formal.
- **Exportar a Excel:** Al hacer clic en el botón verde **"Exportar a Excel"**, se descargará un archivo `.xlsx` estructurado listo para ser manipulado en Microsoft Excel o Google Sheets.
- **Cierre:** Para regresar al mapa, pulse la `×` superior derecha o haga clic fuera del panel.

---

## 7. FICHA DETALLADA, ENRUTAMIENTO Y CALIFICACIONES CIUDADANAS

Al hacer clic sobre cualquier marcador de institución en el mapa, se abrirá la **Ficha Técnica**:

### Información Visible:
1. **Cabecera:** Fotografía de la fachada, nombre institucional, etiqueta de tipo/sector y estrato socioeconómico.
2. **Calificación Ciudadana:** Muestra las estrellas doradas y el promedio cuantitativo (ej. `★ 4.8 (12 opiniones)`).
3. **Datos de Contacto:** Dirección normalizada, teléfono fijo/móvil, horario de atención y enlace a la página web.
4. **Indicadores de Gestión:** Cantidad de estudiantes matriculados, cupos escolares disponibles, número de profesores y dotación de equipos tecnológicos.

### Acciones Disponibles:
- **Trazar Ruta ("Cómo llegar"):**
  1. Haga clic en el botón verde **"Cómo llegar (Ruta)"**.
  2. Si el navegador le solicita permiso de ubicación, pulse **"Permitir"**.
  3. El sistema calculará y dibujará la ruta óptima por las vías de Sabaneta desde su posición hasta el colegio.
  4. En la parte inferior de la pantalla aparecerá un botón rojo flotante **"❌ Quitar ruta"** para limpiar el trazado cuando lo desee.
- **Calificar la Institución:**
  1. Haga clic sobre el enlace **"Escribir una opinión"** o sobre las estrellas.
  2. Se abrirá una ventana emergente donde podrá pulsar de 1 a 5 estrellas y, opcionalmente, escribir un comentario sobre la atención o la calidad educativa.
  3. Presione **"Enviar calificación"**. El promedio se actualizará de inmediato en la base de datos central.

---

## 8. COMPARADOR DE INSTITUCIONES Y OFERTA DE BECAS

En la barra superior, seleccione la opción **"Comparador & Becas"** (o navegue a `comparador.html`). Esta página especializada permite evaluar planteles lado a lado y consultar apoyos económicos.

### Cómo Usar el Comparador:
1. **Buscar y Seleccionar:** En la barra izquierda, use el buscador o los filtros para localizar planteles. Marque la casilla de las instituciones que desea contrastar (mínimo 2 y máximo 6).
2. **Chips de Selección:** En la parte inferior izquierda verá las etiquetas de las instituciones seleccionadas. Puede eliminar alguna pulsando la `×` del chip.
3. **Análisis de Gráficos Comparativos:**
   En el panel central se desplegarán histogramas de barras organizados en 4 secciones colapsables:
   - **Estrato:** Compara la ubicación socioeconómica de cada sede.
   - **Cupos disponibles:** Muestra gráficamente qué colegio tiene mayor capacidad de recepción de nuevos alumnos.
   - **Docentes:** Compara el tamaño de la planta de profesores.
   - **Estudiantes:** Compara la población estudiantil total.
   La institución con el valor más alto se resalta con texto en color esmeralda.

### Directorio Municipal de Becas y Convenios:
En la misma página, explore la sección de **Becas Municipales**:
- Cada tarjeta describe el nombre del programa, el público beneficiario, la cobertura de matrícula y los requisitos exigidos por la Alcaldía de Sabaneta.

---

## 9. VIVIENDAS PRIORIZADAS Y ZONAS DE INFLUENCIA ESCOLAR

El visor incluye un modelo de geoprocesamiento que vincula cada predio residencial con las instituciones educativas más cercanas.

### Activación y Filtros de Viviendas:
1. En el panel lateral, marque la casilla **"Viviendas priorizadas"**.
2. Aparecerá un control flotante en la pantalla con cuatro categorías de prioridad:
   - 🔴 **Alta Prioridad ($\le 150\text{ m}$):** Predios a menos de dos cuadras de un colegio.
   - 🟡 **Media Prioridad ($151\text{ m} - 300\text{ m}$):** Predios a distancia intermedia caminable.
   - 🟢 **Baja Prioridad ($301\text{ m} - 500\text{ m}$):** Predios en el límite del área de influencia.
   - ⚪ **Sin Prioridad ($> 500\text{ m}$):** Viviendas que experimentan déficit de proximidad escolar.
3. Desmarque cualquiera de las casillas para aislar un grupo específico.
4. Haga clic sobre cualquier punto de vivienda para abrir su ficha: verá el código de predio, barrio, nombre del colegio más cercano, distancia euclidiana exacta en metros y área estimada en metros cuadrados ($m^2$).

### Zonas de Influencia (Buffers):
Active la casilla **"Zonas de influencia escolar"** para visualizar anillos concéntricos poligonales de 150 m, 300 m y 500 m alrededor de cada colegio, lo que permite apreciar la mancha de cobertura del servicio educativo en el territorio.

---

## 10. CAJA DE HERRAMIENTAS: MEDICIÓN Y MI UBICACIÓN GPS

En la barra de herramientas flotante sobre el mapa encontrará herramientas avanzadas:

### 10.1. Mi Ubicación GPS
- Haga clic en el ícono de mira telescópica / satélite.
- El sistema solicitará permisos de ubicación. Al aceptarlos, se colocará un marcador pulsante con un círculo amarillo que representa el radio de precisión de su GPS.
- La herramienta afina la lectura de forma continua durante unos segundos hasta obtener la mejor precisión disponible.
- Al pulsar el marcador verá su latitud, longitud y margen de error en metros.

### 10.2. Capturar Coordenadas
- Pulse el ícono de puntero/chincheta.
- Cada clic que realice sobre el mapa fijará un punto numerado (Punto 1, Punto 2...) indicando sus coordenadas en el sistema activo.
- Podrá copiar las coordenadas al portapapeles o descargar la lista completa de puntos en formato CSV.

### 10.3. Medir Distancia
- Pulse el ícono de regla.
- Haga clics sucesivos trazando el camino que desea medir.
- El mapa mostrará la distancia de cada tramo y la suma total acumulada (en metros o kilómetros).
- Presione `Enter` para fijar la medición o `Escape` para cancelar.

### 10.4. Medir Área
- Pulse el ícono de polígono.
- Haga clic delimitando los vértices de una manzana, parque o lote.
- El sistema calculará automáticamente el área total en metros cuadrados ($m^2$), hectáreas ($\text{ha}$) o kilómetros cuadrados ($km^2$), además de su perímetro.

---

## 11. MÓDULO DE ANÁLISIS DE COBERTURA Y SIMULACIÓN TERRITORIAL

Esta herramienta permite responder preguntas como: *«¿Qué porcentaje de viviendas de Sabaneta tienen un colegio a menos de 800 metros?»*

### Pasos para el Análisis:
1. Abra el panel de cobertura desde la barra de herramientas del mapa.
2. Ajuste el **Radio de Cobertura Deseado** desplazando la barra (de 300 metros a 3 kilómetros).
3. Seleccione qué tipos de instituciones desea incluir (públicas, privadas, universidades).
4. El visor calculará en tiempo real:
   - Porcentaje de viviendas cubiertas frente a desatendidas.
   - Porcentaje de superficie del municipio con cobertura.
   - Mapa de calor de zonas críticas (conglomerados residenciales sin cobertura).
5. **Simulación de Nuevas Sedes:**
   - Puede pulsar *"Sugerir mejor ubicación"* para que el sistema identifique automáticamente la zona más desatendida.
   - O haga clic manualmente sobre el mapa para colocar una sede educativa hipotética: el visor calculará cuántas viviendas saldrían del déficit de cobertura y cuánto aumentaría el porcentaje municipal.
6. Permite descargar la relación de viviendas sin cobertura en formato GeoJSON o CSV.

---

## 12. SECCIÓN DE AYUDA, PREGUNTAS FRECUENTES Y CONTACTO

En la parte inferior de la página principal encontrará la sección **"Preguntas frecuentes"**:
- **Buscador de Trámites:** Escriba palabras clave como *"cupos"*, *"traslado"*, *"becas"* o *"discapacidad"*.
- **Filtros Rápidos:** Botones temáticos para acceder de inmediato a respuestas sobre cupos, estrato o enlaces al portal oficial **Mi Cuenta Sabaneta** (`micuenta.sabaneta.gov.co`).
- **Formulario de Contacto:** Al final de la página se proporciona información de contacto con las dependencias municipales y un botón para volver rápidamente al inicio del mapa.

