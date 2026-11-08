/**
 * informes.js
 * ------------------------------------------------------------------
 * Carga el directorio completo de instituciones educativas desde Supabase
 * y gestiona la exportación de informes a PDF y Excel.
 * ------------------------------------------------------------------
 */

let datosInforme = [];

/**
 * Obtiene la referencia al cliente de Supabase sin importar cómo esté declarado.
 */
function obtenerClienteSupabase() {
  if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) {
    return window.supabaseClient;
  }
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    return supabaseClient;
  }
  return null;
}

/**
 * Carga los datos completos desde Supabase y los renderiza en el modal.
 */
async function cargarDatosInforme() {
  const container = document.getElementById('informe-tabla-body');
  if (!container) return;

  const client = obtenerClienteSupabase();

  if (!client) {
    container.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#ef4444; padding:24px;">Error: Supabase no está cargado o configurado (revisa js/supabaseClient.js).</td></tr>';
    return;
  }

  container.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 24px; color: #94a3b8;">Cargando instituciones...</td></tr>';

  try {
    const { data, error } = await client
      .from('instituciones_educativas')
      .select('*')
      .order('nombre');

    if (error) {
      console.error('[informes] Error al consultar Supabase:', error);
      container.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444; padding:24px;">Error al cargar información: ${error.message}</td></tr>`;
      return;
    }

    datosInforme = data || [];

    if (datosInforme.length === 0) {
      container.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 24px; color: #94a3b8;">No se encontraron instituciones registradas en la base de datos.</td></tr>';
      return;
    }

    container.innerHTML = datosInforme.map(inst => {
      const tipoClass = (inst.tipo || 'colegio').toLowerCase();
      const sectorClass = (inst.sector || 'publico').toLowerCase();
      
      const tipoTag = `<span class="informe-tag informe-tag--${tipoClass}">${inst.tipo || 'N/D'}</span>`;
      const sectorTag = `<span class="informe-tag informe-tag--${sectorClass}">${inst.sector || 'N/D'}</span>`;
      const estrato = inst.estrato ? `Estrato ${inst.estrato}` : 'N/D';
      
      const contacto = (inst.telefono || inst.sitio_web)
        ? `${inst.telefono ? inst.telefono : ''} ${inst.sitio_web ? `<br/><a href="${inst.sitio_web}" target="_blank" rel="noopener noreferrer" style="color:#29e2b8; font-size:11px;">Web</a>` : ''}`
        : 'Sin contacto';

      return `
        <tr>
          <td style="font-weight:600; color:#ffffff;">${inst.nombre || 'Sin nombre'}</td>
          <td>${tipoTag}</td>
          <td>${sectorTag}</td>
          <td>${estrato}</td>
          <td style="color:#cbd5e1;">${inst.direccion || 'Sin dirección'}</td>
          <td class="informe-num">${inst.num_estudiantes ?? '—'}</td>
          <td class="informe-num">${inst.cupos_disponibles ?? '—'}</td>
          <td class="informe-num">${inst.num_docentes ?? '—'}</td>
          <td style="font-size:12px;">${contacto}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('[informes] Excepción inesperada:', err);
    container.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444; padding:24px;">Excepción inesperada: ${err.message}</td></tr>`;
  }
}

/**
 * Genera y descarga el archivo PDF formateado y organizado con jsPDF + AutoTable.
 */
function exportarAPDF() {
  if (!datosInforme || !datosInforme.length) {
    alert('No hay información disponible para exportar.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a4');

  // Encabezado del documento PDF
  doc.setFillColor(18, 24, 36);
  doc.rect(0, 0, 297, 24, 'F');

  doc.setFontSize(16);
  doc.setTextColor(41, 226, 184);
  doc.setFont('helvetica', 'bold');
  doc.text("DIRECTORIO E INFORME GENERAL DE INSTITUCIONES EDUCATIVAS", 14, 12);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.text(`Municipio de Sabaneta · Generado el: ${new Date().toLocaleDateString('es-CO')} ${new Date().toLocaleTimeString('es-CO')}`, 14, 19);

  // Columnas para la tabla del PDF
  const columnas = [
    { header: 'Institución', dataKey: 'nombre' },
    { header: 'Tipo', dataKey: 'tipo' },
    { header: 'Sector', dataKey: 'sector' },
    { header: 'Estrato', dataKey: 'estrato' },
    { header: 'Dirección', dataKey: 'direccion' },
    { header: 'Estudiantes', dataKey: 'num_estudiantes' },
    { header: 'Cupos', dataKey: 'cupos_disponibles' },
    { header: 'Docentes', dataKey: 'num_docentes' },
    { header: 'Teléfono', dataKey: 'telefono' }
  ];

  // Mapeo de datos para la tabla
  const filas = datosInforme.map(inst => ({
    nombre: inst.nombre || 'N/D',
    tipo: inst.tipo ? inst.tipo.toUpperCase() : 'N/D',
    sector: inst.sector ? inst.sector.toUpperCase() : 'N/D',
    estrato: inst.estrato ? `Estrato ${inst.estrato}` : 'N/D',
    direccion: inst.direccion || 'Sin dirección',
    num_estudiantes: inst.num_estudiantes != null ? String(inst.num_estudiantes) : 'N/D',
    cupos_disponibles: inst.cupos_disponibles != null ? String(inst.cupos_disponibles) : 'N/D',
    num_docentes: inst.num_docentes != null ? String(inst.num_docentes) : 'N/D',
    telefono: inst.telefono || 'Sin teléfono'
  }));

  doc.autoTable({
    columns: columnas,
    body: filas,
    startY: 28,
    margin: { left: 14, right: 14, top: 28, bottom: 15 },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      font: 'helvetica',
      textColor: [30, 41, 59]
    },
    headStyles: {
      fillColor: [41, 226, 184],
      textColor: [11, 18, 32],
      fontStyle: 'bold',
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      nombre: { cellWidth: 55, fontStyle: 'bold' },
      tipo: { cellWidth: 25 },
      sector: { cellWidth: 22 },
      estrato: { cellWidth: 22 },
      direccion: { cellWidth: 55 },
      num_estudiantes: { cellWidth: 22, halign: 'center' },
      cupos_disponibles: { cellWidth: 20, halign: 'center' },
      num_docentes: { cellWidth: 20, halign: 'center' },
      telefono: { cellWidth: 28 }
    },
    didDrawPage: (data) => {
      const str = `Página ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 8);
    }
  });

  doc.save(`Informe_Instituciones_Educativas_Sabaneta.pdf`);
}

/**
 * Exportación a Excel (.xlsx)
 */
function exportarAExcel() {
  if (!datosInforme || !datosInforme.length) {
    alert('No hay información disponible para exportar.');
    return;
  }

  const filas = datosInforme.map(inst => ({
    'Nombre de la Institución': inst.nombre || 'N/D',
    'Tipo': inst.tipo || 'N/D',
    'Sector': inst.sector || 'N/D',
    'Estrato': inst.estrato || 'N/D',
    'Dirección': inst.direccion || 'Sin dirección',
    'Teléfono': inst.telefono || 'Sin teléfono',
    'Sitio Web': inst.sitio_web || '',
    'Número de Estudiantes': inst.num_estudiantes ?? 0,
    'Cupos Disponibles': inst.cupos_disponibles ?? 0,
    'Número de Docentes': inst.num_docentes ?? 0,
    'Recursos Tecnológicos': inst.recursos_tecnologicos ?? 0,
    'Horario': inst.horario || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(filas);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Instituciones");
  XLSX.writeFile(workbook, "Informe_Instituciones_Sabaneta.xlsx");
}

// Escuchar eventos al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('informe-modal');
  const btnNavInstituciones = document.getElementById('btn-nav-instituciones');
  const btnExcel = document.getElementById('btn-exportar-excel');
  const btnPdf = document.getElementById('btn-exportar-pdf');

  if (btnNavInstituciones && modal) {
    btnNavInstituciones.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('institucion-modal--open');
      cargarDatosInforme();
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.dataset.cerrarInforme !== undefined) {
        modal.classList.remove('institucion-modal--open');
      }
    });
  }

  if (btnPdf) btnPdf.addEventListener('click', exportarAPDF);
  if (btnExcel) btnExcel.addEventListener('click', exportarAExcel);
});

// Exponer la función globalmente
window.cargarDatosInforme = cargarDatosInforme;