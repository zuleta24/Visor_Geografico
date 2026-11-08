/**
 * tiempo-real-instituciones.js
 * ------------------------------------------------------------------
 * Mantiene al día las instituciones del mapa (puntos, popups y ficha),
 * la tabla de administración, el directorio de informes y el comparador
 * cuando el administrador crea, edita o borra una institución, sin
 * recargar la página.
 *
 * Cómo funciona:
 *  1. Escucha los cambios de la tabla en Supabase Realtime (instantáneo).
 *  2. Como respaldo revisa la tabla cada 20 s (por si Realtime no está
 *     activado para la tabla) y solo redibuja si algo cambió.
 *  3. Al detectar un cambio vuelve a ejecutar initInstitucionesLayer()
 *     y sincroniza los módulos de informes, administración y comparador.
 *  4. Avisa con el evento «instituciones:actualizadas» en document.
 *
 * Expone window.refrescarInstituciones() para llamarlo manualmente.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__tiempoRealInstituciones) return;   // evita ejecutarse dos veces
  window.__tiempoRealInstituciones = true;

  const TABLA = window.TABLA_INSTITUCIONES || 'instituciones_educativas';
  const INTERVALO_MS = window.TIEMPO_REAL_INTERVALO_MS || 20000;

  let refrescando = false;
  let pendiente = false;
  let instantanea = null;        // texto de la tabla en la última revisión
  let temporizador = null;
  let canal = null;

  function cliente() {
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
  }

  function mapaActual() {
    if (typeof adminMap !== 'undefined' && adminMap) return adminMap;
    if (typeof map !== 'undefined' && map) return map;
    return null;
  }

  function grupoActual() {
    if (window.__grupoInstituciones) return window.__grupoInstituciones;
    if (typeof grupoInstituciones !== 'undefined') return grupoInstituciones;
    return undefined;
  }

  function clavesCategorias() {
    return (typeof CATEGORIAS_INSTITUCIONES !== 'undefined' ? CATEGORIAS_INSTITUCIONES : []);
  }

  /** ¿Este <li> de «Capas del mapa» pertenece a las instituciones? */
  function esItemDeInstituciones(li) {
    const casilla = li.querySelector('input[data-category]');
    const cats = clavesCategorias();
    if (casilla) return cats.some((c) => c.key === casilla.dataset.category);
    const nota = li.querySelector('.category-note');
    return Boolean(nota) && cats.some((c) => nota.textContent.indexOf(c.label) === 0);
  }

  // ----------------------------------------------------------------
  // Redibujar las instituciones en el mapa
  // ----------------------------------------------------------------
  async function redibujarMapa() {
    const mapa = mapaActual();
    if (!mapa || typeof initInstitucionesLayer !== 'function') return false;

    const lista = document.getElementById('category-list');

    // Estado actual de las casillas y de las capas que no son instituciones.
    const encendidas = {};
    document.querySelectorAll('input[data-category]').forEach((c) => { encendidas[c.dataset.category] = c.checked; });
    const itemsAjenos = lista
      ? Array.from(lista.children).filter((li) => !esItemDeInstituciones(li))
      : [];

    // Se quitan los puntos viejos del mapa.
    if (typeof institucionesLayers !== 'undefined') {
      Object.keys(institucionesLayers).forEach((key) => {
        const capa = institucionesLayers[key];
        if (capa && mapa.hasLayer(capa)) mapa.removeLayer(capa);
        delete institucionesLayers[key];
      });
    }
    const grupo = grupoActual();
    if (grupo && typeof grupo.clearLayers === 'function') grupo.clearLayers();

    // Se vuelven a dibujar con el mapa actual.
    await initInstitucionesLayer(mapa, grupo);

    // Se restauran las capas ajenas y el estado de las casillas.
    if (lista) itemsAjenos.forEach((li) => lista.appendChild(li));
    Object.entries(encendidas).forEach(([key, activa]) => {
      const casilla = document.querySelector(`input[data-category="${key}"]`);
      if (casilla && casilla.checked !== activa) {
        casilla.checked = activa;
        casilla.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    return true;
  }

  async function leerInstantanea() {
    const c = cliente();
    if (!c) return null;
    try {
      const { data, error } = await c.from(TABLA).select('*');
      if (error || !data) return null;
      return JSON.stringify(data);
    } catch (e) {
      return null;
    }
  }

  // ----------------------------------------------------------------
  // Sincronización global (Mapa + Administración + Informe + Comparador)
  // ----------------------------------------------------------------
  async function refrescar(origen) {
    if (refrescando) { pendiente = true; return; }
    refrescando = true;
    try {
      // 1. Redibujar mapa si está disponible
      await redibujarMapa();

      // 2. Refrescar listado/directorio del modal de informes si existe
      if (typeof window.cargarDatosInforme === 'function') {
        await window.cargarDatosInforme();
      }

      // 3. Refrescar la tabla de administración si estamos en administracion.html
      if (typeof window.cargarInstituciones === 'function') {
        await window.cargarInstituciones();
      }

      // 4. Refrescar el selector y gráficos de barras del comparador si está cargado
      if (typeof window.cargarOpcionesComparador === 'function') {
        await window.cargarOpcionesComparador();
      }

      instantanea = await leerInstantanea();
      document.dispatchEvent(new CustomEvent('instituciones:actualizadas', { detail: { origen: origen || 'remoto' } }));
    } catch (error) {
      console.warn('[tiempo-real] No se pudieron sincronizar los componentes de instituciones:', error);
    } finally {
      refrescando = false;
      if (pendiente) { pendiente = false; refrescar(origen); }
    }
  }

  // Varios cambios seguidos (p. ej. importar muchas filas) se agrupan en un solo refresco.
  function programar(origen, espera) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => refrescar(origen), espera === undefined ? 500 : espera);
  }

  window.refrescarInstituciones = function (origen) {
    programar(origen || 'local', 0);
  };

  // ----------------------------------------------------------------
  // Realtime de Supabase
  // ----------------------------------------------------------------
  function suscribir() {
    const c = cliente();
    if (!c || typeof c.channel !== 'function') return;
    try {
      canal = c.channel(`tiempo-real-${TABLA}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, () => programar('remoto'))
        .subscribe();
    } catch (error) {
      console.warn('[tiempo-real] No se pudo abrir el canal Realtime; queda la revisión periódica.', error);
    }
  }

  // ----------------------------------------------------------------
  // Respaldo: revisión periódica de la tabla
  // ----------------------------------------------------------------
  async function revisar() {
    if (document.hidden || refrescando) return;
    const actual = await leerInstantanea();
    if (actual === null) return;
    if (instantanea === null) { instantanea = actual; return; }
    if (actual !== instantanea) programar('remoto', 0);
  }

  // Se espera a que las instituciones se inicien por primera vez.
  (function esperarInicio(intentos) {
    const listo = (typeof institucionesLayers !== 'undefined' && Object.keys(institucionesLayers).length > 0) ||
                  (typeof window.cargarInstituciones === 'function');

    if (listo) {
      leerInstantanea().then((texto) => { instantanea = texto; });
      suscribir();
      setInterval(revisar, INTERVALO_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
      return;
    }
    if (intentos < 240) setTimeout(() => esperarInicio(intentos + 1), 500);
  })(0);
})();