/**
 * vias.js
 * ------------------------------------------------------------------
 * Carga la red vial de Sabaneta desde Supabase y la dibuja como líneas
 * en el mapa Leaflet.
 *
 * Las vías se añaden al grupo "grupoVias" para que el control de capas
 * principal de Leaflet permita mostrarlas u ocultarlas.
 * ------------------------------------------------------------------
 */

// Capa GeoJSON principal de vías
let viasLayer = null;

/**
 * Construye el contenido del popup que se muestra al hacer clic
 * sobre una vía.
 */
function popupVia(props) {
  const tipo = props.highway || "Vía sin clasificar";

  return `
    <div class="institucion-popup">
      <strong>Vía de Sabaneta</strong><br>
      <span>Tipo de vía: ${tipo}</span>
    </div>
  `;
}

/**
 * Trae todas las filas de una tabla/vista de Supabase.
 * Supabase suele limitar las respuestas a 1.000 filas, por lo que
 * se hacen consultas por páginas hasta obtener todos los registros.
 */
async function fetchAllRows(tableName, pageSize = 1000) {
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from(tableName)
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows = allRows.concat(data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

/**
 * Agrega el interruptor de vías al listado de categorías del panel.
 */
function renderViasToggle(cantidad) {
  const list = document.getElementById("category-list");

  if (!list) {
    return;
  }

  const li = document.createElement("li");

  li.className = "category-item";

  li.innerHTML = `
    <label class="category-toggle">
      <input
        type="checkbox"
        id="toggle-vias-sabaneta"
        ${cantidad > 0 ? "checked" : "disabled"}
      />

      <span
        class="category-swatch"
        style="background:#94a3b8"
      ></span>

      <span class="category-toggle__label">
        Vías de Sabaneta
      </span>

      <span class="category-count">
        ${cantidad}
      </span>
    </label>
  `;

  list.appendChild(li);
}

/**
 * Inicializa la capa vial.
 *
 * @param {L.Map} map - Instancia principal de Leaflet.
 * @param {L.LayerGroup} grupoVias - Grupo usado por el control de capas.
 */
async function initViasLayer(map, grupoVias) {
  if (!supabaseClient) {
    console.warn(
      "Supabase no está configurado; no se pueden cargar las vías."
    );

    renderViasToggle(0);
    return;
  }

  let data;

  try {
    data = await fetchAllRows("calles_sabaneta_geojson");
  } catch (error) {
    console.error(
      "Error cargando calles_sabaneta_geojson:",
      error
    );

    renderViasToggle(0);
    return;
  }

  if (!data || data.length === 0) {
    console.warn(
      "La tabla calles_sabaneta_geojson no devolvió filas."
    );

    renderViasToggle(0);
    return;
  }

  /*
   * Convierte cada fila de Supabase en una entidad GeoJSON.
   * Se descartan las filas que no tengan geometría.
   */
  const features = data
    .filter((row) => row.geojson)
    .map((row) => {
      let geometry;

      try {
        geometry = JSON.parse(row.geojson);
      } catch (error) {
        console.warn(
          "Se ignoró una vía porque su GeoJSON no es válido:",
          row
        );

        return null;
      }

      return {
        type: "Feature",
        properties: {
          highway: row.highway || "Sin clasificar"
        },
        geometry
      };
    })
    .filter(Boolean);

  /*
   * Se crea una capa GeoJSON con todas las vías.
   * El estilo puede variar según la clasificación de OpenStreetMap.
   */
  viasLayer = L.geoJSON(
    {
      type: "FeatureCollection",
      features
    },
    {
      style: (feature) => {
        const tipo = feature.properties?.highway || "";

        let color = "#94a3b8";
        let weight = 1.5;
        let opacity = 0.8;

        if (tipo === "primary") {
          color = "#f97316";
          weight = 4;
        } else if (tipo === "secondary") {
          color = "#eab308";
          weight = 3;
        } else if (tipo === "tertiary") {
          color = "#60a5fa";
          weight = 2.5;
        } else if (tipo === "residential") {
          color = "#94a3b8";
          weight = 1.5;
        }

        return {
          color,
          weight,
          opacity
        };
      },

      onEachFeature: (feature, layer) => {
        layer.bindPopup(popupVia(feature.properties));
      }
    }
  );

  /*
   * Cambio principal:
   * Antes: viasLayer.addTo(map);
   * Ahora: se añade al grupo controlado por Leaflet.
   */
  viasLayer.addTo(grupoVias);

  /*
   * Añade el grupo principal de vías al mapa.
   * Luego Leaflet podrá activar o desactivar el grupo completo
   * desde el selector situado en la esquina superior derecha.
   */
  grupoVias.addTo(map);

  // Agregar checkbox en el panel lateral
  renderViasToggle(features.length);

  const toggleVias = document.getElementById(
    "toggle-vias-sabaneta"
  );

  if (toggleVias) {
    toggleVias.addEventListener("change", (event) => {
      if (event.target.checked) {
        grupoVias.addLayer(viasLayer);
      } else {
        grupoVias.removeLayer(viasLayer);
      }
    });
  }
}