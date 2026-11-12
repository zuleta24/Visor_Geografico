/**
 * admin-mantenimiento.js
 * ------------------------------------------------------------------
 * Módulo «Mantenimiento de instituciones» para administracion.html.
 *
 *  1. Indicador visible en el panel: porcentaje global de mantenimiento
 *        (solicitudes resueltas / total de solicitudes) * 100
 *  2. Formulario para que el rector reporte el estado y las fallas de su
 *     institución: equipos (cómputo y redes), mobiliario (sillas y tableros)
 *     e infraestructura (grietas, humedades y techos), con descripción,
 *     gravedad y evidencias fotográficas.
 *  3. Al enviar: guarda el reporte y las fotos en Supabase, genera el
 *     formato oficial en PDF (se descarga solo) y envía una copia por correo
 *     a la Secretaría de Educación (Edge Function «enviar-reporte»).
 *  4. Panel de seguimiento: historial, estado (radicado · en revisión ·
 *     resuelto), detalle con fotos, cambio de estado y PDF de cada reporte.
 *
 * Requiere (ya incluido en administracion.html):
 *   - supabaseClient (js/supabaseClient.js) con sesión de administrador
 *   - jsPDF y jsPDF-AutoTable (CDN)
 *   - mantenimiento.sql ejecutado en Supabase
 *   - Para el correo: la función enviar-reporte (ver enviar-reporte/index.ts)
 *
 * Funciona en celular y computador. Expone window.MantenimientoSabaneta.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__adminMantenimiento) return;
  window.__adminMantenimiento = true;

  /* ===================================================================
     Configuración
     =================================================================== */
  var T_REP = 'reportes_mantenimiento';
  var T_ITEMS = 'reportes_mantenimiento_items';
  var T_INST = window.TABLA_INSTITUCIONES || 'instituciones_educativas';
  var BUCKET = 'reportes-evidencias';
  var FUNCION_CORREO = 'enviar-reporte';
  var MAX_FOTOS = 4;       // fotos por daño
  var MAX_LADO = 1280;     // px del lado mayor de cada foto
  var CALIDAD = 0.72;      // calidad JPEG

  var AREAS = {
    equipos: {
      titulo: 'Equipos', sub: 'Cómputo y redes', icono: '💻', pref: 'E',
      elementos: ['Computador de escritorio', 'Portátil o tableta', 'Videoproyector o televisor', 'Red wifi o punto de red',
        'Router, switch o cableado', 'Impresora', 'Otro equipo']
    },
    mobiliario: {
      titulo: 'Mobiliario', sub: 'Sillas y tableros', icono: '🪑', pref: 'M',
      elementos: ['Sillas', 'Mesas o pupitres', 'Tablero', 'Escritorio docente', 'Armarios o estantería', 'Otro mobiliario']
    },
    infraestructura: {
      titulo: 'Infraestructura', sub: 'Grietas, humedades y techos', icono: '🧱', pref: 'I',
      elementos: ['Grietas en muros o pisos', 'Humedades o filtraciones', 'Techo o cubierta', 'Goteras', 'Baños o sanitarios',
        'Otra falla de infraestructura']
    }
  };
  var GRAV = {
    baja: { t: 'Baja', c: '#69b544', d: 'No afecta las clases', rgb: [56, 142, 60], n: 1 },
    media: { t: 'Media', c: '#f5c324', d: 'Afecta en parte', rgb: [180, 130, 0], n: 2 },
    alta: { t: 'Alta', c: '#f97316', d: 'Afecta las clases', rgb: [217, 90, 0], n: 3 },
    critica: { t: 'Crítica', c: '#ef4444', d: 'Riesgo o suspende clases', rgb: [200, 30, 30], n: 4 }
  };
  var ESTADOS = {
    radicado: { t: 'Radicado', c: '#60a5fa' },
    en_revision: { t: 'En revisión', c: '#f5c324' },
    resuelto: { t: 'Resuelto', c: '#69b544' }
  };

  /* ===================================================================
     Utilidades
     =================================================================== */
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function cliente() {
    if (window.supabaseClient) return window.supabaseClient;
    try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch (e) { /* sin cliente */ }
    return null;
  }

  function fecha(v, corta) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d)) return '—';
    var o = corta ? { day: '2-digit', month: 'short', year: 'numeric' }
      : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
    return d.toLocaleString('es-CO', o).replace(/\./g, '');
  }
  function fechaPDF(v) {
    var d = v ? new Date(v) : new Date();
    var p = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).reduce(function (a, x) { a[x.type] = x.value; return a; }, {});
    return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
  }
  function slug(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function pct(n) {
    var r = Math.round(n * 10) / 10;
    return String(r).replace('.', ',');
  }
  var ETQ = { colegio: 'Colegio', universidad: 'Universidad', publico: 'Público', publica: 'Pública', privado: 'Privado', privada: 'Privada', oficial: 'Oficial' };
  var etq = function (v) {
    var k = String(v || '').trim();
    return ETQ[k.toLowerCase()] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : '');
  };
  var correoValido = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };

  var toastTimer;
  function aviso(msg, tipo) {
    var t = $('#mnt-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'mnt-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.className = 'mnt-toast mnt-toast--' + (tipo || 'ok') + ' is-on';
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 4800);
  }

  /* ===================================================================
     Estilos (incluye todo el diseño responsive del módulo)
     =================================================================== */
  var css = document.createElement('style');
  css.id = 'mnt-estilos';
  css.textContent = [
    ':root{--mnt-bg:#0d1f14;--mnt-panel:#12291b;--mnt-panel2:#173523;--mnt-line:rgba(255,255,255,.1);--mnt-txt:#eef5ef;--mnt-mut:#a3bba8;--mnt-ac:#69b544;--mnt-am:#f5c324}',
    '.mnt-lock{overflow:hidden!important}',

    /* ---- tarjeta resumen en el panel ---- */
    '.mnt-resumen{display:grid;grid-template-columns:auto 1fr auto;gap:22px;align-items:center;margin:0 0 20px;padding:20px 24px;border-radius:16px;border:1px solid rgba(105,181,68,.35);background:linear-gradient(135deg,rgba(12,100,52,.4),rgba(18,41,27,.92));color:var(--mnt-txt)}',
    '.mnt-resumen h2{margin:0 0 4px;font-size:16px;font-weight:800;color:#fff}',
    '.mnt-resumen__sub{margin:0 0 10px;font-size:13.5px;color:var(--mnt-mut)}',
    '.mnt-resumen__sub b{color:var(--mnt-am)}',
    '.mnt-resumen__acc{display:flex;flex-direction:column;gap:10px;min-width:190px}',
    '.mnt-gauge{position:relative;width:132px;height:132px;flex:none}',
    '.mnt-gauge svg{width:100%;height:100%;transform:rotate(-90deg)}',
    '.mnt-gauge circle{fill:none;stroke-width:11;stroke-linecap:round}',
    '.mnt-gauge .bg{stroke:rgba(255,255,255,.1)}',
    '.mnt-gauge .fg{stroke:url(#mntGrad);transition:stroke-dasharray .8s ease}',
    '.mnt-gauge .fg.cero{display:none}',
    '.mnt-gauge__txt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.1}',
    '.mnt-gauge__txt b{font-size:30px;font-weight:800;color:#fff;font-family:"JetBrains Mono",ui-monospace,monospace}',
    '.mnt-gauge__txt small{margin-top:4px;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--mnt-mut)}',
    '.mnt-gauge--sm{width:112px;height:112px}.mnt-gauge--sm .mnt-gauge__txt b{font-size:25px}.mnt-gauge--sm .mnt-gauge__txt small{font-size:8.5px;letter-spacing:.03em}',
    '.mnt-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.mnt-chip{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:700;color:var(--mnt-txt);background:rgba(255,255,255,.06);border:1px solid var(--mnt-line)}',
    '.mnt-chip i{width:9px;height:9px;border-radius:50%;background:var(--c)}',
    '.mnt-bar{height:8px;margin-top:12px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}',
    '.mnt-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#0c6434,#69b544,#d3d934);transition:width .8s ease}',

    /* ---- botones ---- */
    '.mnt-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;cursor:pointer;font:inherit;font-size:14px;font-weight:800;color:var(--mnt-txt);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);transition:background .15s,transform .1s;text-decoration:none}',
    '.mnt-btn:hover{background:rgba(255,255,255,.14)}.mnt-btn:active{transform:scale(.98)}',
    '.mnt-btn--ac{color:#07130c;background:var(--mnt-ac);border-color:var(--mnt-ac)}.mnt-btn--ac:hover{background:#7bc853}',
    '.mnt-btn--sm{min-height:36px;padding:0 12px;font-size:13px;border-radius:10px}',
    '.mnt-btn[disabled]{opacity:.55;cursor:not-allowed}',
    '.mnt-link{background:none;border:0;padding:6px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;color:#fca5a5}',

    /* ---- módulo (pantalla completa) ---- */
    '.mnt-modulo{position:fixed;inset:0;z-index:10002;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(3,10,6,.78);backdrop-filter:blur(3px)}',
    '.mnt-modulo.is-open{display:flex}',
    '.mnt-panel{position:relative;display:flex;flex-direction:column;width:min(1180px,100%);height:min(94vh,980px);overflow:hidden;border-radius:18px;color:var(--mnt-txt);background:var(--mnt-bg);border:1px solid var(--mnt-line);box-shadow:0 30px 80px rgba(0,0,0,.6)}',
    '.mnt-cab{flex:none;display:flex;align-items:center;gap:14px;padding:16px 22px 0;background:var(--mnt-panel)}',
    '.mnt-cab h2{flex:1;margin:0;font-size:19px;font-weight:800;color:#fff}',
    '.mnt-cab h2 small{display:block;margin-top:2px;font-size:12.5px;font-weight:500;color:var(--mnt-mut)}',
    '.mnt-x{flex:none;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;color:#fff;background:rgba(255,255,255,.08);border:1px solid var(--mnt-line)}',
    '.mnt-x:hover{background:rgba(255,255,255,.18)}',
    '.mnt-tabs{flex:none;display:flex;gap:6px;padding:12px 22px 0;background:var(--mnt-panel);border-bottom:1px solid var(--mnt-line)}',
    '.mnt-tab{flex:0 1 auto;min-height:46px;padding:0 20px;cursor:pointer;font:inherit;font-size:14px;font-weight:800;color:var(--mnt-mut);background:transparent;border:0;border-bottom:3px solid transparent}',
    '.mnt-tab[aria-selected=true]{color:#fff;border-bottom-color:var(--mnt-ac)}',
    '.mnt-cuerpo{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:22px;-webkit-overflow-scrolling:touch}',
    '.mnt-vista[hidden]{display:none}',

    /* ---- seguimiento ---- */
    '.mnt-kpi{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;margin-bottom:18px;padding:18px 20px;border-radius:14px;background:var(--mnt-panel);border:1px solid var(--mnt-line)}',
    '.mnt-kpi__nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
    '.mnt-num{padding:12px 10px;text-align:center;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--mnt-line)}',
    '.mnt-num b{display:block;font-size:24px;font-weight:800;color:#fff;font-family:"JetBrains Mono",ui-monospace,monospace}',
    '.mnt-num span{display:block;margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mnt-mut)}',
    '.mnt-num--c b{color:var(--c)}',
    '.mnt-formula{grid-column:1/-1;margin:2px 0 0;font-size:12.5px;color:var(--mnt-mut)}',
    '.mnt-filtros{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}',
    '.mnt-filtros .mnt-in{flex:1 1 220px}',
    '.mnt-in,.mnt-sel,.mnt-ta{width:100%;min-height:46px;padding:0 14px;border-radius:12px;outline:none;font:inherit;font-size:14.5px;color:#fff;background:#0a1b11;border:1px solid rgba(255,255,255,.16)}',
    '.mnt-ta{padding:12px 14px;min-height:92px;resize:vertical;line-height:1.45}',
    '.mnt-in::placeholder,.mnt-ta::placeholder{color:#7f9a86}',
    '.mnt-in:focus,.mnt-sel:focus,.mnt-ta:focus{border-color:var(--mnt-ac);box-shadow:0 0 0 3px rgba(105,181,68,.22)}',
    '.mnt-sel{appearance:auto;color-scheme:dark}',
    '.mnt-filtros .mnt-sel{flex:0 1 200px;width:auto}',
    '.is-invalid{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.2)!important}',

    '.mnt-tabla-wrap{border-radius:14px;border:1px solid var(--mnt-line);overflow:hidden;background:var(--mnt-panel)}',
    '.mnt-tabla{width:100%;border-collapse:collapse;font-size:13.5px}',
    '.mnt-tabla th{padding:12px 14px;text-align:left;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mnt-mut);background:rgba(0,0,0,.25);white-space:nowrap}',
    '.mnt-tabla td{padding:13px 14px;vertical-align:middle;border-top:1px solid var(--mnt-line)}',
    '.mnt-tabla tbody tr:hover{background:rgba(255,255,255,.03)}',
    '.mnt-tabla .folio{font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:700;color:var(--mnt-am);white-space:nowrap}',
    '.mnt-tabla .inst{font-weight:700;color:#fff}.mnt-tabla .inst small{display:block;margin-top:2px;font-weight:500;color:var(--mnt-mut)}',
    '.mnt-tabla .acc{white-space:nowrap;text-align:right}',
    '.mnt-vacio{padding:34px 18px;text-align:center;color:var(--mnt-mut);font-size:14px}',
    '.mnt-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}',
    '.mnt-badge::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--c)}',
    '.mnt-areas{display:flex;flex-wrap:wrap;gap:5px}',
    '.mnt-mini{padding:2px 8px;border-radius:8px;font-size:11.5px;font-weight:700;color:var(--mnt-txt);background:rgba(255,255,255,.07)}',

    /* ---- formulario ---- */
    '.mnt-form{display:grid;gap:18px;max-width:900px;margin:0 auto}',
    '.mnt-card{padding:18px 20px;border-radius:14px;background:var(--mnt-panel);border:1px solid var(--mnt-line)}',
    '.mnt-card h3{margin:0 0 4px;font-size:15px;font-weight:800;color:#fff}',
    '.mnt-card > p{margin:0 0 14px;font-size:13px;color:var(--mnt-mut)}',
    '.mnt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
    '.mnt-campo{display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.mnt-campo > label,.mnt-lbl{font-size:12.5px;font-weight:800;letter-spacing:.02em;color:#d6e6d9}',
    '.mnt-campo > label em,.mnt-lbl em{font-style:normal;color:#f87171}',
    '.mnt-campo > label small,.mnt-lbl small{font-weight:500;color:var(--mnt-mut)}',
    '.mnt-instinfo{margin-top:12px;padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5;color:var(--mnt-mut);background:rgba(105,181,68,.08);border:1px dashed rgba(105,181,68,.35)}',
    '.mnt-instinfo b{color:#fff}',

    '.mnt-area{border-radius:14px;background:var(--mnt-panel);border:1px solid var(--mnt-line);overflow:hidden}',
    '.mnt-area__cab{display:flex;align-items:center;gap:12px;padding:14px 18px;background:var(--mnt-panel2)}',
    '.mnt-area__ico{flex:none;display:grid;place-items:center;width:42px;height:42px;border-radius:12px;font-size:22px;background:rgba(255,255,255,.07)}',
    '.mnt-area__cab h3{margin:0;font-size:15px;font-weight:800;color:#fff}',
    '.mnt-area__cab small{display:block;margin-top:2px;font-size:12.5px;color:var(--mnt-mut)}',
    '.mnt-area__cnt{margin-left:auto;padding:3px 11px;border-radius:99px;font-size:12px;font-weight:800;color:var(--mnt-mut);background:rgba(255,255,255,.07)}',
    '.mnt-area__cnt.on{color:#07130c;background:var(--mnt-am)}',
    '.mnt-area__lista{display:grid;gap:14px;padding:16px 18px 0}',
    '.mnt-area__vacio{margin:0;padding:16px 18px 0;font-size:13px;color:#7f9a86}',
    '.mnt-area__pie{padding:14px 18px 18px}',

    '.mnt-item{display:grid;gap:14px;padding:16px;border-radius:12px;background:rgba(0,0,0,.22);border:1px solid var(--mnt-line)}',
    '.mnt-item__cab{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.mnt-item__cab strong{font-size:13.5px;font-weight:800;color:var(--mnt-am)}',
    '.mnt-grav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.mnt-grav label{position:relative;cursor:pointer;min-width:0}',
    '.mnt-grav input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}',
    '.mnt-grav span{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:58px;padding:8px 10px;border-radius:12px;text-align:center;background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.12);transition:background .15s,border-color .15s}',
    '.mnt-grav b{font-size:13.5px;color:var(--c)}',
    '.mnt-grav small{font-size:10.5px;line-height:1.25;color:var(--mnt-mut)}',
    '.mnt-grav input:checked + span{background:color-mix(in srgb,var(--c) 18%,transparent);border-color:var(--c)}',
    '.mnt-grav input:focus-visible + span{outline:3px solid rgba(255,255,255,.5);outline-offset:2px}',
    '.mnt-grav.is-invalid{border-radius:14px}',

    '.mnt-fotos{display:flex;flex-wrap:wrap;gap:10px}',
    '.mnt-foto{position:relative;width:92px;height:92px;border-radius:12px;overflow:hidden;border:1px solid var(--mnt-line);background:#000}',
    '.mnt-foto img{width:100%;height:100%;object-fit:cover;display:block}',
    '.mnt-foto button{position:absolute;top:4px;right:4px;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:13px;line-height:1;color:#fff;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.35)}',
    '.mnt-foto-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:92px;height:92px;border-radius:12px;cursor:pointer;text-align:center;font-size:11.5px;font-weight:800;color:var(--mnt-ac);background:rgba(105,181,68,.08);border:2px dashed rgba(105,181,68,.5)}',
    '.mnt-foto-add:hover{background:rgba(105,181,68,.16)}',
    '.mnt-foto-add b{font-size:24px;line-height:1}',
    '.mnt-foto-add input{display:none}',
    '.mnt-fotos.is-invalid{padding:8px;border-radius:14px}',

    '.mnt-enviar{display:flex;flex-direction:column;gap:12px;align-items:stretch}',
    '.mnt-btn--grande{min-height:54px;font-size:16px;border-radius:14px}',
    '.mnt-nota{margin:0;font-size:12.5px;line-height:1.5;color:var(--mnt-mut)}',
    '.mnt-error{margin:0;padding:12px 14px;border-radius:12px;font-size:13.5px;font-weight:600;color:#fecaca;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.45)}',

    /* ---- progreso y resultado ---- */
    '.mnt-prog{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(8,20,13,.92)}',
    '.mnt-prog.on{display:flex}',
    '.mnt-prog__box{width:min(420px,100%);padding:26px;border-radius:18px;background:var(--mnt-panel);border:1px solid var(--mnt-line)}',
    '.mnt-prog__box h3{margin:0 0 16px;font-size:17px;color:#fff}',
    '.mnt-pasos{display:grid;gap:10px;margin:0;padding:0;list-style:none}',
    '.mnt-pasos li{display:flex;align-items:center;gap:12px;font-size:14px;color:#7f9a86}',
    '.mnt-pasos li::before{content:"";flex:none;width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.2)}',
    '.mnt-pasos li.act{color:#fff;font-weight:700}',
    '.mnt-pasos li.act::before{border-color:var(--mnt-ac);border-top-color:transparent;animation:mntgira .8s linear infinite}',
    '.mnt-pasos li.ok{color:var(--mnt-mut)}',
    '.mnt-pasos li.ok::before{content:"✓";display:grid;place-items:center;font-size:13px;font-weight:800;color:#07130c;background:var(--mnt-ac);border-color:var(--mnt-ac)}',
    '.mnt-pasos li.mal{color:#fca5a5}',
    '.mnt-pasos li.mal::before{content:"!";display:grid;place-items:center;font-size:13px;font-weight:800;color:#fff;background:#ef4444;border-color:#ef4444}',
    '@keyframes mntgira{to{transform:rotate(360deg)}}',
    '.mnt-exito{max-width:640px;margin:10px auto;padding:28px 22px;text-align:center;border-radius:18px;background:var(--mnt-panel);border:1px solid rgba(105,181,68,.4)}',
    '.mnt-exito__ico{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 14px;border-radius:50%;font-size:32px;color:#07130c;background:var(--mnt-ac)}',
    '.mnt-exito h3{margin:0 0 6px;font-size:21px;color:#fff}',
    '.mnt-exito .folio{display:inline-block;margin:8px 0 14px;padding:6px 16px;border-radius:10px;font-size:18px;font-weight:800;color:var(--mnt-am);background:rgba(245,195,36,.12);font-family:"JetBrains Mono",ui-monospace,monospace}',
    '.mnt-exito .mnt-estado-correo{margin:0 auto 18px;max-width:460px;padding:11px 14px;border-radius:12px;font-size:13.5px;line-height:1.5;text-align:left}',
    '.mnt-estado-correo.ok{color:#d9f2cc;background:rgba(105,181,68,.14);border:1px solid rgba(105,181,68,.4)}',
    '.mnt-estado-correo.mal{color:#fde7b0;background:rgba(245,195,36,.12);border:1px solid rgba(245,195,36,.4)}',
    '.mnt-exito__acc{display:grid;gap:10px}',

    /* ---- detalle ---- */
    '.mnt-detalle{position:absolute;inset:0;z-index:4;display:none;flex-direction:column;background:var(--mnt-bg)}',
    '.mnt-detalle.on{display:flex}',
    '.mnt-detalle__cab{flex:none;display:flex;align-items:center;gap:12px;padding:14px 22px;background:var(--mnt-panel);border-bottom:1px solid var(--mnt-line)}',
    '.mnt-detalle__cab h3{flex:1;min-width:0;margin:0;font-size:17px;color:#fff}',
    '.mnt-detalle__cab h3 small{display:block;margin-top:2px;font-size:12.5px;font-weight:500;color:var(--mnt-mut)}',
    '.mnt-detalle__cuerpo{flex:1 1 auto;min-height:0;overflow-y:auto;padding:22px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
    '.mnt-detalle__in{display:grid;gap:16px;max-width:900px;margin:0 auto}',
    '.mnt-dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 20px;margin:0}',
    '.mnt-dl div{min-width:0}',
    '.mnt-dl dt{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mnt-mut)}',
    '.mnt-dl dd{margin:2px 0 0;font-size:14px;color:#fff;overflow-wrap:anywhere}',
    '.mnt-linea{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0;padding:0;list-style:none}',
    '.mnt-linea li{padding:10px;border-radius:12px;text-align:center;font-size:12px;color:#7f9a86;background:rgba(255,255,255,.03);border:1px solid var(--mnt-line)}',
    '.mnt-linea li b{display:block;margin-bottom:3px;font-size:12.5px;color:var(--mnt-mut)}',
    '.mnt-linea li.on{color:#fff;background:color-mix(in srgb,var(--c) 14%,transparent);border-color:color-mix(in srgb,var(--c) 55%,transparent)}',
    '.mnt-linea li.on b{color:var(--c)}',
    '.mnt-dano{padding:14px;border-radius:12px;background:rgba(0,0,0,.22);border:1px solid var(--mnt-line)}',
    '.mnt-dano__cab{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}',
    '.mnt-dano__cab b{font-size:14px;color:#fff}',
    '.mnt-dano__cab .cod{font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:800;color:var(--mnt-am)}',
    '.mnt-dano p{margin:0 0 10px;font-size:14px;line-height:1.5;color:#dbe9de;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.mnt-dano .mnt-fotos .mnt-foto{cursor:zoom-in}',
    '.mnt-seg{display:grid;gap:12px}',
    '.mnt-det-acc{display:flex;flex-wrap:wrap;gap:10px}',

    '.mnt-lightbox{position:fixed;inset:0;z-index:10010;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.92)}',
    '.mnt-lightbox.on{display:flex}',
    '.mnt-lightbox img{max-width:100%;max-height:100%;border-radius:10px}',
    '.mnt-lightbox button{position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px}',

    '.mnt-toast{position:fixed;left:50%;bottom:calc(22px + env(safe-area-inset-bottom));z-index:10020;max-width:min(92vw,520px);padding:13px 20px;border-radius:14px;font-size:14px;font-weight:700;line-height:1.4;text-align:center;color:#07130c;background:var(--mnt-ac);box-shadow:0 12px 34px rgba(0,0,0,.5);transform:translate(-50%,30px);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}',
    '.mnt-toast.is-on{opacity:1;transform:translate(-50%,0)}',
    '.mnt-toast--mal{color:#fff;background:#b91c1c}',

    /* ================= RESPONSIVE ================= */
    '@media (max-width:1000px){',
    '  .mnt-tabla thead{display:none}',
    '  .mnt-tabla,.mnt-tabla tbody{display:block}',
    '  .mnt-tabla tbody tr{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:0 0 12px;padding:14px;border:1px solid var(--mnt-line);border-radius:14px;background:var(--mnt-panel)}',
    '  .mnt-tabla tbody tr:hover{background:var(--mnt-panel)}',
    '  .mnt-tabla-wrap{border:0;background:transparent}',
    '  .mnt-tabla td{display:block;padding:0;border:0}',
    '  .mnt-tabla td::before{content:attr(data-l);display:block;margin-bottom:3px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mnt-mut)}',
    '  .mnt-tabla td.inst,.mnt-tabla td.acc,.mnt-tabla td.dan{grid-column:1/-1}',
    '  .mnt-tabla td.acc{text-align:left}',
    '  .mnt-tabla td.acc::before{display:none}',
    '  .mnt-tabla td.acc .mnt-btn{width:100%}',
    '}',
    '@media (max-width:860px){',
    '  .mnt-resumen{grid-template-columns:auto 1fr;padding:18px}',
    '  .mnt-resumen__acc{grid-column:1/-1;flex-direction:row;min-width:0}',
    '  .mnt-resumen__acc .mnt-btn{flex:1}',
    '  .mnt-kpi{grid-template-columns:1fr;justify-items:center;text-align:center}',
    '  .mnt-kpi__nums{width:100%}',
    '}',
    '@media (max-width:760px){',
    '  .mnt-modulo{padding:0;align-items:stretch}',
    '  .mnt-panel{width:100%;height:100dvh;border-radius:0;border:0}',
    '  .mnt-cab{padding:calc(12px + env(safe-area-inset-top)) 14px 0}',
    '  .mnt-cab h2{font-size:17px}.mnt-cab h2 small{display:none}',
    '  .mnt-tabs{padding:10px 14px 0}',
    '  .mnt-tab{flex:1;padding:0 6px;font-size:13.5px}',
    '  .mnt-cuerpo,.mnt-detalle__cuerpo{padding:16px 14px calc(26px + env(safe-area-inset-bottom))}',
    '  .mnt-detalle__cab{padding:calc(12px + env(safe-area-inset-top)) 14px 12px}',
    '  .mnt-grid2{grid-template-columns:1fr}',
    '  .mnt-card{padding:16px 14px}',
    '  .mnt-area__cab{padding:12px 14px}.mnt-area__lista{padding:14px 12px 0}.mnt-area__pie{padding:12px 12px 14px}.mnt-area__vacio{padding:14px 14px 0}',
    '  .mnt-item{padding:14px 12px}',
    '  .mnt-grav{grid-template-columns:1fr 1fr}',
    '  .mnt-in,.mnt-sel,.mnt-ta{font-size:16px}',   /* 16 px: iOS no hace zoom al escribir */
    '  .mnt-filtros .mnt-sel{flex:1 1 100%;width:100%}',
    '  .mnt-kpi{padding:16px 12px}',
    '  .mnt-kpi__nums{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '  .mnt-resumen{gap:14px}',
    '  .mnt-gauge{width:104px;height:104px}.mnt-gauge__txt b{font-size:24px}',
    '  .mnt-resumen__acc{flex-direction:column}',
    '  .mnt-dl{grid-template-columns:1fr}',
    '  .mnt-linea{grid-template-columns:1fr}',
    '  .mnt-foto,.mnt-foto-add{width:calc((100% - 20px) / 3);height:auto;aspect-ratio:1}',
    '  .mnt-det-acc .mnt-btn{flex:1 1 100%}',
    '  .mnt-exito{padding:24px 14px}',
    '}',
    '@media (max-width:380px){.mnt-tabla tbody tr{grid-template-columns:1fr}.mnt-gauge__txt b{font-size:21px}}',
    '@media (prefers-reduced-motion:reduce){.mnt-gauge .fg,.mnt-bar i,.mnt-toast{transition:none}.mnt-pasos li.act::before{animation:none}}'
  ].join('\n');
  document.head.appendChild(css);

  /* ===================================================================
     Estado interno
     =================================================================== */
  var estado = {
    reportes: [],
    instituciones: [],
    cargado: false,
    errorTabla: null,
    uid: 0,
    fotos: {},            // uid -> [{blob,dataUrl,w,h,name}]
    enviando: false,
    detalleId: null
  };

  function stats() {
    var s = { total: estado.reportes.length, radicado: 0, en_revision: 0, resuelto: 0 };
    estado.reportes.forEach(function (r) { if (s[r.estado] != null) s[r.estado]++; });
    s.pct = s.total ? (s.resuelto / s.total) * 100 : 0;
    return s;
  }

  /* ===================================================================
     Indicador (anillo + cifras)
     =================================================================== */
  var C = 2 * Math.PI * 52;
  function anilloHTML(s, chico) {
    var dash = (Math.max(0, Math.min(100, s.pct)) / 100) * C;
    return '<div class="mnt-gauge' + (chico ? ' mnt-gauge--sm' : '') + '" role="img" aria-label="Mantenimiento global: ' + pct(s.pct) + ' por ciento">' +
      '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="mntGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#0c9b4a"/><stop offset="1" stop-color="#d3d934"/></linearGradient></defs>' +
      '<circle class="bg" cx="60" cy="60" r="52"/><circle class="fg' + (dash < 0.5 ? ' cero' : '') + '" cx="60" cy="60" r="52" stroke-dasharray="' + dash.toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>' +
      '<div class="mnt-gauge__txt"><b>' + pct(s.pct) + '%</b><small>mantenimiento</small></div></div>';
  }
  function chipsHTML(s) {
    return '<div class="mnt-chips">' + Object.keys(ESTADOS).map(function (k) {
      return '<span class="mnt-chip" style="--c:' + ESTADOS[k].c + '"><i></i>' + s[k] + ' ' + ESTADOS[k].t.toLowerCase() + (s[k] === 1 ? '' : (k === 'en_revision' ? '' : 's')) + '</span>';
    }).join('') + '</div>';
  }
  function subHTML(s) {
    if (estado.errorTabla) return 'No se pudo leer la tabla de reportes.';
    if (!s.total) return 'Aún no hay solicitudes. Registra el primer reporte de un rector.';
    return '<b>' + s.resuelto + '</b> de <b>' + s.total + '</b> solicitudes resueltas';
  }

  /* ===================================================================
     Tarjeta resumen en el panel de administración
     =================================================================== */
  var tarjeta = document.createElement('section');
  tarjeta.id = 'mnt-resumen';
  tarjeta.className = 'mnt-resumen';
  tarjeta.setAttribute('aria-label', 'Mantenimiento de las instituciones');
  tarjeta.hidden = true;

  function pintarTarjeta() {
    var s = stats();
    tarjeta.innerHTML = anilloHTML(s) +
      '<div><h2>Mantenimiento de las instituciones</h2><p class="mnt-resumen__sub">' + subHTML(s) + '</p>' +
      chipsHTML(s) + '<div class="mnt-bar" aria-hidden="true"><i style="width:' + s.pct.toFixed(1) + '%"></i></div></div>' +
      '<div class="mnt-resumen__acc">' +
      '<button type="button" class="mnt-btn mnt-btn--ac" data-mnt="nuevo">＋ Nuevo reporte</button>' +
      '<button type="button" class="mnt-btn" data-mnt="seguimiento">📋 Ver seguimiento</button></div>';
  }

  var adminScreen = $('#admin-screen');
  (function montarTarjeta() {
    if (!adminScreen) return;
    var ref = $('#admin-mensaje');
    if (ref && ref.parentNode === adminScreen) adminScreen.insertBefore(tarjeta, ref.nextSibling);
    else {
      var cab = $('.admin-header-title', adminScreen);
      if (cab) adminScreen.insertBefore(tarjeta, cab.nextSibling); else adminScreen.insertBefore(tarjeta, adminScreen.firstChild);
    }
  })();
  tarjeta.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mnt]');
    if (!b) return;
    abrir(b.getAttribute('data-mnt') === 'nuevo' ? 'nuevo' : 'seguimiento');
  });

  /* ===================================================================
     Módulo (overlay) — estructura
     =================================================================== */
  var modulo = document.createElement('div');
  modulo.className = 'mnt-modulo';
  modulo.id = 'mnt-modulo';
  modulo.innerHTML =
    '<div class="mnt-panel" role="dialog" aria-modal="true" aria-labelledby="mnt-titulo">' +
    '<div class="mnt-cab"><h2 id="mnt-titulo">Reportes de mantenimiento<small>Estado y fallas de las instituciones educativas de Sabaneta</small></h2>' +
    '<button type="button" class="mnt-x" data-mnt="cerrar" aria-label="Cerrar">✕</button></div>' +
    '<div class="mnt-tabs" role="tablist">' +
    '<button type="button" class="mnt-tab" role="tab" id="mnt-t-seg" data-tab="seguimiento" aria-selected="true">📋 Seguimiento</button>' +
    '<button type="button" class="mnt-tab" role="tab" id="mnt-t-nuevo" data-tab="nuevo" aria-selected="false">＋ Nuevo reporte</button></div>' +
    '<div class="mnt-cuerpo" id="mnt-cuerpo">' +
    '<div class="mnt-vista" id="mnt-v-seg" role="tabpanel" aria-labelledby="mnt-t-seg"></div>' +
    '<div class="mnt-vista" id="mnt-v-nuevo" role="tabpanel" aria-labelledby="mnt-t-nuevo" hidden></div></div>' +
    '<div class="mnt-detalle" id="mnt-detalle" role="dialog" aria-modal="true" aria-label="Detalle del reporte"></div>' +
    '<div class="mnt-prog" id="mnt-prog"><div class="mnt-prog__box"><h3 id="mnt-prog-t">Enviando reporte…</h3><ul class="mnt-pasos" id="mnt-pasos"></ul></div></div>' +
    '</div>';
  document.body.appendChild(modulo);

  var lightbox = document.createElement('div');
  lightbox.className = 'mnt-lightbox';
  lightbox.innerHTML = '<button type="button" class="mnt-x" aria-label="Cerrar foto">✕</button><img alt="Evidencia fotográfica ampliada" />';
  document.body.appendChild(lightbox);
  lightbox.addEventListener('click', function () { lightbox.classList.remove('on'); });

  function abrir(tab) {
    modulo.classList.add('is-open');
    document.body.classList.add('mnt-lock');
    irATab(tab || 'seguimiento');
    cargarReportes();
    if (!estado.instituciones.length) cargarInstituciones();
    var x = $('.mnt-x', modulo);
    if (x) x.focus({ preventScroll: true });
  }
  function cerrar() {
    modulo.classList.remove('is-open');
    document.body.classList.remove('mnt-lock');
    cerrarDetalle();
  }
  function irATab(tab) {
    var seg = tab !== 'nuevo';
    $('#mnt-v-seg').hidden = !seg;
    $('#mnt-v-nuevo').hidden = seg;
    $('#mnt-t-seg').setAttribute('aria-selected', String(seg));
    $('#mnt-t-nuevo').setAttribute('aria-selected', String(!seg));
    $('#mnt-cuerpo').scrollTop = 0;
    if (seg) pintarSeguimiento();
    else if (!$('#mnt-form') && !$('#mnt-exito')) pintarFormulario();
  }

  modulo.addEventListener('click', function (e) {
    if (e.target === modulo) { if (!estado.enviando) cerrar(); return; }
    var b = e.target.closest('[data-mnt]');
    if (b && b.getAttribute('data-mnt') === 'cerrar') { if (!estado.enviando) cerrar(); return; }
    var t = e.target.closest('[data-tab]');
    if (t) irATab(t.getAttribute('data-tab'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (lightbox.classList.contains('on')) { lightbox.classList.remove('on'); return; }
    if (!modulo.classList.contains('is-open') || estado.enviando) return;
    if ($('#mnt-detalle').classList.contains('on')) cerrarDetalle(); else cerrar();
  });

  /* ===================================================================
     Carga de datos
     =================================================================== */
  async function cargarReportes() {
    var c = cliente();
    if (!c) return;
    var r = await c.from(T_REP).select('*, ' + T_ITEMS + '(area,gravedad)').order('radicado_at', { ascending: false });
    if (r.error) {
      estado.errorTabla = r.error.message || 'Error al leer los reportes.';
      console.warn('[mantenimiento]', r.error);
    } else {
      estado.errorTabla = null;
      estado.reportes = r.data || [];
    }
    estado.cargado = true;
    pintarTarjeta();
    if (modulo.classList.contains('is-open') && !$('#mnt-v-seg').hidden) pintarSeguimiento();
  }

  async function cargarInstituciones() {
    var c = cliente();
    if (!c) return;
    var r = await c.from(T_INST).select('*').order('nombre');
    if (r.error) { console.warn('[mantenimiento] instituciones', r.error); return; }
    estado.instituciones = r.data || [];
    var sel = $('#mnt-inst');
    if (sel) llenarInstituciones(sel);
  }

  /* ===================================================================
     Vista: seguimiento
     =================================================================== */
  var filtro = { q: '', estado: '', area: '' };

  function pintarSeguimiento() {
    var cont = $('#mnt-v-seg');
    var s = stats();
    var aviso = '';
    if (estado.errorTabla) {
      aviso = '<p class="mnt-error">No se pudieron cargar los reportes: ' + esc(estado.errorTabla) +
        '. Verifica que ejecutaste <b>mantenimiento.sql</b> en Supabase.</p>';
    }
    cont.innerHTML = aviso +
      '<div class="mnt-kpi">' + anilloHTML(s, true) +
      '<div class="mnt-kpi__nums">' +
      '<div class="mnt-num"><b>' + s.total + '</b><span>Solicitudes</span></div>' +
      Object.keys(ESTADOS).map(function (k) {
        return '<div class="mnt-num mnt-num--c" style="--c:' + ESTADOS[k].c + '"><b>' + s[k] + '</b><span>' + ESTADOS[k].t + '</span></div>';
      }).join('') + '</div>' +
      '<p class="mnt-formula">Porcentaje de mantenimiento = (solicitudes resueltas ÷ total de solicitudes) × 100 = ' +
      '(<b>' + s.resuelto + '</b> ÷ <b>' + s.total + '</b>) × 100 = <b>' + pct(s.pct) + '%</b></p></div>' +
      '<div class="mnt-filtros">' +
      '<input class="mnt-in" id="mnt-q" type="search" placeholder="Buscar por folio, institución o rector…" value="' + esc(filtro.q) + '" aria-label="Buscar reportes" />' +
      '<select class="mnt-sel" id="mnt-fe" aria-label="Filtrar por estado"><option value="">Todos los estados</option>' +
      Object.keys(ESTADOS).map(function (k) { return '<option value="' + k + '"' + (filtro.estado === k ? ' selected' : '') + '>' + ESTADOS[k].t + '</option>'; }).join('') + '</select>' +
      '<select class="mnt-sel" id="mnt-fa" aria-label="Filtrar por área"><option value="">Todas las áreas</option>' +
      Object.keys(AREAS).map(function (k) { return '<option value="' + k + '"' + (filtro.area === k ? ' selected' : '') + '>' + AREAS[k].titulo + '</option>'; }).join('') + '</select>' +
      '</div><div id="mnt-lista"></div>';
    pintarLista();
  }

  function listaFiltrada() {
    var q = filtro.q.trim().toLowerCase();
    return estado.reportes.filter(function (r) {
      var items = r[T_ITEMS] || [];
      if (filtro.estado && r.estado !== filtro.estado) return false;
      if (filtro.area && !items.some(function (i) { return i.area === filtro.area; })) return false;
      if (q) {
        var txt = [r.folio, r.institucion_nombre, r.rector_nombre].join(' ').toLowerCase();
        if (txt.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function pintarLista() {
    var cont = $('#mnt-lista');
    if (!cont) return;
    var lista = listaFiltrada();
    if (!lista.length) {
      cont.innerHTML = '<div class="mnt-tabla-wrap"><p class="mnt-vacio">' +
        (estado.reportes.length ? 'Ningún reporte coincide con los filtros.' : 'Todavía no hay reportes. Usa «Nuevo reporte» para registrar el primero.') + '</p></div>';
      return;
    }
    cont.innerHTML = '<div class="mnt-tabla-wrap"><table class="mnt-tabla"><thead><tr>' +
      '<th>Folio</th><th>Fecha</th><th>Institución</th><th>Daños</th><th>Gravedad</th><th>Estado</th><th></th></tr></thead><tbody>' +
      lista.map(function (r) {
        var items = r[T_ITEMS] || [];
        var porArea = {};
        var max = 0, maxK = '';
        items.forEach(function (i) {
          porArea[i.area] = (porArea[i.area] || 0) + 1;
          var n = GRAV[i.gravedad] ? GRAV[i.gravedad].n : 0;
          if (n > max) { max = n; maxK = i.gravedad; }
        });
        var areas = Object.keys(AREAS).filter(function (k) { return porArea[k]; }).map(function (k) {
          return '<span class="mnt-mini">' + AREAS[k].icono + ' ' + porArea[k] + '</span>';
        }).join('');
        var g = GRAV[maxK];
        var e = ESTADOS[r.estado] || ESTADOS.radicado;
        return '<tr>' +
          '<td class="folio" data-l="Folio">' + esc(r.folio || '—') + '</td>' +
          '<td data-l="Fecha">' + esc(fecha(r.radicado_at, true)) + '</td>' +
          '<td class="inst" data-l="Institución">' + esc(r.institucion_nombre) + '<small>Rector(a): ' + esc(r.rector_nombre) + '</small></td>' +
          '<td class="dan" data-l="Daños"><div class="mnt-areas">' + (areas || '—') + '</div></td>' +
          '<td data-l="Gravedad máx.">' + (g ? '<span class="mnt-badge" style="--c:' + g.c + '">' + g.t + '</span>' : '—') + '</td>' +
          '<td data-l="Estado"><span class="mnt-badge" style="--c:' + e.c + '">' + e.t + '</span></td>' +
          '<td class="acc"><button type="button" class="mnt-btn mnt-btn--sm" data-mver="' + r.id + '">Ver detalle</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  $('#mnt-v-seg').addEventListener('input', function (e) {
    if (e.target.id === 'mnt-q') { filtro.q = e.target.value; pintarLista(); }
  });
  $('#mnt-v-seg').addEventListener('change', function (e) {
    if (e.target.id === 'mnt-fe') { filtro.estado = e.target.value; pintarLista(); }
    if (e.target.id === 'mnt-fa') { filtro.area = e.target.value; pintarLista(); }
  });
  $('#mnt-v-seg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mver]');
    if (b) abrirDetalle(Number(b.getAttribute("data-mver")));
  });

  /* ===================================================================
     Vista: formulario de nuevo reporte
     =================================================================== */
  function llenarInstituciones(sel) {
    var valor = sel.value;
    var col = estado.instituciones.filter(function (i) { return !/^univ/i.test(i.tipo || ''); });
    var uni = estado.instituciones.filter(function (i) { return /^univ/i.test(i.tipo || ''); });
    var op = function (arr) {
      return arr.map(function (i) {
        return '<option value="' + esc(i.id) + '">' + esc(i.nombre) + '</option>';
      }).join('');
    };
    sel.innerHTML = '<option value="">Selecciona la institución…</option>' +
      (col.length ? '<optgroup label="Colegios">' + op(col) + '</optgroup>' : '') +
      (uni.length ? '<optgroup label="Universidades">' + op(uni) + '</optgroup>' : '');
    if (valor) sel.value = valor;
  }

  function pintarFormulario() {
    var v = $('#mnt-v-nuevo');
    estado.fotos = {};
    v.innerHTML =
      '<form class="mnt-form" id="mnt-form" novalidate autocomplete="off">' +
      '<div class="mnt-card"><h3>1 · Institución</h3><p>Selecciona la institución educativa que reporta.</p>' +
      '<div class="mnt-campo"><label for="mnt-inst">Institución <em>*</em></label><select class="mnt-sel" id="mnt-inst" required></select></div>' +
      '<div class="mnt-instinfo" id="mnt-instinfo" hidden></div></div>' +

      '<div class="mnt-card"><h3>2 · Datos del rector(a)</h3><p>Quien firma y responde por el reporte.</p><div class="mnt-grid2">' +
      '<div class="mnt-campo"><label for="mnt-rnombre">Nombre completo <em>*</em></label><input class="mnt-in" id="mnt-rnombre" maxlength="120" autocomplete="name" placeholder="Nombre y apellidos" /></div>' +
      '<div class="mnt-campo"><label for="mnt-rcargo">Cargo</label><input class="mnt-in" id="mnt-rcargo" maxlength="60" value="Rector(a)" /></div>' +
      '<div class="mnt-campo"><label for="mnt-rcorreo">Correo electrónico <em>*</em></label><input class="mnt-in" id="mnt-rcorreo" type="email" inputmode="email" maxlength="120" autocomplete="email" placeholder="rector@institucion.edu.co" /></div>' +
      '<div class="mnt-campo"><label for="mnt-rtel">Teléfono <small>(opcional)</small></label><input class="mnt-in" id="mnt-rtel" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="300 000 0000" /></div>' +
      '</div></div>' +

      '<div class="mnt-card" style="padding-bottom:6px"><h3>3 · Daños reportados</h3><p>Agrega cada daño en el área que corresponda, con su gravedad y al menos una foto de evidencia.</p></div>' +
      Object.keys(AREAS).map(function (k) {
        var a = AREAS[k];
        return '<section class="mnt-area" data-area="' + k + '"><div class="mnt-area__cab"><span class="mnt-area__ico" aria-hidden="true">' + a.icono + '</span>' +
          '<div><h3>' + a.titulo + '</h3><small>' + a.sub + '</small></div><span class="mnt-area__cnt" data-cnt>0 daños</span></div>' +
          '<p class="mnt-area__vacio" data-vacio>Sin daños reportados en esta área.</p><div class="mnt-area__lista" data-lista></div>' +
          '<div class="mnt-area__pie"><button type="button" class="mnt-btn" data-act="add" data-area="' + k + '">＋ Agregar daño de ' + a.titulo.toLowerCase() + '</button></div></section>';
      }).join('') +

      '<div class="mnt-card"><h3>4 · Observaciones generales</h3><p>Opcional: contexto adicional para la Secretaría de Educación.</p>' +
      '<textarea class="mnt-ta" id="mnt-obs" maxlength="1000" placeholder="Ej.: los daños afectan a los grados 9° y 10° desde hace dos semanas…"></textarea></div>' +

      '<div class="mnt-enviar"><p class="mnt-error" id="mnt-err" hidden></p>' +
      '<button type="submit" class="mnt-btn mnt-btn--ac mnt-btn--grande" id="mnt-submit">📄 Enviar reporte y generar PDF</button>' +
      '<p class="mnt-nota">Al enviar se guarda el reporte, se descarga el formato oficial en PDF y se envía una copia por correo a la Secretaría de Educación.</p></div>' +
      '</form>';
    llenarInstituciones($('#mnt-inst'));
  }

  var form = $('#mnt-v-nuevo');

  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'mnt-inst') {
      var i = estado.instituciones.filter(function (x) { return String(x.id) === t.value; })[0];
      var box = $('#mnt-instinfo');
      if (i) {
        box.hidden = false;
        box.innerHTML = '<b>' + esc(i.nombre) + '</b><br>' + esc([etq(i.tipo), etq(i.sector)].filter(Boolean).join(' · ')) +
          (i.direccion ? '<br>📍 ' + esc(i.direccion) : '') + (i.telefono ? '<br>📞 ' + esc(i.telefono) : '');
      } else box.hidden = true;
      t.classList.remove('is-invalid');
    }
    if (t.matches && t.matches('input[type=file][data-f=fotos]')) agregarFotos(t);
  });
  form.addEventListener('input', function (e) { if (e.target.classList) e.target.classList.remove('is-invalid'); });
  form.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'add') agregarItem(b.getAttribute('data-area'));
    if (a === 'quitar') quitarItem(b.closest('.mnt-item'));
    if (a === 'quitar-foto') {
      var it = b.closest('.mnt-item');
      var arr = estado.fotos[it.getAttribute('data-uid')] || [];
      arr.splice(Number(b.getAttribute('data-i')), 1);
      pintarFotos(it);
    }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'mnt-form') enviarReporte();
  });

  function agregarItem(area) {
    var a = AREAS[area];
    var sec = $('.mnt-area[data-area="' + area + '"]', form);
    var uid = 'u' + (++estado.uid);
    estado.fotos[uid] = [];
    var el = document.createElement('div');
    el.className = 'mnt-item';
    el.setAttribute('data-uid', uid);
    el.setAttribute('data-area', area);
    el.innerHTML =
      '<div class="mnt-item__cab"><strong data-n></strong><button type="button" class="mnt-link" data-act="quitar">Quitar este daño</button></div>' +
      '<div class="mnt-campo"><label for="' + uid + '-el">¿Qué se dañó? <em>*</em></label><select class="mnt-sel" id="' + uid + '-el" data-f="elemento">' +
      a.elementos.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="mnt-campo"><span class="mnt-lbl">Gravedad <em>*</em></span><div class="mnt-grav" data-f="gravedad" role="radiogroup" aria-label="Gravedad del daño">' +
      Object.keys(GRAV).map(function (g) {
        return '<label style="--c:' + GRAV[g].c + '"><input type="radio" name="g-' + uid + '" value="' + g + '"><span><b>' + GRAV[g].t + '</b><small>' + GRAV[g].d + '</small></span></label>';
      }).join('') + '</div></div>' +
      '<div class="mnt-campo"><label for="' + uid + '-d">Descripción del problema <em>*</em></label>' +
      '<textarea class="mnt-ta" id="' + uid + '-d" data-f="descripcion" maxlength="600" placeholder="Describe qué ocurre, dónde está y desde cuándo (mínimo 10 caracteres)…"></textarea></div>' +
      '<div class="mnt-campo"><span class="mnt-lbl">Evidencia fotográfica <em>*</em> <small>(1 a ' + MAX_FOTOS + ' fotos)</small></span><div class="mnt-fotos" data-fotos></div></div>';
    $('[data-lista]', sec).appendChild(el);
    pintarFotos(el);
    renumerar(sec);
    var s = $('select', el);
    if (s) s.focus({ preventScroll: false });
  }

  function quitarItem(el) {
    if (!el) return;
    var sec = el.closest('.mnt-area');
    delete estado.fotos[el.getAttribute('data-uid')];
    el.remove();
    renumerar(sec);
  }

  function renumerar(sec) {
    var items = $$('.mnt-item', sec);
    items.forEach(function (it, i) { $('[data-n]', it).textContent = 'Daño ' + (i + 1); });
    var cnt = $('[data-cnt]', sec);
    cnt.textContent = items.length + (items.length === 1 ? ' daño' : ' daños');
    cnt.classList.toggle('on', items.length > 0);
    $('[data-vacio]', sec).hidden = items.length > 0;
  }

  function pintarFotos(it) {
    var uid = it.getAttribute('data-uid');
    var arr = estado.fotos[uid] || [];
    var cont = $('[data-fotos]', it);
    cont.classList.remove('is-invalid');
    cont.innerHTML = arr.map(function (f, i) {
      return '<div class="mnt-foto"><img src="' + f.dataUrl + '" alt="Evidencia ' + (i + 1) + '"><button type="button" data-act="quitar-foto" data-i="' + i + '" aria-label="Quitar foto ' + (i + 1) + '">✕</button></div>';
    }).join('') +
      (arr.length < MAX_FOTOS ? '<label class="mnt-foto-add"><input type="file" accept="image/*" multiple data-f="fotos"><b>＋</b><span>Foto</span></label>' : '');
  }

  async function agregarFotos(input) {
    var it = input.closest('.mnt-item');
    var uid = it.getAttribute('data-uid');
    var arr = estado.fotos[uid] || (estado.fotos[uid] = []);
    var archivos = Array.prototype.slice.call(input.files || []);
    input.value = '';
    for (var k = 0; k < archivos.length; k++) {
      if (arr.length >= MAX_FOTOS) { aviso('Máximo ' + MAX_FOTOS + ' fotos por daño.', 'mal'); break; }
      try { arr.push(await comprimir(archivos[k])); }
      catch (err) { aviso(err.message || 'No se pudo cargar la foto.', 'mal'); }
    }
    pintarFotos(it);
  }

  function comprimir(file) {
    return new Promise(function (ok, fail) {
      if (!/^image\//.test(file.type || '')) return fail(new Error('«' + file.name + '» no es una imagen.'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, MAX_LADO / Math.max(w, h));
        w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        cv.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) return fail(new Error('No se pudo procesar la imagen.'));
          var fr = new FileReader();
          fr.onload = function () { ok({ blob: blob, dataUrl: fr.result, w: w, h: h, name: file.name }); };
          fr.onerror = function () { fail(new Error('No se pudo leer la imagen.')); };
          fr.readAsDataURL(blob);
        }, 'image/jpeg', CALIDAD);
      };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('«' + file.name + '» no es una imagen válida.')); };
      img.src = url;
    });
  }

  /* ---- validación y lectura del formulario ---- */
  function leerFormulario() {
    var errores = [];
    var primero = null;
    var marca = function (el, msg) { if (el) { el.classList.add('is-invalid'); if (!primero) primero = el; } if (msg && errores.indexOf(msg) < 0) errores.push(msg); };
    var $v = function (id) { return ($('#' + id).value || '').trim(); };

    var inst = estado.instituciones.filter(function (x) { return String(x.id) === $('#mnt-inst').value; })[0];
    if (!inst) marca($('#mnt-inst'), 'Selecciona la institución.');
    var rn = $v('mnt-rnombre'); if (rn.length < 5) marca($('#mnt-rnombre'), 'Escribe el nombre completo del rector(a).');
    var rc = $v('mnt-rcorreo'); if (!correoValido(rc)) marca($('#mnt-rcorreo'), 'Escribe un correo electrónico válido del rector(a).');

    var items = [];
    $$('.mnt-item', form).forEach(function (el) {
      var uid = el.getAttribute('data-uid');
      var g = $('input[type=radio]:checked', el);
      var d = $('[data-f=descripcion]', el);
      var fotos = estado.fotos[uid] || [];
      if (!g) marca($('[data-f=gravedad]', el), 'Indica la gravedad de cada daño.');
      if (d.value.trim().length < 10) marca(d, 'Describe cada daño (mínimo 10 caracteres).');
      if (!fotos.length) marca($('[data-fotos]', el), 'Cada daño necesita al menos una foto de evidencia.');
      items.push({
        uid: uid, area: el.getAttribute('data-area'), elemento: $('[data-f=elemento]', el).value,
        gravedad: g ? g.value : null, descripcion: d.value.trim(), fotos: fotos
      });
    });
    if (!items.length) errores.push('Agrega al menos un daño en equipos, mobiliario o infraestructura.');
    return { errores: errores, primero: primero, inst: inst, rector: { nombre: rn, cargo: $v('mnt-rcargo') || 'Rector(a)', correo: rc, tel: $v('mnt-rtel') }, obs: $v('mnt-obs'), items: items };
  }

  function mostrarError(msg) {
    var e = $('#mnt-err');
    if (!e) return;
    e.hidden = !msg;
    e.innerHTML = msg || '';
  }

  /* ---- pasos de progreso ---- */
  var PASOS = ['Guardando el reporte', 'Subiendo las evidencias', 'Generando el PDF oficial', 'Enviando copia a la Secretaría de Educación'];
  function pasos(idx, fallo) {
    $('#mnt-pasos').innerHTML = PASOS.map(function (t, i) {
      var c = i < idx ? 'ok' : (i === idx ? (fallo ? 'mal' : 'act') : '');
      return '<li class="' + c + '">' + t + '</li>';
    }).join('');
  }
  function progreso(on) { $('#mnt-prog').classList.toggle('on', on); estado.enviando = on; }

  /* ---- envío ---- */
  async function enviarReporte() {
    if (estado.enviando) return;
    var c = cliente();
    mostrarError('');
    if (!c) { mostrarError('No hay conexión con Supabase. Inicia sesión de nuevo.'); return; }
    $$('.is-invalid', form).forEach(function (x) { x.classList.remove('is-invalid'); });
    var d = leerFormulario();
    if (d.errores.length) {
      mostrarError('<b>Revisa el formulario:</b><br>• ' + d.errores.map(esc).join('<br>• '));
      if (d.primero) {
        d.primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (d.primero.focus) d.primero.focus({ preventScroll: true });
      }
      return;
    }

    progreso(true);
    pasos(0);
    var rep = null;
    try {
      /* 1. Reporte */
      var ins = await c.from(T_REP).insert([{
        institucion_id: d.inst.id, institucion_nombre: d.inst.nombre, institucion_tipo: d.inst.tipo || null,
        institucion_sector: d.inst.sector || null, institucion_direccion: d.inst.direccion || null, institucion_telefono: d.inst.telefono || null,
        rector_nombre: d.rector.nombre, rector_cargo: d.rector.cargo, rector_correo: d.rector.correo, rector_telefono: d.rector.tel || null,
        observaciones: d.obs || null
      }]).select().single();
      if (ins.error) throw ins.error;
      rep = ins.data;

      /* 2. Fotos + daños */
      pasos(1);
      var filas = [];
      for (var i = 0; i < d.items.length; i++) {
        var it = d.items[i];
        var urls = [];
        for (var j = 0; j < it.fotos.length; j++) {
          var ruta = rep.folio + '/' + it.area + '-' + (i + 1) + '-' + (j + 1) + '.jpg';
          var up = await c.storage.from(BUCKET).upload(ruta, it.fotos[j].blob, { contentType: 'image/jpeg', upsert: true });
          if (up.error) throw up.error;
          var pub = c.storage.from(BUCKET).getPublicUrl(ruta);
          urls.push(pub.data.publicUrl);
        }
        filas.push({ reporte_id: rep.id, area: it.area, elemento: it.elemento, descripcion: it.descripcion, gravedad: it.gravedad, evidencias: urls });
      }
      var gi = await c.from(T_ITEMS).insert(filas).select();
      if (gi.error) throw gi.error;
      var itemsDB = (gi.data || filas).slice().sort(function (a, b) { return (a.id || 0) - (b.id || 0); });

      /* 3. PDF (con las fotos ya en memoria) */
      pasos(2);
      var fotosLocal = {};
      itemsDB.forEach(function (row, k) { fotosLocal[k] = d.items[k].fotos.map(function (f) { return { dataUrl: f.dataUrl, w: f.w, h: f.h }; }); });
      var mail;
      var nombre = nombreArchivo(rep);
      try {
        var doc = await generarPDF(rep, itemsDB, fotosLocal);
        var b64 = pdfBase64(doc);
        try { doc.save(nombre); } catch (e) { console.warn('[mantenimiento] descarga', e); }
        /* 4. Correo */
        pasos(3);
        mail = await enviarCorreo(rep.id, b64, nombre);
      } catch (ePdf) {
        console.error('[mantenimiento] pdf', ePdf);
        mail = { ok: false, motivo: 'no se pudo generar el PDF (' + (ePdf.message || ePdf) + ')' };
      }
      pasos(4);
      await new Promise(function (r) { setTimeout(r, 350); });
      progreso(false);
      await cargarReportes();
      mostrarExito(rep, mail);
    } catch (err) {
      console.error('[mantenimiento] envío', err);
      var paso = $$('#mnt-pasos li.act').length ? $$('#mnt-pasos li').indexOf($('#mnt-pasos li.act')) : 0;
      if (paso < 0) paso = 0;
      pasos(paso, true);
      // Si el reporte quedó a medias, se elimina para no dejar registros incompletos.
      if (rep && rep.id) { try { await c.from(T_REP).delete().eq('id', rep.id); } catch (e2) { /* sin acción */ } }
      await new Promise(function (r) { setTimeout(r, 1200); });
      progreso(false);
      var detalle = (err && err.message) || 'Error desconocido';
      var ayuda = /row-level security|policy/i.test(detalle)
        ? (paso === 1
          ? 'Faltan los permisos de la carpeta de fotos (bucket «' + BUCKET + '»). Ejecuta completo mantenimiento.sql en Supabase (sección 5) o cierra sesión y vuelve a entrar.'
          : 'Faltan los permisos de las tablas de reportes. Ejecuta completo mantenimiento.sql en Supabase o cierra sesión y vuelve a entrar.')
        : /does not exist|not found/i.test(detalle)
          ? 'Falta crear las tablas o el bucket: ejecuta completo mantenimiento.sql en Supabase.'
          : 'Intenta de nuevo; tus datos y fotos siguen en el formulario.';
      mostrarError('<b>No se pudo enviar el reporte</b> (falló: ' + esc(PASOS[paso].toLowerCase()) + ').<br>' + esc(detalle) + '<br>' + esc(ayuda));
      aviso('No se pudo enviar el reporte.', 'mal');
      cargarReportes();
    }
  }

  function mostrarExito(rep, mail) {
    var v = $('#mnt-v-nuevo');
    v.innerHTML =
      '<div class="mnt-exito" id="mnt-exito"><div class="mnt-exito__ico" aria-hidden="true">✓</div>' +
      '<h3>Reporte radicado</h3><div class="folio">' + esc(rep.folio) + '</div>' +
      '<p class="mnt-nota" style="margin-bottom:14px">' + esc(rep.institucion_nombre) + ' · ' + esc(fecha(rep.radicado_at)) + '</p>' +
      '<div class="mnt-estado-correo ' + (mail.ok ? 'ok' : 'mal') + '" id="mnt-correo-estado">' + textoCorreo(mail) + '</div>' +
      '<div class="mnt-exito__acc">' +
      '<button type="button" class="mnt-btn mnt-btn--ac" data-ex="pdf" data-id="' + rep.id + '">⬇ Descargar PDF otra vez</button>' +
      (mail.ok ? '' : '<button type="button" class="mnt-btn" data-ex="mail" data-id="' + rep.id + '">✉ Reintentar envío del correo</button>') +
      '<button type="button" class="mnt-btn" data-ex="seg">📋 Ver en seguimiento</button>' +
      '<button type="button" class="mnt-btn" data-ex="otro">＋ Registrar otro reporte</button></div></div>';
    $('#mnt-cuerpo').scrollTop = 0;
    aviso('Reporte ' + rep.folio + ' radicado.', 'ok');
  }
  function textoCorreo(m) {
    return m.ok ? '✉ Se envió una copia a la Secretaría de Educación.'
      : '⚠ El reporte quedó guardado y el PDF se descargó, pero <b>no se pudo enviar el correo</b>: ' + esc(m.motivo || 'error desconocido') +
      '. Puedes reintentar el envío.';
  }
  $('#mnt-v-nuevo').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-ex]');
    if (!b) return;
    var a = b.getAttribute('data-ex');
    if (a === 'seg') irATab('seguimiento');
    if (a === 'otro') pintarFormulario();
    if (a === 'pdf') descargarPDF(Number(b.getAttribute('data-id')), b);
    if (a === 'mail') {
      var r = await reenviarCorreo(Number(b.getAttribute('data-id')), b);
      var box = $('#mnt-correo-estado');
      if (box) { box.className = 'mnt-estado-correo ' + (r.ok ? 'ok' : 'mal'); box.innerHTML = textoCorreo(r); }
      if (r.ok) b.remove();
    }
  });

  /* ===================================================================
     Detalle de un reporte
     =================================================================== */
  async function abrirDetalle(id) {
    var c = cliente();
    var rep = estado.reportes.filter(function (r) { return r.id === id; })[0];
    if (!rep || !c) return;
    estado.detalleId = id;
    var det = $('#mnt-detalle');
    det.innerHTML = '<div class="mnt-detalle__cab"><h3>' + esc(rep.folio) + '<small>' + esc(rep.institucion_nombre) + '</small></h3>' +
      '<button type="button" class="mnt-x" data-d="cerrar" aria-label="Volver">✕</button></div>' +
      '<div class="mnt-detalle__cuerpo"><p class="mnt-vacio">Cargando…</p></div>';
    det.classList.add('on');
    var r = await c.from(T_ITEMS).select('*').eq('reporte_id', id).order('id');
    if (r.error) { $('.mnt-detalle__cuerpo', det).innerHTML = '<p class="mnt-error">' + esc(r.error.message) + '</p>'; return; }
    pintarDetalle(rep, r.data || []);
  }
  function cerrarDetalle() { $('#mnt-detalle').classList.remove('on'); estado.detalleId = null; }

  function pintarDetalle(rep, items) {
    var det = $('#mnt-detalle');
    var e = ESTADOS[rep.estado] || ESTADOS.radicado;
    var grupos = Object.keys(AREAS).map(function (k) {
      var lista = items.filter(function (i) { return i.area === k; });
      if (!lista.length) return '';
      return '<h4 style="margin:6px 0 0;font-size:14px;color:#fff">' + AREAS[k].icono + ' ' + AREAS[k].titulo + ' <small style="color:var(--mnt-mut);font-weight:500">· ' + AREAS[k].sub + '</small></h4>' +
        lista.map(function (i, n) {
          var g = GRAV[i.gravedad] || GRAV.media;
          var fotos = Array.isArray(i.evidencias) ? i.evidencias : [];
          return '<div class="mnt-dano"><div class="mnt-dano__cab"><span class="cod">' + AREAS[k].pref + '-' + (n + 1) + '</span><b>' + esc(i.elemento || 'Daño') + '</b>' +
            '<span class="mnt-badge" style="--c:' + g.c + '">Gravedad ' + g.t.toLowerCase() + '</span></div>' +
            '<p>' + esc(i.descripcion) + '</p><div class="mnt-fotos">' +
            fotos.map(function (u, m) { return '<div class="mnt-foto" data-zoom="' + esc(u) + '"><img loading="lazy" src="' + esc(u) + '" alt="Evidencia ' + (m + 1) + ' de ' + esc(i.elemento || 'daño') + '"></div>'; }).join('') + '</div></div>';
        }).join('');
    }).join('');

    var linea = [['radicado', 'Radicado', rep.radicado_at], ['en_revision', 'En revisión', rep.revision_at], ['resuelto', 'Resuelto', rep.resuelto_at]]
      .map(function (p) {
        return '<li class="' + (p[2] ? 'on' : '') + '" style="--c:' + ESTADOS[p[0]].c + '"><b>' + p[1] + '</b>' + (p[2] ? esc(fecha(p[2])) : 'Pendiente') + '</li>';
      }).join('');

    var correo = rep.correo_enviado
      ? '✉ Copia enviada a la Secretaría el ' + esc(fecha(rep.correo_enviado_at))
      : '✉ La copia por correo aún no se ha enviado' + (rep.correo_error ? ' (' + esc(rep.correo_error) + ')' : '') + '.';

    $('.mnt-detalle__cuerpo', det).innerHTML = '<div class="mnt-detalle__in">' +
      '<div class="mnt-card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px"><h3 style="margin:0">Datos del reporte</h3>' +
      '<span class="mnt-badge" style="--c:' + e.c + '">' + e.t + '</span></div><dl class="mnt-dl">' +
      '<div><dt>Institución</dt><dd>' + esc(rep.institucion_nombre) + '</dd></div>' +
      '<div><dt>Tipo y sector</dt><dd>' + esc([etq(rep.institucion_tipo), etq(rep.institucion_sector)].filter(Boolean).join(' · ') || '—') + '</dd></div>' +
      '<div><dt>Dirección</dt><dd>' + esc(rep.institucion_direccion || '—') + '</dd></div>' +
      '<div><dt>Fecha de radicación</dt><dd>' + esc(fecha(rep.radicado_at)) + '</dd></div>' +
      '<div><dt>Rector(a)</dt><dd>' + esc(rep.rector_nombre) + ' <span style="color:var(--mnt-mut)">(' + esc(rep.rector_cargo || 'Rector(a)') + ')</span></dd></div>' +
      '<div><dt>Contacto</dt><dd>' + esc([rep.rector_correo, rep.rector_telefono].filter(Boolean).join(' · ') || '—') + '</dd></div></dl>' +
      (rep.observaciones ? '<p class="mnt-nota" style="margin-top:12px"><b style="color:#fff">Observaciones:</b> ' + esc(rep.observaciones) + '</p>' : '') + '</div>' +
      '<ul class="mnt-linea">' + linea + '</ul>' +
      '<div class="mnt-card"><h3>Daños reportados (' + items.length + ')</h3><div style="display:grid;gap:12px;margin-top:10px">' + (grupos || '<p class="mnt-vacio">Sin daños.</p>') + '</div></div>' +
      '<div class="mnt-card mnt-seg"><h3>Seguimiento</h3>' +
      '<div class="mnt-campo"><label for="mnt-d-estado">Estado de la solicitud</label><select class="mnt-sel" id="mnt-d-estado">' +
      Object.keys(ESTADOS).map(function (k) { return '<option value="' + k + '"' + (rep.estado === k ? ' selected' : '') + '>' + ESTADOS[k].t + '</option>'; }).join('') + '</select></div>' +
      '<div class="mnt-campo"><label for="mnt-d-nota">Nota de seguimiento <small>(opcional)</small></label><textarea class="mnt-ta" id="mnt-d-nota" maxlength="600" placeholder="Ej.: Se programó visita técnica para el lunes…">' + esc(rep.nota_seguimiento || '') + '</textarea></div>' +
      '<button type="button" class="mnt-btn mnt-btn--ac" data-d="guardar">💾 Guardar estado</button></div>' +
      '<div class="mnt-card"><h3>Documento y correo</h3><p class="mnt-nota" id="mnt-d-correo" style="margin-bottom:12px">' + correo + '</p>' +
      '<div class="mnt-det-acc"><button type="button" class="mnt-btn mnt-btn--ac" data-d="pdf">⬇ Descargar PDF</button>' +
      '<button type="button" class="mnt-btn" data-d="mail">✉ ' + (rep.correo_enviado ? 'Reenviar a la Secretaría' : 'Enviar a la Secretaría') + '</button></div></div></div>';
  }

  $('#mnt-detalle').addEventListener('click', async function (e) {
    var z = e.target.closest('[data-zoom]');
    if (z) { $('img', lightbox).src = z.getAttribute('data-zoom'); lightbox.classList.add('on'); return; }
    var b = e.target.closest('[data-d]');
    if (!b) return;
    var a = b.getAttribute('data-d');
    var id = estado.detalleId;
    if (a === 'cerrar') cerrarDetalle();
    if (a === 'pdf') descargarPDF(id, b);
    if (a === 'mail') {
      var r = await reenviarCorreo(id, b);
      var p = $('#mnt-d-correo');
      if (p) p.innerHTML = r.ok ? '✉ Copia enviada a la Secretaría de Educación.' : '⚠ No se pudo enviar: ' + esc(r.motivo || 'error desconocido');
      aviso(r.ok ? 'Correo enviado a la Secretaría.' : 'No se pudo enviar el correo.', r.ok ? 'ok' : 'mal');
      await cargarReportes();
    }
    if (a === 'guardar') {
      var c = cliente();
      b.disabled = true;
      var nuevo = $('#mnt-d-estado').value;
      var nota = $('#mnt-d-nota').value.trim() || null;
      var u = await c.from(T_REP).update({ estado: nuevo, nota_seguimiento: nota }).eq('id', id);
      b.disabled = false;
      if (u.error) { aviso('No se pudo guardar: ' + u.error.message, 'mal'); return; }
      aviso('Estado actualizado: ' + ESTADOS[nuevo].t + '.', 'ok');
      await cargarReportes();
      abrirDetalle(id);
    }
  });

  /* ===================================================================
     Datos completos de un reporte (para PDF y correo)
     =================================================================== */
  async function reporteCompleto(id) {
    var c = cliente();
    var a = await c.from(T_REP).select('*').eq('id', id).single();
    if (a.error) throw a.error;
    var b = await c.from(T_ITEMS).select('*').eq('reporte_id', id).order('id');
    if (b.error) throw b.error;
    return { rep: a.data, items: b.data || [] };
  }

  async function cargarFotosRemotas(items) {
    var out = {};
    for (var k = 0; k < items.length; k++) {
      var urls = Array.isArray(items[k].evidencias) ? items[k].evidencias : [];
      var res = await Promise.all(urls.map(function (u) { return urlAImagen(u).catch(function () { return null; }); }));
      out[k] = res.filter(Boolean);
    }
    return out;
  }
  function urlAImagen(u) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(function (blob) {
      return new Promise(function (ok, fail) {
        var fr = new FileReader();
        fr.onload = function () {
          var im = new Image();
          im.onload = function () { ok({ dataUrl: fr.result, w: im.naturalWidth, h: im.naturalHeight }); };
          im.onerror = fail;
          im.src = fr.result;
        };
        fr.onerror = fail;
        fr.readAsDataURL(blob);
      });
    });
  }

  function nombreArchivo(rep) { return 'Reporte-' + rep.folio + '-' + slug(rep.institucion_nombre) + '.pdf'; }
  function pdfBase64(doc) {
    var s = doc.output('datauristring');
    return s.slice(s.indexOf('base64,') + 7);
  }

  async function descargarPDF(id, btn) {
    var txt = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Generando PDF…'; }
    try {
      var d = await reporteCompleto(id);
      var doc = await generarPDF(d.rep, d.items, await cargarFotosRemotas(d.items));
      doc.save(nombreArchivo(d.rep));
    } catch (e) {
      console.error(e);
      aviso('No se pudo generar el PDF: ' + (e.message || e), 'mal');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
  }

  async function reenviarCorreo(id, btn) {
    var txt = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Enviando…'; }
    var res;
    try {
      var d = await reporteCompleto(id);
      var doc = await generarPDF(d.rep, d.items, await cargarFotosRemotas(d.items));
      res = await enviarCorreo(id, pdfBase64(doc), nombreArchivo(d.rep));
    } catch (e) { res = { ok: false, motivo: e.message || String(e) }; }
    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
    return res;
  }

  async function enviarCorreo(id, base64, nombre) {
    var c = cliente();
    if (!c || !c.functions) return { ok: false, motivo: 'El cliente de Supabase no permite funciones.' };
    try {
      var r = await c.functions.invoke(FUNCION_CORREO, { body: { reporte_id: id, filename: nombre, pdf_base64: base64 } });
      if (r.error) {
        var msg = r.error.message || 'Error al invocar la función.';
        try { if (r.error.context && r.error.context.json) { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } } catch (e) { /* sin detalle */ }
        if (/not found|404|Failed to send a request|FunctionsFetchError/i.test(msg)) msg = 'la función de correo «' + FUNCION_CORREO + '» no está desplegada o no responde';
        return { ok: false, motivo: msg };
      }
      if (r.data && r.data.error) return { ok: false, motivo: r.data.error };
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: e.message || String(e) };
    }
  }

  /* ===================================================================
     PDF — formato oficial
     =================================================================== */
  var _escudo;
  function escudoPNG() {
    if (_escudo !== undefined) return Promise.resolve(_escudo);
    return new Promise(function (ok) {
      try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--escudo') || '';
        var m = v.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
        if (!m) { _escudo = null; return ok(null); }
        var im = new Image();
        im.onload = function () {
          var cv = document.createElement('canvas');
          cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          cv.getContext('2d').drawImage(im, 0, 0);
          _escudo = { dataUrl: cv.toDataURL('image/png'), w: im.naturalWidth, h: im.naturalHeight };
          ok(_escudo);
        };
        im.onerror = function () { _escudo = null; ok(null); };
        im.src = m[1];
      } catch (e) { _escudo = null; ok(null); }
    });
  }

  async function generarPDF(rep, items, fotos) {
    var lib = window.jspdf && window.jspdf.jsPDF;
    if (!lib) throw new Error('No se cargó la librería de PDF (jsPDF). Revisa tu conexión a internet.');
    var doc = new lib({ unit: 'mm', format: 'a4', compress: true });
    if (typeof doc.autoTable !== 'function') throw new Error('No se cargó jsPDF-AutoTable.');
    var W = 210, H = 297, M = 15, CW = W - 2 * M, PIE = 18;
    var VERDE = [12, 100, 52], CLARO = [231, 243, 226], GRIS = [90, 100, 94];
    var y = 0;
    var escudo = await escudoPNG();
    var estadoTxt = (ESTADOS[rep.estado] || ESTADOS.radicado).t;

    /* ---- cabecera ---- */
    doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
    doc.rect(0, 0, W, 4, 'F');
    if (escudo) {
      var eh = 25, ew = eh * escudo.w / escudo.h;
      doc.addImage(escudo.dataUrl, 'PNG', M, 9, ew, eh);
    }
    doc.setTextColor(20, 40, 28);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('ALCALDÍA DE SABANETA', 92, 15, { align: 'center' });
    doc.setFontSize(10.5);
    doc.text('SECRETARÍA DE EDUCACIÓN', 92, 21, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text('FORMATO OFICIAL DE REPORTE DE ESTADO Y FALLAS', 92, 28, { align: 'center' });
    doc.text('DE LA INSTITUCIÓN EDUCATIVA', 92, 33, { align: 'center' });
    // recuadro folio
    var bx = W - M - 50;
    doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]); doc.setLineWidth(0.5);
    doc.roundedRect(bx, 9, 50, 27, 2, 2, 'S');
    doc.setFontSize(7.5); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]); doc.setFont('helvetica', 'bold');
    doc.text('FOLIO', bx + 25, 14, { align: 'center' });
    doc.setFontSize(11.5); doc.setTextColor(VERDE[0], VERDE[1], VERDE[2]);
    doc.text(String(rep.folio || '—'), bx + 25, 20.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(60, 70, 64);
    doc.text('Radicado: ' + fechaPDF(rep.radicado_at), bx + 25, 26.5, { align: 'center' });
    doc.text('Estado: ' + estadoTxt, bx + 25, 31, { align: 'center' });
    doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]); doc.setLineWidth(0.7);
    doc.line(M, 40, W - M, 40);
    y = 46;

    var asegurar = function (h) { if (y + h > H - PIE) { doc.addPage(); y = 22; } };
    var titulo = function (t) {
      asegurar(14);
      doc.setFillColor(CLARO[0], CLARO[1], CLARO[2]);
      doc.rect(M, y, CW, 7, 'F');
      doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
      doc.rect(M, y, 1.6, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(VERDE[0], VERDE[1], VERDE[2]);
      doc.text(t, M + 4, y + 4.9);
      y += 10;
    };
    var tabla = function (opts) {
      doc.autoTable(Object.assign({
        startY: y, margin: { left: M, right: M, top: 22, bottom: PIE }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.9, lineColor: [200, 212, 202], lineWidth: 0.2, textColor: [25, 35, 29], overflow: 'linebreak' },
        headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold', halign: 'left' }
      }, opts));
      y = doc.lastAutoTable.finalY + 6;
    };
    var par = { fontStyle: 'bold', fillColor: [244, 248, 244], textColor: [40, 60, 48] };

    /* ---- 1. institución ---- */
    titulo('1. DATOS DE LA INSTITUCIÓN');
    tabla({
      body: [
        [{ content: 'Institución', styles: par }, { content: rep.institucion_nombre || '—', colSpan: 3 }],
        [{ content: 'Tipo', styles: par }, etq(rep.institucion_tipo) || '—', { content: 'Sector', styles: par }, etq(rep.institucion_sector) || '—'],
        [{ content: 'Dirección', styles: par }, rep.institucion_direccion || '—', { content: 'Teléfono', styles: par }, rep.institucion_telefono || '—']
      ],
      columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 28 } }
    });

    /* ---- 2. rector ---- */
    titulo('2. DATOS DEL RECTOR(A) QUE REPORTA');
    tabla({
      body: [
        [{ content: 'Nombre', styles: par }, rep.rector_nombre || '—', { content: 'Cargo', styles: par }, rep.rector_cargo || 'Rector(a)'],
        [{ content: 'Correo', styles: par }, rep.rector_correo || '—', { content: 'Teléfono', styles: par }, rep.rector_telefono || '—']
      ],
      columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 28 } }
    });

    /* ---- 3. resumen ---- */
    titulo('3. RESUMEN DE DAÑOS REPORTADOS');
    var cuenta = function (area, g) {
      return items.filter(function (i) { return (!area || i.area === area) && (!g || i.gravedad === g); }).length;
    };
    var filas = Object.keys(AREAS).map(function (k) {
      return [AREAS[k].titulo + ' (' + AREAS[k].sub.toLowerCase() + ')', cuenta(k), cuenta(k, 'baja'), cuenta(k, 'media'), cuenta(k, 'alta'), cuenta(k, 'critica')];
    });
    filas.push([{ content: 'TOTAL', styles: { fontStyle: 'bold' } }, { content: cuenta(), styles: { fontStyle: 'bold' } }, cuenta(null, 'baja'), cuenta(null, 'media'), cuenta(null, 'alta'), cuenta(null, 'critica')]);
    tabla({
      head: [['Área', 'Daños', 'Baja', 'Media', 'Alta', 'Crítica']],
      body: filas,
      columnStyles: { 0: { cellWidth: 70 }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } }
    });

    /* ---- 4. detalle por área ---- */
    titulo('4. DETALLE DE LOS DAÑOS POR ÁREA');
    var codigos = {};
    Object.keys(AREAS).forEach(function (k) {
      var lista = [];
      items.forEach(function (it, idx) { if (it.area === k) lista.push({ it: it, idx: idx }); });
      if (!lista.length) return;
      asegurar(30);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 50, 38);
      doc.text(AREAS[k].titulo.toUpperCase() + ' — ' + AREAS[k].sub, M, y + 3);
      y += 5;
      lista.forEach(function (o, n) { codigos[o.idx] = AREAS[k].pref + '-' + (n + 1); });
      tabla({
        head: [['Cód.', 'Elemento', 'Gravedad', 'Descripción', 'Fotos']],
        body: lista.map(function (o) {
          return [codigos[o.idx], o.it.elemento || '—', (GRAV[o.it.gravedad] || GRAV.media).t, o.it.descripcion || '', String((fotos[o.idx] || []).length)];
        }),
        columnStyles: { 0: { cellWidth: 14, fontStyle: 'bold' }, 1: { cellWidth: 38 }, 2: { cellWidth: 20, fontStyle: 'bold' }, 4: { cellWidth: 16, halign: 'center' } },
        didParseCell: function (d) {
          if (d.section === 'body' && d.column.index === 2) {
            var g = lista[d.row.index].it.gravedad;
            if (GRAV[g]) d.cell.styles.textColor = GRAV[g].rgb;
          }
        }
      });
    });

    /* ---- 5. registro fotográfico ---- */
    var conFotos = items.map(function (it, idx) { return { it: it, idx: idx }; }).filter(function (o) { return (fotos[o.idx] || []).length; });
    if (conFotos.length) {
      titulo('5. REGISTRO FOTOGRÁFICO (EVIDENCIAS)');
      var BW = 57, BH = 43, GAP = (CW - 3 * BW) / 2;
      conFotos.forEach(function (o) {
        asegurar(BH + 14);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(30, 50, 38);
        doc.text(codigos[o.idx] + ' · ' + (o.it.elemento || 'Daño') + ' — gravedad ' + (GRAV[o.it.gravedad] || GRAV.media).t.toLowerCase(), M, y + 3);
        y += 6;
        (fotos[o.idx] || []).forEach(function (f, n) {
          var col = n % 3;
          if (n > 0 && col === 0) y += BH + 8;
          asegurar(BH + 8);
          var x = M + col * (BW + GAP);
          doc.setDrawColor(200, 212, 202); doc.setLineWidth(0.2);
          doc.rect(x, y, BW, BH);
          var k = Math.min((BW - 2) / f.w, (BH - 2) / f.h);
          var iw = f.w * k, ih = f.h * k;
          try { doc.addImage(f.dataUrl, 'JPEG', x + (BW - iw) / 2, y + (BH - ih) / 2, iw, ih, undefined, 'FAST'); } catch (e) { /* foto omitida */ }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
          doc.text('Evidencia ' + (n + 1), x, y + BH + 3.5);
        });
        y += BH + 9;
      });
    }

    /* ---- observaciones ---- */
    if (rep.observaciones) {
      titulo((conFotos.length ? '6' : '5') + '. OBSERVACIONES GENERALES');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(25, 35, 29);
      var lineas = doc.splitTextToSize(rep.observaciones, CW);
      lineas.forEach(function (ln) { asegurar(6); doc.text(ln, M, y + 3); y += 5; });
      y += 4;
    }

    /* ---- firmas ---- */
    asegurar(48);
    y += 14;
    doc.setDrawColor(40, 60, 48); doc.setLineWidth(0.3);
    var fw = (CW - 14) / 2;
    doc.line(M, y, M + fw, y);
    doc.line(M + fw + 14, y, W - M, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(25, 35, 29);
    doc.text(rep.rector_nombre || '', M + fw / 2, y + 5, { align: 'center', maxWidth: fw });
    doc.text('Secretaría de Educación de Sabaneta', M + fw + 14 + fw / 2, y + 5, { align: 'center', maxWidth: fw });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    doc.text((rep.rector_cargo || 'Rector(a)') + ' — ' + (rep.institucion_nombre || ''), M + fw / 2, y + 9.5, { align: 'center', maxWidth: fw });
    doc.text('Recibido / radicado', M + fw + 14 + fw / 2, y + 9.5, { align: 'center', maxWidth: fw });

    /* ---- pie y encabezado de páginas ---- */
    var total = doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      if (p > 1) {
        doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]); doc.rect(0, 0, W, 2.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
        doc.text('Reporte de estado y fallas · ' + (rep.folio || ''), M, 11);
        doc.setFont('helvetica', 'normal');
        doc.text(String(rep.institucion_nombre || ''), W - M, 11, { align: 'right', maxWidth: 110 });
        doc.setDrawColor(200, 212, 202); doc.setLineWidth(0.2); doc.line(M, 14, W - M, 14);
      }
      doc.setDrawColor(200, 212, 202); doc.setLineWidth(0.2); doc.line(M, H - 14, W - M, H - 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
      doc.text('Documento generado electrónicamente por el Geovisor Sabaneta el ' + fechaPDF(new Date()), M, H - 9.5);
      doc.text('Página ' + p + ' de ' + total, W - M, H - 9.5, { align: 'right' });
    }
    return doc;
  }

  /* ===================================================================
     Arranque: carga el indicador cuando el administrador ya inició sesión
     =================================================================== */
  function pantallaVisible() { return adminScreen && !adminScreen.hidden; }
  function iniciar() {
    tarjeta.hidden = false;
    pintarTarjeta();
    if (!estado.cargado) cargarReportes();
  }
  if (adminScreen) {
    if (pantallaVisible()) iniciar();
    new MutationObserver(function () {
      if (pantallaVisible()) iniciar();
      else { tarjeta.hidden = true; cerrar(); }
    }).observe(adminScreen, { attributes: true, attributeFilter: ['hidden'] });
    setInterval(function () { if (pantallaVisible() && !estado.enviando && document.visibilityState === 'visible') cargarReportes(); }, 60000);
  }

  window.MantenimientoSabaneta = {
    abrir: abrir, cerrar: cerrar, recargar: cargarReportes,
    porcentaje: function () { return stats().pct; }
  };
})();