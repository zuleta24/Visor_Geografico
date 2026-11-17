# MANUAL DE ADMINISTRADOR
## Visor Geográfico de Sabaneta · Mantenimiento, Infraestructura y Control del Sistema

**Autores:** Jacobo Flórez · Sebastián Zuleta · Ana Sofía Sáenz  
**Entidad / Territorio:** Municipio de Sabaneta, Antioquia, Colombia  
**Acceso a la Consola:** [https://visorgeografico.vercel.app/administracion.html](https://visorgeografico.vercel.app/administracion.html)  
**Versión del Manual:** 2.5 (Actualizada a Noviembre 2026)

---

## ÍNDICE DEL MANUAL DE ADMINISTRADOR

1. [INTRODUCCIÓN Y PERFILES DE ADMINISTRACIÓN](#1-introducción-y-perfiles-de-administración)
2. [ACCESO SEGURO Y AUTENTICACIÓN (SUPABASE AUTH)](#2-acceso-seguro-y-autenticación-supabase-auth)
3. [DESCRIPCIÓN DE LA CONSOLA ADMINISTRATIVA](#3-descripción-de-la-consola-administrativa)
4. [GESTIÓN DEL DIRECTORIO DE INSTITUCIONES EDUCATIVAS (CRUD)](#4-gestión-del-directorio-de-instituciones-educativas-crud)
   - 4.1. Alta de Nuevas Instituciones
   - 4.2. Asistente Cartográfico de Ubicación y Geocodificador Nominatim
   - 4.3. Modificación y Actualización de Atributos
   - 4.4. Eliminación Segura de Registros
5. [MODERACIÓN DE OPINIONES Y RANKING BAYESIANO](#5-moderación-de-opiniones-y-ranking-bayesiano)
   - 5.1. Consulta y Eliminación de Reseñas
   - 5.2. Panel de Ranking por Calificación (Top 3 Colegios y Universidades)
6. [MAPA ESPEJO Y CONTROL DE CAPAS BASE](#6-mapa-espejo-y-control-de-capas-base)
7. [IMPORTACIÓN Y NORMALIZACIÓN DE CAPAS CARTOGRÁFICAS (GEOJSON / SHP ZIP)](#7-importación-y-normalización-de-capas-cartográficas-geojson--shp-zip)
8. [SINCRONIZACIÓN EN TIEMPO REAL (WEBSOCKETS Y POLLING)](#8-sincronización-en-tiempo-real-websockets-y-polling)
9. [ADMINISTRACIÓN DE LA BASE DE DATOS Y SEGURIDAD (SUPABASE / POSTGRESQL)](#9-administración-de-la-base-de-datos-y-seguridad-supabase--postgresql)
   - 9.1. Esquema Relacional de Tablas (DDL)
   - 9.2. Políticas de Seguridad por Fila (Row Level Security - RLS)
   - 9.3. Gestión de Usuarios y Credenciales
10. [EJECUCIÓN DEL PIPELINE DE GEOPROCESAMIENTO ESPACIAL (GDAL/OGR)](#10-ejecución-del-pipeline-de-geoprocesamiento-espacial-gdalogr)
11. [POLÍTICAS DE RESPALDO Y RECUPERACIÓN](#11-políticas-de-respaldo-y-recuperación)
12. [DIAGNÓSTICO Y SOLUCIÓN DE PROBLEMAS (TROUBLESHOOTING)](#12-diagnóstico-y-solución-de-problemas-troubleshooting)

---

## 1. INTRODUCCIÓN Y PERFILES DE ADMINISTRACIÓN

Este manual proporciona las instrucciones para el equipo técnico, administradores del sistema y personal de la Alcaldía de Sabaneta responsables de:
- Mantener actualizado el directorio oficial de instituciones educativas, cupos y personal docente.
- Moderar las opiniones y valoraciones comunitarias registradas por los ciudadanos.
- Cargar y reproyectar nuevas capas vectoriales (límites, equipamientos, vías).
- Ejecutar el pipeline de geoprocesamiento para recalcular las zonas de influencia escolar (buffers de 150m, 300m y 500m) y regenerar las teselas vectoriales (*Vector Tiles*).
- Gestionar la seguridad, permisos RLS y respaldos en la base de datos PostgreSQL alojada en Supabase.

---

## 2. ACCESO SEGURO Y AUTENTICACIÓN (SUPABASE AUTH)

El acceso al panel administrativo está restringido mediante autenticación basada en correo electrónico y contraseña gestionada por **Supabase Auth**, emitiendo tokens criptográficos JSON Web Tokens (JWT).

### Procedimiento de Ingreso:
1. Ingrese a la ruta: `https://visorgeografico.vercel.app/administracion.html` (o pulse el enlace **"Administración"** en el menú de navegación).
2. Si no cuenta con una sesión activa, el sistema mostrará la pantalla de **Acceso Administrativo**:

```
┌────────────────────────────────────────────────────────┐
│               ACCESO ADMINISTRATIVO                    │
│   Ingresa con tu cuenta para gestionar las capas       │
│   y las instituciones educativas del municipio.        │
│                                                        │
│   Correo Electrónico:  [ admin@sabaneta.gov.co       ] │
│   Contraseña:          [ **************************  ] │
│                                                        │
│                    [ INGRESAR ]                        │
└────────────────────────────────────────────────────────┘
```

3. Digite sus credenciales autorizadas y presione **"Ingresar"**.
4. Una vez validado el token, el formulario de inicio de sesión se ocultará automáticamente y se habilitará la consola de administración.
5. **Cierre de Sesión:** En la esquina superior derecha, pulse el botón **"Cerrar sesión"**. Aparecerá un cuadro modal de confirmación (*"¿Cerrar sesión?"*) para evitar desconexiones accidentales. Al confirmar, el token se revocará y el sistema retornará al formulario de autenticación.

---

## 3. DESCRIPCIÓN DE LA CONSOLA ADMINISTRATIVA

Una vez autenticado, la consola presenta una distribución en dos zonas operativas:

1. **Zona Superior (Directorio y Moderación):**
   - **Barra de Herramientas:** Botón `+ Nueva institución`, contador general y botón de cierre de sesión.
   - **Buscador y Filtros de Tabla:** Permite filtrar instantáneamente por texto libre, tipo de institución, sector y estrato socioeconómico.
   - **Panel de Ranking por Calificación:** Muestra el Top 3 de Colegios y Universidades calculado con ponderación bayesiana.
   - **Tabla Maestra de Instituciones:** Listado tabular con columnas de nombre, tipo, sector, dirección, estrato, calificación ciudadana y botones de acción rápida (*Editar*, *Reseñas*, *Eliminar*).

2. **Zona Inferior (Mapa Espejo y Gestor de Capas):**
   - **Mapa de Verificación:** Canvas de Leaflet sincronizado con el visor público para verificar la posición exacta de las entidades en tiempo real.
   - **Telemetría y Selector de CRS:** Muestra las coordenadas del cursor en WGS84, MAGNA-SIRGAS, Origen Nacional CTM12 o UTM.
   - **Caja de Importación de Capas:** Área de arrastre (*drag & drop*) para cargar nuevos archivos GeoJSON o Shapefiles zipeados (`.zip`).
   - **Lista de Capas Importadas:** Control para encender, apagar o eliminar capas dinámicas.

---

## 4. GESTIÓN DEL DIRECTORIO DE INSTITUCIONES EDUCATIVAS (CRUD)

### 4.1. Alta de Nuevas Instituciones
1. Pulse el botón esmeralda **"+ Nueva institución"** en la barra superior.
2. Se abrirá la ventana modal con el formulario estructurado en 4 bloques:

#### Bloque 1: Datos Básicos
- **Nombre (\*):** Nombre oficial completo de la institución (ej. *Institución Educativa José Félix de Restrepo*).
- **Tipo (\*):** Desplegable con opciones `Colegio` o `Universidad`.
- **Sector (\*):** Desplegable con opciones `Público` o `Privado`.
- **Estrato:** Número entero del 1 al 6 según la estratificación socioeconómica del sector.

#### Bloque 2: Ubicación Geográfica
- **Dirección:** Nomenclatura urbana (ej. *Carrera 45 # 75 Sur - 25*).
- **Longitud y Latitud (WGS84):** Valores en grados decimales (ej. Longitud `-75.6165`, Latitud `6.1515`). Estos campos se llenan automáticamente al usar el asistente cartográfico.

#### Bloque 3: Contacto e Imagen
- **Teléfono:** Línea de atención telefónica fija o móvil.
- **Sitio Web:** URL completa del portal institucional (`https://...`).
- **Horario:** Jornadas y horarios de atención (ej. *Lunes a Viernes, 7:00 AM - 3:00 PM*).
- **URL de la Imagen:** Enlace directo a una fotografía de la fachada institucional en formato JPG o PNG.
- **Descripción:** Reseña pedagógica o características generales de la sede.

#### Bloque 4: Indicadores Académicos
- **Número de estudiantes:** Matrícula activa actual.
- **Cupos disponibles:** Plazas libres disponibles para nuevas inscripciones.
- **Recursos tecnológicos:** Equipos informáticos o aulas digitales disponibles.
- **Número de docentes:** Total de profesores en planta.

3. Pulse **"Guardar"**. El registro se insertará en la tabla `instituciones_educativas` de Supabase y aparecerá reflejado en el mapa y la tabla sin recargar la página.

### 4.2. Asistente Cartográfico de Ubicación y Geocodificador Nominatim
Dentro del bloque de *Ubicación* del formulario se encuentra un **mini-mapa interactivo**:
- **Geocodificación Automática:** Escriba la dirección en el campo correspondiente y pulse el botón **"Buscar dirección"**. El sistema consultará el servicio OpenStreetMap Nominatim y centrará el mapa en la ubicación aproximada.
- **Fijación por Clic:** Puede hacer clic en cualquier parte del mapa para colocar el marcador.
- **Ajuste Fino por Arrastre:** Mantenga presionado el marcador rojo y arrástrelo hasta la entrada exacta del plantel. Al soltarlo, los campos *Latitud* y *Longitud* se actualizarán al milisegundo.
- **Validación Territorial:** Si las coordenadas quedan fuera de la delimitación de Sabaneta, el sistema desplegará un mensaje de alerta en amarillo para prevenir errores de digitación (como inversión entre latitud y longitud).

### 4.3. Modificación y Actualización de Atributos
1. Localice la institución en la tabla administrativa (puede usar la barra de búsqueda rápida para encontrarla en segundos).
2. Haga clic en el botón **"Editar"** ubicado en la columna de acciones.
3. El formulario se precargará con todos los valores existentes y el mini-mapa situará el marcador en sus coordenadas actuales.
4. Efectúe las modificaciones requeridas y pulse **"Guardar"**.

### 4.4. Eliminación Segura de Registros
1. En la fila de la institución a retirar, haga clic en el botón rojo **"Eliminar"**.
2. Para evitar pérdidas accidentales, el sistema desplegará un modal de confirmación con el nombre exacto de la institución.
3. Al confirmar, el registro se eliminará físicamente de la base de datos central y se removerá de todas las capas activas.

---

## 5. MODERACIÓN DE OPINIONES Y RANKING BAYESIANO

### 5.1. Consulta y Eliminación de Reseñas
Los ciudadanos pueden enviar calificaciones y comentarios desde el mapa público. Para fiscalizar y moderar este contenido:
1. En la tabla de instituciones, pulse el botón **"💬 Reseñas"** de la fila correspondiente.
2. Se abrirá el modal **"Reseñas de la institución"** con la lista cronológica de opiniones recibidas:
   - Calificación en estrellas (1 a 5).
   - Comentario u opinión de texto libre.
   - Fecha y hora exacta de registro.
3. Si un comentario infringe normas de convivencia, contiene spam o lenguaje indebido, pulse el botón **"Eliminar"**.
4. La base de datos eliminará la reseña y recalculará automáticamente la calificación promedio y el contador de opiniones de la institución.

### 5.2. Panel de Ranking por Calificación (Top 3 Colegios y Universidades)
En la parte superior de la tabla administrativa se muestra el **Ranking por Calificación**:
- Clasifica las mejores 3 instituciones de cada categoría (Colegios y Universidades) con medallas (🥇, 🥈, 🥉).
- **Fórmula de Ponderación Bayesiana:** Para evitar que una institución con una sola calificación de 5 estrellas supere a una con decenas de votos excelentes, el sistema aplica la fórmula de media prioritaria ponderada:

$$\text{Puntaje} = \left(\frac{N}{N + P}\right) \cdot C + \left(\frac{P}{N + P}\right) \cdot M$$

Donde $N$ es el total de opiniones del plantel, $P = 3$ es el peso base inicial, $C$ es su promedio particular y $M$ es el promedio general de todas las instituciones de Sabaneta.

---

## 6. MAPA ESPEJO Y CONTROL DE CAPAS BASE

En la sección inferior de la pantalla de administración se incluye una réplica completa del geovisor:
- Permite al administrador verificar cómo visualizan los usuarios los cambios realizados en tiempo real.
- Dispone del selector de mapas base (estándar, claro, oscuro, topográfico).
- Permite alternar el sistema de coordenadas (`EPSG:4326`, `EPSG:9377`, `EPSG:3116`, etc.) para verificar la consistencia métrica de las coordenadas capturadas.

---

## 7. IMPORTACIÓN Y NORMALIZACIÓN DE CAPAS CARTOGRÁFICAS (GEOJSON / SHP ZIP)

El administrador puede incorporar capas vectoriales al vuelo sin necesidad de editar código fuente:

1. Ubique la sección **"Importar capa"** en la columna derecha.
2. Arrastre sobre el recuadro punteado (o haga clic para seleccionar) cualquiera de los siguientes formatos:
   - Archivos GeoJSON estándar (`.geojson` o `.json`).
   - Archivos Shapefile de ESRI comprimidos en un solo archivo `.zip` (que debe contener obligatoriamente los archivos `.shp`, `.dbf` y `.prj`).
3. **Detección Automática de Proyección (CRS):**
   - El sistema analiza la cabecera geométrica o el contenido WKT del archivo `.prj`.
   - Si detecta parámetros de Origen Nacional (`EPSG:9377`), Bogotá (`EPSG:3116`), UTM o WGS84, lo notificará en el panel inferior:  
     *«Sistema detectado: MAGNA-SIRGAS 2018 / Origen Nacional (EPSG:9377)»*.
4. **Confirmación del Administrador:**
   - Revise la sugerencia. Si la proyección sugerida es correcta, pulse **"Confirmar y añadir capa"**.
   - Si el archivo utiliza otro sistema, selecciónelo manualmente en la lista desplegable antes de confirmar.
5. El sistema reproyectará automáticamente las geometrías a WGS84 con `proj4js`, dibujará la capa sobre el mapa y registrará su metadata en la tabla `layers` de Supabase.

---

## 8. SINCRONIZACIÓN EN TIEMPO REAL (WEBSOCKETS Y POLLING)

El visor cuenta con una arquitectura de sincronización doble implementada en `js/tiempo-real-instituciones.js`:
1. **Canal WebSocket Reactivo (Supabase Realtime):** Escucha eventos de inserción, actualización y borrado (`INSERT`, `UPDATE`, `DELETE`) en la tabla `instituciones_educativas`. Cuando cualquier administrador realiza un cambio, el mapa del usuario final se refresca instantáneamente sin recargar la página.
2. **Mecanismo de Respaldo por Sondeo (Polling):** Cada 20 segundos el sistema realiza una comprobación ligera en segundo plano; si detecta modificaciones no notificadas por el canal WebSocket, sincroniza el estado de las capas automáticamente.

---

## 9. ADMINISTRACIÓN DE LA BASE DE DATOS Y SEGURIDAD (SUPABASE / POSTGRESQL)

### 9.1. Esquema Relacional de Tablas (DDL)
Ejecute las siguientes sentencias en el **SQL Editor** de la consola de Supabase para aprovisionar la base de datos:

```sql
-- 1. TABLA DE CAPAS VECTORIALES
CREATE TABLE IF NOT EXISTS layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  epsg_code TEXT NOT NULL,
  file_url TEXT,
  geojson_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABLA MAESTRA DE INSTITUCIONES EDUCATIVAS
CREATE TABLE IF NOT EXISTS instituciones_educativas (
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

-- 3. TABLA DE OPINIONES Y RESEÑAS CIUDADANAS
CREATE TABLE IF NOT EXISTS opiniones (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  institucion_id BIGINT REFERENCES instituciones_educativas(id) ON DELETE CASCADE,
  calificacion INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentario TEXT,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLA DE MALLA VIAL DE SABANETA
CREATE TABLE IF NOT EXISTS vias_sabaneta (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre TEXT,
  highway TEXT,
  surface TEXT,
  oneway TEXT,
  maxspeed TEXT,
  lanes TEXT,
  geojson_data JSONB
);
```

### 9.2. Políticas de Seguridad por Fila (Row Level Security - RLS)
Para blindar el sistema frente a accesos no autorizados, aplique las siguientes directivas RLS:

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE instituciones_educativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE opiniones ENABLE ROW LEVEL SECURITY;
ALTER TABLE vias_sabaneta ENABLE ROW LEVEL SECURITY;

-- Políticas para lectura pública (cualquier usuario sin autenticar)
CREATE POLICY "Lectura pública layers" ON layers FOR SELECT USING (true);
CREATE POLICY "Lectura pública instituciones" ON instituciones_educativas FOR SELECT USING (true);
CREATE POLICY "Lectura pública opiniones" ON opiniones FOR SELECT USING (true);
CREATE POLICY "Lectura pública vias" ON vias_sabaneta FOR SELECT USING (true);

-- Política para inserción ciudadana de opiniones
CREATE POLICY "Inserción pública de opiniones" ON opiniones FOR INSERT WITH CHECK (true);

-- Políticas de control administrativo exclusivo (solo usuarios autenticados con JWT)
CREATE POLICY "Admin total instituciones" ON instituciones_educativas 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin total opiniones" ON opiniones 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin total layers" ON layers 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### 9.3. Gestión de Usuarios y Credenciales
- Para añadir o revocar administradores, ingrese a la consola de Supabase $\to$ **Authentication** $\to$ **Users**.
- Pulse **"Add user"** e introduzca el correo institucional y la contraseña provisional.
- Se recomienda exigir contraseñas de al menos 12 caracteres alfanuméricos y cambiar las claves por defecto antes del paso a producción.

---

## 10. EJECUCIÓN DEL PIPELINE DE GEOPROCESAMIENTO ESPACIAL (GDAL/OGR)

Cuando se incorporen nuevos desarrollos habitacionales o se modifiquen sedes escolares, se debe regenerar el modelo de análisis espacial de proximidad.

### Método 1: Ejecución con Un Solo Clic (Windows)
En la carpeta raíz de `visor-geografico/`, haga doble clic sobre:
```text
ejecutar_geoproceso.bat
```
El script buscará automáticamente las instalaciones de Python vinculadas a QGIS Desktop o entornos Conda y ejecutará la secuencia.

### Método 2: Ejecución por Consola de Comandos
```bash
# Opción A: Mediante el wrapper de resiliencia
python script_gdal.py

# Opción B: Ejecutando directamente el pipeline principal
python geoprocesamiento_viviendas_colegios.py
```

### Productos Generados por el Pipeline:
1. `data/viviendas_priorizadas_colegios.geojson`: Predios residenciales con atributos de distancia euclidiana exacta en metros, colegio asignado y nivel de prioridad.
2. `data/buffers_colegios.geojson`: Polígonos de amortiguamiento euclidiano con radios exactos de 150m, 300m y 500m.
3. `data/viviendas_analisis.gpkg`: Archivo estándar OGC GeoPackage que agrupa en formato SQLite binario las capas de viviendas, buffers e instituciones.
4. `tiles/viviendas_priorizadas/{z}/{x}/{y}.pbf`: Teselas vectoriales Mapbox Vector Tiles compiladas para los niveles de zoom del 10 al 17, garantizando que el visor cargue miles de predios sin degradar el rendimiento del navegador.

---

## 11. POLÍTICAS DE RESPALDO Y RECUPERACIÓN

1. **Base de Datos Relacional:**
   - Supabase genera respaldos diarios automáticos (*Daily Backups*).
   - Para un volcado manual inmediato antes de migraciones mayores, utilice la utilidad `pg_dump`:
     ```bash
     pg_dump -h db.bfmklcrfpwvrilvbyzhv.supabase.co -U postgres -d postgres -F c -b -v -f "respaldo_sabaneta_$(date +%Y%m%d).dump"
     ```
2. **Capas Cartográficas y Respaldo Local:**
   - La carpeta `data/` del proyecto conserva copias en formato GeoJSON de las capas maestras.
   - El archivo binario `data/viviendas_respaldo.gpkg` almacena una instantánea congelada del análisis espacial, permitiendo restaurar las relaciones de proximidad de inmediato en caso de falla en los archivos de texto.

---

## 12. DIAGNÓSTICO Y SOLUCIÓN DE PROBLEMAS (TROUBLESHOOTING)

| Síntoma / Error | Causa Probable | Solución Paso a Paso |
| :--- | :--- | :--- |
| **"Error al guardar en Supabase"** en el panel administrativo. | Sesión caducada o políticas RLS denegando permisos. | Cierre sesión y vuelva a ingresar. Si el problema persiste, verifique en el SQL Editor de Supabase que las políticas para `authenticated` existan y no hayan sido eliminadas. |
| **"No se pudo importar GDAL/OGR en este entorno"**. | El comando `python` invocado pertenece a una instalación básica sin la librería `osgeo`. | Ejecute el proceso usando la consola de OSGeo4W / QGIS (`python-qgis.bat`) o active el entorno Conda correspondiente (`conda activate sig`). |
| **Las teselas vectoriales (.pbf) no cargan en servidor local.** | El servidor web local no reconoce el tipo MIME de los archivos `.pbf` o bloquea carpetas con formato numérico. | Utilice `npx serve .` en lugar de servidores básicos antiguos. En el despliegue de Vercel las teselas funcionan automáticamente sin configuración extra. |
| **El mapa de administración aparece gris o incompleto.** | Contenedor inicializado antes de que el modal fuera visible. | El sistema incluye `adminMap.invalidateSize()`. Si persiste, maximice la ventana del navegador o recargue con `Ctrl + F5`. |
| **Las opiniones de los usuarios no actualizan el promedio.** | Falta el trigger de base de datos o fallo en la transacción. | Abra la consola administrativa, ingrese a la institución en cuestión y modere las opiniones para forzar el recálculo automático. |

