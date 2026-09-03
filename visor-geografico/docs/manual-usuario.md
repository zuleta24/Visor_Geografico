# Manual de usuario

## 1. Cargar una capa

1. En el panel lateral, sección **"1 · Cargar capa"**, haz clic en
   "Seleccionar archivo…" y elige un archivo `.geojson` o `.json`.
2. El visor intentará detectar automáticamente su sistema de
   coordenadas y te mostrará la sugerencia en la sección
   **"2 · Sistema detectado"**.
3. Revisa la sugerencia: si es correcta, déjala; si no, elígela
   manualmente en el desplegable.
4. Haz clic en **"Confirmar y añadir capa"**. La capa aparecerá en
   el mapa y en la lista de "Capas cargadas".

## 2. Cambiar el sistema en que se muestran las coordenadas

1. En la sección **"3 · Mostrar coordenadas en"**, elige el sistema
   que quieras (WGS84, MAGNA-SIRGAS, Bogotá, Origen Nacional, UTM).
2. Nota que el sistema actualmente activo **no aparece en la lista**
   — no tendría sentido "cambiar" a un sistema en el que ya se está.
3. Mueve el cursor sobre el mapa: el panel **"Lectura del cursor"**
   se actualiza en vivo con las coordenadas del punto exacto donde
   está el mouse, convertidas al sistema elegido.

## 3. Interpretar la lectura

- Si el sistema elegido es **geográfico** (WGS84, MAGNA-SIRGAS), verás
  `LAT` / `LON` en grados decimales.
- Si el sistema elegido es **proyectado** (Bogotá, Origen Nacional,
  UTM), verás `NORTE (Y)` / `ESTE (X)` en metros.

En ambos casos el punto físico en el mapa es el mismo — solo cambia
la forma en la que se expresa esa posición.

## 4. Gestionar las capas cargadas

En la lista **"Capas cargadas"**, cada capa tiene dos botones a la derecha:

- **● / ○** — muestra u oculta la capa en el mapa sin quitarla de la lista
  (útil para comparar capas sin perder el trabajo de detección de CRS ya hecho).
- **×** — quita la capa por completo, tanto del mapa como de la lista.
