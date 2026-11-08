/**
 * js/admin.js
 * ------------------------------------------------------------------
 * Carga de instituciones y opiniones en el panel administrativo.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  function obtenerCliente() {
    if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) return window.supabaseClient;
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    return null;
  }

  async function cargarOpinionesAdmin() {
    const $tbody = document.getElementById('tabla-opiniones-admin');
    if (!$tbody) return;

    const client = obtenerCliente();
    if (!client) return;

    try {
      const { data, error } = await client
        .from('opiniones')
        .select('id, calificacion, comentario, fecha, instituciones_educativas(nombre)')
        .order('fecha', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        $tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:#a3bba8;">No existen opiniones registradas aún.</td></tr>';
        return;
      }

      $tbody.innerHTML = data.map(op => {
        const nombreInst = op.instituciones_educativas ? op.instituciones_educativas.nombre : 'Institución N/A';
        const estrellas = '★'.repeat(op.calificacion) + '☆'.repeat(5 - op.calificacion);
        const fechaFmt = new Date(op.fecha).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `
          <tr>
            <td style="font-weight:600; color:#fff;">${String(nombreInst)}</td>
            <td style="text-align:center; color:#f5c324; font-size:14px;">${estrellas} (${op.calificacion})</td>
            <td style="color:#eef5ea; max-width:320px;">${op.comentario ? String(op.comentario) : '<em>Sin comentario escrito</em>'}</td>
            <td style="font-size:12px; color:#a3bba8;">${fechaFmt}</td>
            <td style="text-align:center;">
              <button type="button" class="btn-act btn-act--del" onclick="window.eliminarOpinionAdmin(${op.id})">
                Eliminar
              </button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('[admin] Error al cargar opiniones:', err);
      $tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error de lectura de opiniones.</td></tr>';
    }
  }

  window.eliminarOpinionAdmin = async function (id) {
    if (!confirm('¿Deseas eliminar permanentemente esta opinión?')) return;

    const client = obtenerCliente();
    if (!client) return;

    try {
      const { error } = await client.from('opiniones').delete().eq('id', id);
      if (error) throw error;
      cargarOpinionesAdmin();
    } catch (err) {
      alert('Error al eliminar la opinión.');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    cargarOpinionesAdmin();

    const $btn = document.getElementById('btn-refresh-opiniones');
    if ($btn) $btn.addEventListener('click', cargarOpinionesAdmin);
  });
})();