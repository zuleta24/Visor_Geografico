/**
 * admin-ubicacion.js
 * ------------------------------------------------------------------
 * Selector de ubicación en el mapa para el formulario de instituciones
 * (panel de administración).
 *
 * Añade, dentro del grupo "Ubicación" del modal, un mini-mapa donde el
 * administrador puede:
 *   - hacer clic para fijar la ubicación,
 *   - arrastrar el marcador para afinarla,
 *   - escribir la dirección y pulsar «Buscar dirección» (OpenStreetMap
 *     Nominatim) para ubicarla de forma aproximada.
 *
 * Los campos Longitud y Latitud (WGS84) se llenan solos, y si se
 * escriben a mano el marcador se mueve. Avisa si el punto queda fuera
 * de Sabaneta (por ejemplo, si se invirtieron latitud y longitud).
 *
 * Es independiente del resto de la página: usa los ids del formulario
 * (#admin-modal, #f-latitud, #f-longitud, #f-direccion) y Leaflet.
 *
 * Uso: <script src="js/admin-ubicacion.js"></script> antes de </body>,
 * DESPUÉS de cargar Leaflet.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  const modal = document.getElementById('admin-modal');
  const inLat = document.getElementById('f-latitud');
  const inLng = document.getElementById('f-longitud');
  const inDir = document.getElementById('f-direccion');

  if (!modal || !inLat || !inLng || typeof L === 'undefined') {
    console.warn('[admin-ubicacion] Faltan el formulario o Leaflet; el selector de ubicación no se activó.');
    return;
  }

  const fieldset = inLat.closest('fieldset') || inLat.parentElement;

  const CENTRO_SABANETA = [6.1515, -75.6165];
  const ZOOM_INICIAL = 14;
  const ZOOM_PUNTO = 17;
  // Caja generosa alrededor del municipio, solo para avisar de errores evidentes.
  const LIMITES = L.latLngBounds([6.10, -75.70], [6.20, -75.55]);

  // ----------------------------------------------------------------
  // Estilos
  // ----------------------------------------------------------------
  const estilos = document.createElement('style');
  estilos.textContent = `
    .ubicacion-picker {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }
    .ubicacion-picker__barra {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .ubicacion-picker__titulo {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--text-secondary, #8ea0ba);
    }
    .ubicacion-picker__buscar {
      height: 32px;
      padding: 0 12px;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent, #29e2b8);
      background: transparent;
      border: 1px solid rgba(41, 226, 184, .45);
      border-radius: 8px;
      cursor: pointer;
      transition: background .15s ease;
    }
    .ubicacion-picker__buscar:hover:not(:disabled) { background: rgba(41, 226, 184, .1); }
    .ubicacion-picker__buscar:disabled { opacity: .5; cursor: default; }

    #ubicacion-mapa {
      position: relative;
      z-index: 0;
      isolation: isolate;
      width: 100%;
      height: 260px;
      border-radius: 10px;
      border: 1px solid var(--border-subtle, #1e293b);
      cursor: crosshair;
    }
    .ubicacion-picker__ayuda {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-secondary, #8ea0ba);
    }
    .ubicacion-picker__ayuda--ok { color: var(--accent, #29e2b8); }
    .ubicacion-picker__ayuda--aviso { color: #f59e0b; }

    .ubicacion-pin {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--accent, #29e2b8);
      border: 3px solid #fff;
      box-shadow: 0 0 0 2px rgba(11, 18, 32, .55), 0 3px 8px rgba(0, 0, 0, .55);
      cursor: grab;
    }
  `;
  document.head.appendChild(estilos);

  // ----------------------------------------------------------------
  // Estructura (dentro del grupo «Ubicación»)
  // ----------------------------------------------------------------
  const bloque = document.createElement('div');
  bloque.className = 'ubicacion-picker admin-field--ancho';
  bloque.innerHTML = `
    <div class="ubicacion-picker__barra">
      <span class="ubicacion-picker__titulo">Ubicación en el mapa</span>
      <button type="button" class="ubicacion-picker__buscar" id="ubicacion-buscar">Buscar dirección</button>
    </div>
    <div id="ubicacion-mapa" role="application" aria-label="Mapa para elegir la ubicación"></div>
    <p class="ubicacion-picker__ayuda" id="ubicacion-ayuda"></p>
  `;
  fieldset.appendChild(bloque);

  const $mapa = bloque.querySelector('#ubicacion-mapa');
  const $ayuda = bloque.querySelector('#ubicacion-ayuda');
  const $buscar = bloque.querySelector('#ubicacion-buscar');

  const AYUDA_BASE = 'Haz clic en el mapa o arrastra el marcador. Longitud y latitud se llenan solas (WGS84).';

  function ayuda(texto, tipo) {
    $ayuda.textContent = texto;
    $ayuda.className = 'ubicacion-picker__ayuda' + (tipo ? ` ubicacion-picker__ayuda--${tipo}` : '');
  }

  // ----------------------------------------------------------------
  // Mapa y marcador (se crean al abrir el modal por primera vez)
  // ----------------------------------------------------------------
  let mapa = null;
  let marcador = null;

  function crearMapa() {
    mapa = L.map($mapa, { zoomControl: true }).setView(CENTRO_SABANETA, ZOOM_INICIAL);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }).addTo(mapa);

    mapa.on('click', (e) => fijarPunto(e.latlng.lat, e.latlng.lng, { escribir: true }));
  }

  function leerCoordenadas() {
    const lat = parseFloat(inLat.value);
    const lng = parseFloat(inLng.value);
    const valido = Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return valido ? { lat, lng } : null;
  }

  function escribirCampos(lat, lng) {
    inLat.value = lat.toFixed(6);
    inLng.value = lng.toFixed(6);
    // Por si otro código escucha cambios en los campos.
    inLat.dispatchEvent(new Event('input', { bubbles: true }));
    inLng.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function evaluarAyuda(lat, lng) {
    if (LIMITES.contains([lat, lng])) {
      ayuda(`Ubicación fijada: ${lat.toFixed(6)}, ${lng.toFixed(6)}. Puedes arrastrar el marcador para afinarla.`, 'ok');
    } else {
      ayuda('Ojo: este punto queda fuera de Sabaneta. Revisa que latitud y longitud no estén invertidas.', 'aviso');
    }
  }

  function fijarPunto(lat, lng, { escribir = false, centrar = false } = {}) {
    const latlng = L.latLng(lat, lng);

    if (!marcador) {
      marcador = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({ className: '', html: '<div class="ubicacion-pin"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
        keyboard: false,
      }).addTo(mapa);

      marcador.on('dragend', () => {
        const p = marcador.getLatLng();
        escribirCampos(p.lat, p.lng);
        evaluarAyuda(p.lat, p.lng);
      });
    } else {
      marcador.setLatLng(latlng);
    }

    if (escribir) escribirCampos(lat, lng);
    if (centrar) mapa.setView(latlng, Math.max(mapa.getZoom(), ZOOM_PUNTO));
    evaluarAyuda(lat, lng);
  }

  function quitarPunto() {
    if (marcador) {
      marcador.remove();
      marcador = null;
    }
  }

  /** Lleva el mapa al estado de los campos del formulario. */
  function sincronizarDesdeCampos({ centrar = false } = {}) {
    if (!mapa) return;
    const c = leerCoordenadas();
    if (c) {
      fijarPunto(c.lat, c.lng, { centrar });
    } else {
      quitarPunto();
      ayuda(AYUDA_BASE);
      if (centrar) mapa.setView(CENTRO_SABANETA, ZOOM_INICIAL);
    }
  }

  // Si se escriben las coordenadas a mano, el marcador las sigue.
  [inLat, inLng].forEach((campo) => {
    campo.addEventListener('change', () => sincronizarDesdeCampos({ centrar: true }));
  });

  // ----------------------------------------------------------------
  // Abrir el modal -> crear / refrescar el mapa
  // ----------------------------------------------------------------
  function alAbrirModal() {
    if (!mapa) crearMapa();
    sincronizarDesdeCampos({ centrar: true });
    // El contenedor estaba oculto: Leaflet necesita recalcular su tamaño.
    setTimeout(() => {
      mapa.invalidateSize();
      sincronizarDesdeCampos({ centrar: true });
    }, 120);
  }

  let estabaAbierto = modal.classList.contains('institucion-modal--open');
  new MutationObserver(() => {
    const abierto = modal.classList.contains('institucion-modal--open');
    if (abierto && !estabaAbierto) alAbrirModal();
    estabaAbierto = abierto;
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });

  if (estabaAbierto) alAbrirModal();

  // ----------------------------------------------------------------
  // Buscar dirección (OpenStreetMap Nominatim)
  // ----------------------------------------------------------------
  $buscar.addEventListener('click', async () => {
    const direccion = (inDir && inDir.value || '').trim();
    if (!direccion) {
      ayuda('Escribe primero la dirección en el campo «Dirección».', 'aviso');
      return;
    }

    const consulta = /sabaneta/i.test(direccion) ? direccion : `${direccion}, Sabaneta, Antioquia`;
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=co'
      + '&viewbox=-75.70,6.20,-75.55,6.10&accept-language=es&q=' + encodeURIComponent(consulta);

    $buscar.disabled = true;
    $buscar.textContent = 'Buscando…';
    ayuda('Buscando la dirección…');

    try {
      const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const resultados = await respuesta.json();

      if (!resultados.length) {
        ayuda('No se encontró esa dirección. Ubícala haciendo clic en el mapa.', 'aviso');
        return;
      }

      const lat = parseFloat(resultados[0].lat);
      const lng = parseFloat(resultados[0].lon);
      fijarPunto(lat, lng, { escribir: true, centrar: true });
      ayuda('Ubicación aproximada encontrada. Arrastra el marcador si necesitas afinarla.', 'ok');
    } catch (error) {
      console.warn('[admin-ubicacion] Falló la búsqueda de dirección:', error);
      ayuda('No se pudo buscar la dirección ahora. Ubícala haciendo clic en el mapa.', 'aviso');
    } finally {
      $buscar.disabled = false;
      $buscar.textContent = 'Buscar dirección';
    }
  });

  ayuda(AYUDA_BASE);
})();