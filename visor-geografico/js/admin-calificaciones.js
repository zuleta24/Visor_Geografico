/**
 * admin-calificaciones.js
 * ------------------------------------------------------------------
 * Ranking por calificación en el panel de administración.
 *
 * Agrega, entre los filtros y la tabla de instituciones, un panel con el mismo
 * Top 3 que ve el público en el Comparador:
 *   🏫 Top 3 Colegios      🎓 Top 3 Universidades
 * más el total de opiniones y el promedio general.
 *
 * Está ligado a las opiniones:
 *   - Cuando alguien califica desde el mapa, la base de datos recalcula el
 *     promedio de esa institución (trigger de calificaciones.sql).
 *   - Cuando el administrador elimina una opinión desde «💬 Reseñas», el
 *     promedio se corrige y este ranking (y el Top 3 del comparador) se
 *     actualizan solos.
 *
 * Datos: instituciones_educativas.calificacion y .num_opiniones.
 *
 * Uso: <script src="js/admin-calificaciones.js"></script> en
 * administracion.html (ya incluido en el archivo que se entrega).
 * Expone window.refrescarRankingCalificaciones() para actualizar a mano.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__adminCalificaciones) return;
  window.__adminCalificaciones = true;

  const TABLA = window.TABLA_INSTITUCIONES || 'instituciones_educativas';
  const PESO_PRIOR = 3;
  const MEDALLAS = ['🥇', '🥈', '🥉'];

  const tablaWrap = document.querySelector('.admin-table-wrap');
  if (!tablaWrap) {
    console.warn('[admin-calificaciones] No se encontró la tabla de instituciones; el ranking no se activó.');
    return;
  }

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nota = (n) => Number(n).toFixed(1).replace('.', ',');
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const esUniversidad = (tipo) => /^univ/i.test(String(tipo || ''));

  const estilos = document.createElement('style');
  estilos.textContent = `
    .adm-rank { margin: 0 0 20px; padding: 18px 20px; border-radius: 14px; border: 1px solid rgba(105, 181, 68, 0.35);
      background: linear-gradient(135deg, rgba(12, 100, 52, 0.35), rgba(18, 41, 27, 0.9)); }
    .adm-rank__cab { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .adm-rank__cab h3 { margin: 0; font-size: 15px; font-weight: 800; color: #fff; }
    .adm-rank__resumen { font-size: 12.5px; color: #a3bba8; }
    .adm-rank__resumen b { color: #f5c324; }
    .adm-rank__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .adm-rank__col { padding: 14px; border-radius: 12px; background: rgba(0, 0, 0, 0.22); border: 1px solid rgba(255, 255, 255, 0.08); }
    .adm-rank__col h4 { margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #fff; }
    .adm-rank__col ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .adm-rank__col li { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
    .adm-rank__col li .n { flex: 1; min-width: 0; color: #fff; font-weight: 600; }
    .adm-rank__col li em { font-style: normal; font-weight: 700; color: #f5c324; white-space: nowrap; }
    .adm-rank__col li small { color: #839d89; white-space: nowrap; }
    .adm-rank__vacio { margin: 0; font-size: 12.5px; color: #839d89; }
    .adm-rank__nota { margin: 12px 0 0; font-size: 11.5px; line-height: 1.5; color: #839d89; }
    .adm-nota { font-weight: 700; color: #f5c324; white-space: nowrap; }
    .adm-nota small { font-weight: 500; color: #839d89; }
    .adm-nota--nd { font-weight: 500; color: #839d89; }
    @media (max-width: 720px) { .adm-rank__grid { grid-template-columns: minmax(0, 1fr); } }
  `;
  document.head.appendChild(estilos);

  const panel = document.createElement('section');
  panel.className = 'adm-rank';
  panel.id = 'adm-ranking';
  panel.innerHTML =
    '<div class="adm-rank__cab"><h3>Ranking por calificación</h3><span class="adm-rank__resumen" id="adm-rank-resumen">Cargando…</span></div>' +
    '<div class="adm-rank__grid">' +
      '<div class="adm-rank__col"><h4>🏫 Top 3 Colegios</h4><ol id="adm-rank-colegios"></ol></div>' +
      '<div class="adm-rank__col"><h4>🎓 Top 3 Universidades</h4><ol id="adm-rank-universidades"></ol></div>' +
    '</div>' +
    '<p class="adm-rank__nota">Es el mismo Top 3 que ve el público en el Comparador. Si eliminas una opinión desde «💬 Reseñas», el promedio y el ranking se corrigen automáticamente.</p>';
  // Orden en pantalla: filtros → ranking (Top 3) → tabla.
  // Los filtros los crea otro script más abajo en la página, así que se vigila el contenedor
  // y, en cuanto aparecen, el ranking se coloca justo después de ellos.
  const contenedor = tablaWrap.parentNode;
  function ordenar() {
    const filtros = contenedor.querySelector('.admin-filtros');
    const destino = filtros ? filtros.nextSibling : tablaWrap;
    if (panel.parentNode !== contenedor || (filtros ? filtros.nextElementSibling !== panel : panel.nextElementSibling !== tablaWrap)) {
      contenedor.insertBefore(panel, destino);
    }
  }
  ordenar();
  new MutationObserver(ordenar).observe(contenedor, { childList: true });

  function ranking(filas) {
    const todas = filas.filter((d) => d.n > 0 && d.calificacion > 0);
    if (!todas.length) return [];
    const votos = todas.reduce((s, d) => s + d.n, 0);
    const media = todas.reduce((s, d) => s + d.calificacion * d.n, 0) / votos;
    todas.forEach((d) => { d.puntaje = (d.n / (d.n + PESO_PRIOR)) * d.calificacion + (PESO_PRIOR / (d.n + PESO_PRIOR)) * media; });
    return todas.sort((a, b) => b.puntaje - a.puntaje || b.n - a.n || b.calificacion - a.calificacion || a.nombre.localeCompare(b.nombre, 'es'));
  }

  function pintarLista(id, filas, etiqueta) {
    const ol = document.getElementById(id);
    const top = ranking(filas).slice(0, 3);
    if (!top.length) {
      ol.innerHTML = '<p class="adm-rank__vacio">Aún no hay ' + etiqueta + ' con calificaciones.</p>';
      return;
    }
    ol.innerHTML = top.map((d, i) =>
      '<li><span>' + MEDALLAS[i] + '</span><span class="n">' + esc(d.nombre) + '</span><em>★ ' + nota(d.calificacion) + '</em><small>' + plural(d.n, 'opinión', 'opiniones') + '</small></li>').join('');
  }

  function clienteSb() {
    if (window.supabaseClient) return window.supabaseClient;
    return (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
  }

  async function cargar() {
    const resumen = document.getElementById('adm-rank-resumen');
    const sb = clienteSb();
    if (!sb) { resumen.textContent = 'Sin conexión a la base de datos'; return; }
    const { data, error } = await sb.from(TABLA).select('id, nombre, tipo, calificacion, num_opiniones');
    if (error) {
      resumen.textContent = 'No se pudo leer el ranking. Ejecuta calificaciones.sql en Supabase.';
      console.warn('[admin-calificaciones]', error);
      return;
    }
    const filas = (data || []).map((r) => ({
      id: r.id, nombre: r.nombre || 'Sin nombre', tipo: r.tipo,
      calificacion: Number(r.calificacion) || 0, n: parseInt(r.num_opiniones, 10) || 0,
    }));
    const calificadas = filas.filter((d) => d.n > 0 && d.calificacion > 0);
    const totalOpiniones = calificadas.reduce((s, d) => s + d.n, 0);
    const general = totalOpiniones ? calificadas.reduce((s, d) => s + d.calificacion * d.n, 0) / totalOpiniones : 0;

    resumen.innerHTML = totalOpiniones
      ? '<b>' + totalOpiniones + '</b> ' + (totalOpiniones === 1 ? 'opinión' : 'opiniones') + ' en ' + plural(calificadas.length, 'institución', 'instituciones') + ' · promedio general <b>★ ' + nota(general) + '</b>'
      : 'Todavía no hay opiniones';

    pintarLista('adm-rank-colegios', filas.filter((d) => !esUniversidad(d.tipo)), 'colegios');
    pintarLista('adm-rank-universidades', filas.filter((d) => esUniversidad(d.tipo)), 'universidades');
  }

  // Se refresca cuando cambia la tabla de instituciones o la ventana de reseñas
  // (al cargar, editar, borrar una institución o eliminar una opinión).
  let espera;
  function programar() { clearTimeout(espera); espera = setTimeout(cargar, 700); }
  ['admin-tabla-body', 'modal-opiniones-tabla-body'].forEach((id) => {
    const nodo = document.getElementById(id);
    if (nodo) new MutationObserver(programar).observe(nodo, { childList: true });
  });
  window.refrescarRankingCalificaciones = () => { clearTimeout(espera); return cargar(); };

  cargar();
  setInterval(cargar, 30000);

  try {
    const sb = clienteSb();
    if (sb && typeof sb.channel === 'function') {
      sb.channel('admin-calificaciones')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, programar)
        .subscribe();
    }
  } catch (e) { /* sin Realtime queda el refresco cada 30 s */ }
})();