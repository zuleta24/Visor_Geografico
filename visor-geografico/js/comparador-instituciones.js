/**
 * js/comparador-instituciones.js
 * ------------------------------------------------------------------
 * Carga instituciones y becas en tiempo real desde Supabase.
 * Genera barras de comparación dinámicas y el catálogo de becas activo.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  const TABLA_INST = window.TABLA_INSTITUCIONES || 'instituciones_educativas';
  const TABLA_BECAS = 'becas';
  const MAX = 6;
  const COLORES = ['#29e2b8', '#3b82f6', '#a855f7', '#f97316', '#eab308', '#ec4899'];

  // Becas de respaldo local en caso de desconexión
  const BECAS_FALLBACK = [
    {
      titulo: "Fondo Educación Superior Sabaneta",
      tipo: "Condonable 100%",
      categoria: "publica",
      descripcion: "Financiación integral de matrícula para carreras técnicas, tecnológicas y universitarias en instituciones con convenio.",
      requisitos: "Residir en Sabaneta (mínimo 3 años), estar en Sisbén IV o estrato 1, 2 o 3, y haber presentado Pruebas Saber 11°.",
      enlace: "https://micuenta.sabaneta.gov.co/"
    },
    {
      titulo: "Convenios Municipales de Descuento",
      tipo: "10% a 30% Descuento",
      categoria: "descuento",
      descripcion: "Descuentos en tarifa de matrícula en universidades aliadas del Aburrá Sur para habitantes registrados en Sabaneta.",
      requisitos: "Certificado de residencia emitido por la Alcaldía de Sabaneta y carta de admisión institucional.",
      enlace: "https://www.sabaneta.gov.co/"
    },
    {
      titulo: "Beca Excelencia Académica Saber 11°",
      tipo: "Cobertura Total",
      categoria: "publica",
      descripcion: "Reconocimiento a los mejores puntajes del examen ICFES de graduados de colegios públicos de Sabaneta.",
      requisitos: "Estar graduado de I.E. pública del municipio y superar el puntaje de corte de la convocatoria vigente.",
      enlace: "https://www.sabaneta.gov.co/"
    },
    {
      titulo: "Subsidio Formación Digital y Tecnológica",
      tipo: "Subsidio Directo",
      categoria: "descuento",
      descripcion: "Subsidios para programas de desarrollo de software, programación y tecnologías de la información.",
      requisitos: "Ser bachiller residente en Sabaneta y superar prueba de aptitud técnica inicial.",
      enlace: "https://micuenta.sabaneta.gov.co/"
    }
  ];

  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const METRICAS = [
    {
      id: 'estrato',
      titulo: '🏛 Estrato Socioeconómico',
      ayuda: 'Nivel socioeconómico registrado del sector (1 a 6)',
      get: (r) => num(r.estrato),
      fijo: 6,
      fmt: (v) => `Estrato ${v}`
    },
    {
      id: 'cupos',
      titulo: '🎯 Cupos Disponibles',
      ayuda: 'Número de plazas vacantes reportadas para matrícula',
      get: (r) => num(r.cupos_disponibles !== undefined ? r.cupos_disponibles : r.cupos),
      fmt: (v) => Number(v).toLocaleString('es-CO')
    },
    {
      id: 'docentes',
      titulo: '👨‍🏫 Planta Docente',
      ayuda: 'Total de profesores y equipo pedagógico vinculados',
      get: (r) => num(r.num_docentes !== undefined ? r.num_docentes : r.docentes),
      fmt: (v) => Number(v).toLocaleString('es-CO')
    },
    {
      id: 'estudiantes',
      titulo: '📊 Matrícula de Estudiantes',
      ayuda: 'Número total de estudiantes matriculados en la institución',
      get: (r) => num(r.num_estudiantes !== undefined ? r.num_estudiantes : r.estudiantes),
      fmt: (v) => Number(v).toLocaleString('es-CO')
    }
  ];

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function norm(t) {
    return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function obtenerCliente() {
    if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) return window.supabaseClient;
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    return null;
  }

  const estado = {
    filas: [],
    becas: [],
    sel: [],
    colores: new Map(),
    busca: '',
    tipo: '',
    sector: '',
    estrato: '',
    abiertas: new Set(METRICAS.map(m => m.id).concat(['becas']))
  };

  async function cargarFilas() {
    const client = obtenerCliente();

    if (client) {
      try {
        const { data, error } = await client.from(TABLA_INST).select('*').order('nombre');
        if (!error && data && data.length > 0) {
          estado.filas = data.map(r => ({ ...r, id: String(r.id) }));
          const idsValidos = new Set(estado.filas.map(r => r.id));
          estado.sel = estado.sel.filter(id => idsValidos.has(id));
        }
      } catch (e) {
        console.warn('[comparador] Error en instituciones Supabase:', e);
      }
    }

    if (!estado.filas.length) {
      estado.filas = [
        { id: '1', nombre: 'I.E. Adelaida Correa Estrada', tipo: 'colegio', sector: 'publico', estrato: 3, num_estudiantes: 1250, cupos_disponibles: 45, num_docentes: 48 },
        { id: '2', nombre: 'Colegio El Carmelo', tipo: 'colegio', sector: 'privado', estrato: 4, num_estudiantes: 890, cupos_disponibles: 20, num_docentes: 60 },
        { id: '3', nombre: 'Fundación Universitaria CEIPA', tipo: 'universidad', sector: 'privado', estrato: 4, num_estudiantes: 3200, cupos_disponibles: 150, num_docentes: 140 },
        { id: '4', nombre: 'Universidad CES', tipo: 'universidad', sector: 'privado', estrato: 3, num_estudiantes: 4100, cupos_disponibles: 150, num_docentes: 85 }
      ];
    }
  }

  async function cargarBecas() {
    const client = obtenerCliente();

    if (client) {
      try {
        const { data, error } = await client
          .from(TABLA_BECAS)
          .select('*')
          .eq('activa', true)
          .order('titulo');

        if (!error && data && data.length > 0) {
          estado.becas = data;
          return;
        }
      } catch (e) {
        console.warn('[comparador] Error al consultar tabla becas en Supabase:', e);
      }
    }

    estado.becas = BECAS_FALLBACK;
  }

  function asignarColor(id) {
    if (estado.colores.has(id)) return;
    const usados = new Set(estado.sel.filter(x => x !== id).map(x => estado.colores.get(x)));
    estado.colores.set(id, COLORES.find(c => !usados.has(c)) || COLORES[0]);
  }

  function renderLista() {
    const $lista = document.getElementById('cp-lista');
    const $counter = document.getElementById('cp-counter');
    if (!$lista) return;

    const b = norm(estado.busca);
    const filtradas = estado.filas.filter(r => {
      const matchBusca = !b || norm(r.nombre).includes(b) || norm(r.direccion).includes(b);
      const matchTipo = !estado.tipo || norm(r.tipo) === estado.tipo;
      const matchSector = !estado.sector || norm(r.sector) === estado.sector;
      const matchEstrato = !estado.estrato || String(r.estrato) === String(estado.estrato);
      return matchBusca && matchTipo && matchSector && matchEstrato;
    });

    if ($counter) {
      $counter.textContent = `${filtradas.length} de ${estado.filas.length}`;
    }

    if (!filtradas.length) {
      $lista.innerHTML = '<li style="padding:12px; color:#a3bba8; font-size:12px; text-align:center;">No coinciden instituciones.</li>';
      return;
    }

    const lleno = estado.sel.length >= MAX;

    $lista.innerHTML = filtradas.map(r => {
      const idStr = String(r.id);
      const checked = estado.sel.includes(idStr);
      const disabled = !checked && lleno;

      return `
        <li>
          <label>
            <input type="checkbox" data-cp-id="${esc(idStr)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span>
              ${esc(r.nombre)}
              <small>${r.tipo ? r.tipo.toUpperCase() : 'COLEGIO'} · ${r.sector ? r.sector.toUpperCase() : 'PÚBLICO'}</small>
            </span>
          </label>
        </li>
      `;
    }).join('');
  }

  function renderChips() {
    const $chips = document.getElementById('cp-chips');
    const $cuenta = document.getElementById('cp-cuenta');
    const $limpiar = document.getElementById('cp-btn-limpiar');
    if (!$chips || !$cuenta) return;

    $cuenta.textContent = `(${estado.sel.length}/${MAX})`;
    if ($limpiar) $limpiar.disabled = estado.sel.length === 0;

    if (!estado.sel.length) {
      $chips.innerHTML = '<span style="font-size:12px; color:#a3bba8;">Ninguna elegida. Marca arriba.</span>';
      return;
    }

    $chips.innerHTML = estado.sel.map(id => {
      const inst = estado.filas.find(r => String(r.id) === String(id));
      if (!inst) return '';
      const col = estado.colores.get(String(id)) || '#29e2b8';

      return `
        <span class="cp-chip-item" style="--chip-color: ${col}">
          <i></i>
          <span title="${esc(inst.nombre)}">${esc(inst.nombre)}</span>
          <button type="button" data-cp-quitar="${esc(id)}">&times;</button>
        </span>
      `;
    }).join('');
  }

  function renderResultados() {
    const $res = document.getElementById('cp-resultado');
    if (!$res) return;

    const elegidas = estado.sel.map(id => estado.filas.find(r => String(r.id) === String(id))).filter(Boolean);

    if (elegidas.length < 2) {
      $res.innerHTML = `
        <div style="padding: 48px 24px; text-align: center; background: rgba(18, 41, 27, 0.95); border-radius: 14px; border: 1px dashed var(--border-subtle, #21412e);">
          <h3 style="margin: 0 0 8px 0; color: #ffffff; font-size: 16px;">${elegidas.length ? 'Selecciona al menos una más' : 'Comienza seleccionando instituciones'}</h3>
          <p style="margin: 0; color: #a3bba8; font-size: 13px;">Marca de 2 a ${MAX} instituciones en la barra lateral para ver los gráficos comparativos.</p>
        </div>
      `;
      return;
    }

    let html = METRICAS.map(m => {
      const items = elegidas.map(r => ({
        id: String(r.id),
        r,
        v: m.get(r),
        color: estado.colores.get(String(r.id))
      }));

      const conDato = items.filter(x => x.v !== null).sort((a, b) => b.v - a.v);
      const sinDato = items.filter(x => x.v === null);
      const mayor = conDato.length ? conDato[0].v : null;
      const maximo = m.fijo || (mayor || 1);

      const resumenText = conDato.length
        ? `Mayor: <b>${esc(conDato[0].r.nombre)}</b> (${m.fmt(conDato[0].v)})`
        : 'Sin información cargada';

      const filasHtml = conDato.concat(sinDato).map(item => {
        const nombreLabel = `<div class="cp-inst-name">${esc(item.r.nombre)}<small>${item.r.tipo || 'Colegio'} · ${item.r.sector || ''}</small></div>`;

        if (item.v === null) {
          return `
            <div class="cp-bar-row">
              ${nombreLabel}
              <div class="cp-bar-track" style="background: rgba(255,255,255,0.02);"></div>
              <span class="cp-bar-value" style="color:#64748b; font-size:11px;">Sin dato</span>
            </div>
          `;
        }

        const pct = Math.max(3, (item.v / maximo) * 100);
        const esMax = item.v === mayor && conDato.length > 1;

        return `
          <div class="cp-bar-row">
            ${nombreLabel}
            <div class="cp-bar-track">
              <i style="--bar-color: ${item.color}; width: ${pct}%;"></i>
            </div>
            <span class="cp-bar-value ${esMax ? 'cp-bar-value--top' : ''}">${m.fmt(item.v)}</span>
          </div>
        `;
      }).join('');

      return `
        <details class="cp-card-accordion" data-sec="${m.id}" ${estado.abiertas.has(m.id) ? 'open' : ''}>
          <summary>
            <span>${m.titulo}</span>
            <span class="cp-sec-resumen">${resumenText}</span>
          </summary>
          <div class="cp-bar-container">
            <p class="cp-metric-hint">${m.ayuda}</p>
            ${filasHtml}
          </div>
        </details>
      `;
    }).join('');

    const becasCardsHtml = estado.becas.map(b => `
      <div class="beca-item-card" style="background:#07130c; border:1px solid #21412e; border-radius:10px; padding:16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:8px;">
          <h4 class="beca-item-title" style="margin:0 0 6px 0; color:#ffffff; font-size:15px;">${esc(b.titulo)}</h4>
          <span class="beca-badge-tag" style="background:#29e2b8; color:#07130c; font-weight:800; padding:2px 8px; border-radius:4px; font-size:11px;">${esc(b.tipo)}</span>
        </div>
        <p class="beca-item-desc" style="color:#a3bba8; font-size:13px; margin:0 0 8px 0;">${esc(b.descripcion)}</p>
        <div class="beca-item-req" style="color:#c3d0e4; font-size:12px; margin-bottom:12px;">
          <strong>Requisitos:</strong> ${esc(b.requisitos)}
        </div>
        <a href="${b.enlace}" target="_blank" rel="noopener noreferrer" style="color:#29e2b8; font-weight:700; font-size:13px; text-decoration:underline;">🔗 Consultar Convocatoria</a>
      </div>
    `).join('');

    html += `
      <details class="cp-card-accordion" data-sec="becas" ${estado.abiertas.has('becas') ? 'open' : ''}>
        <summary>
          <span>🎓 Oferta Municipal de Becas y Subsidios</span>
          <span class="cp-sec-resumen">${estado.becas.length} programas disponibles</span>
        </summary>
        <div class="becas-grid-container" style="padding:16px 0;">
          ${becasCardsHtml}
        </div>
      </details>
    `;

    $res.innerHTML = html;
  }

  function renderTodo() {
    renderLista();
    renderChips();
    renderResultados();
  }

  function elegir(id, agregar) {
    const idStr = String(id);
    if (agregar) {
      if (estado.sel.length >= MAX || estado.sel.includes(idStr)) return;
      estado.sel.push(idStr);
      asignarColor(idStr);
    } else {
      estado.sel = estado.sel.filter(x => String(x) !== idStr);
      estado.colores.delete(idStr);
    }
    renderTodo();
  }

  async function inicializar() {
    await Promise.all([cargarFilas(), cargarBecas()]);

    if (estado.filas.length > 0 && estado.sel.length === 0) {
      const iniciales = estado.filas.slice(0, 2);
      iniciales.forEach(x => {
        const idStr = String(x.id);
        estado.sel.push(idStr);
        asignarColor(idStr);
      });
    }

    renderTodo();

    const $buscar = document.getElementById('cp-buscar');
    const $tipo = document.getElementById('cp-tipo');
    const $sector = document.getElementById('cp-sector');
    const $estrato = document.getElementById('cp-estrato');
    const $btnResetFiltros = document.getElementById('cp-btn-limpiar-filtros');

    const $lista = document.getElementById('cp-lista');
    const $chips = document.getElementById('cp-chips');
    const $sugeridas = document.getElementById('cp-btn-sugeridas');
    const $limpiar = document.getElementById('cp-btn-limpiar');

    if ($buscar) $buscar.addEventListener('input', (e) => { estado.busca = e.target.value; renderLista(); });
    if ($tipo) $tipo.addEventListener('change', (e) => { estado.tipo = e.target.value; renderLista(); });
    if ($sector) $sector.addEventListener('change', (e) => { estado.sector = e.target.value; renderLista(); });
    if ($estrato) $estrato.addEventListener('change', (e) => { estado.estrato = e.target.value; renderLista(); });

    if ($btnResetFiltros) {
      $btnResetFiltros.addEventListener('click', () => {
        estado.busca = '';
        estado.tipo = '';
        estado.sector = '';
        estado.estrato = '';

        if ($buscar) $buscar.value = '';
        if ($tipo) $tipo.value = '';
        if ($sector) $sector.value = '';
        if ($estrato) $estrato.value = '';

        renderLista();
      });
    }

    if ($lista) {
      $lista.addEventListener('change', (e) => {
        const chk = e.target.closest('[data-cp-id]');
        if (chk) elegir(chk.dataset.cpId, chk.checked);
      });
    }

    if ($chips) {
      $chips.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cp-quitar]');
        if (btn) elegir(btn.dataset.cpQuitar, false);
      });
    }

    if ($sugeridas) {
      $sugeridas.addEventListener('click', async () => {
        estado.sel = [];
        estado.colores.clear();

        const client = obtenerCliente();
        let topIds = [];

        if (client) {
          try {
            const { data: opiniones } = await client.from('opiniones_instituciones').select('institucion_id, calificacion');

            if (opiniones && opiniones.length > 0) {
              const promedios = {};
              opiniones.forEach(op => {
                if (!op.institucion_id) return;
                if (!promedios[op.institucion_id]) promedios[op.institucion_id] = { suma: 0, cuenta: 0 };
                promedios[op.institucion_id].suma += Number(op.calificacion || 5);
                promedios[op.institucion_id].cuenta += 1;
              });

              topIds = Object.keys(promedios)
                .map(id => ({ id, prom: promedios[id].suma / promedios[id].cuenta }))
                .sort((a, b) => b.prom - a.prom)
                .slice(0, 3)
                .map(x => String(x.id));
            }
          } catch (err) {
            console.warn('Fallback al criterio de matrícula:', err);
          }
        }

        if (topIds.length < 3) {
          topIds = estado.filas
            .map(r => ({ r, v: METRICAS[3].get(r) ?? 0 }))
            .sort((a, b) => b.v - a.v)
            .slice(0, 3)
            .map(x => String(x.r.id));
        }

        topIds.forEach(idStr => {
          estado.sel.push(idStr);
          asignarColor(idStr);
        });

        renderTodo();
      });
    }

    if ($limpiar) {
      $limpiar.addEventListener('click', () => {
        estado.sel = [];
        estado.colores.clear();
        renderTodo();
      });
    }

    document.addEventListener('instituciones:actualizadas', async () => {
      await Promise.all([cargarFilas(), cargarBecas()]);
      renderTodo();
    });
  }

  document.addEventListener('DOMContentLoaded', inicializar);
})();