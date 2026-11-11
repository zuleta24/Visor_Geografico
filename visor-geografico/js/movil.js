/**
 * movil.js
 * ------------------------------------------------------------------
 * Comportamiento de celular para todas las páginas (index, comparador y
 * administración). Trabaja junto con css/responsive.css.
 *
 *   1. Menú hamburguesa en la barra superior (≤ 860 px).
 *   2. En el visor: botón flotante «Capas y búsqueda» que abre el panel
 *      como una hoja desde abajo (≤ 760 px), y se cierra solo al elegir
 *      una institución en el buscador.
 *   3. El selector de mapa base/capas de Leaflet pasa a ser un icono que se
 *      abre al tocarlo (en vez de ocupar media pantalla).
 *
 * Uso: <script src="js/movil.js"></script> al FINAL del <body>, después de
 * los demás scripts. No modifica ningún otro archivo ni función.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.__movilListo) return;
  window.__movilListo = true;

  var esMenuMovil = window.matchMedia('(max-width: 860px)');
  var esCelular = window.matchMedia('(max-width: 760px)');
  var esTablet = window.matchMedia('(max-width: 1024px)');

  function alCambiar(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  /* ---------------------------------------------------------------
     1) Menú hamburguesa
     --------------------------------------------------------------- */
  var nav = document.querySelector('.top-navbar');
  var enlaces = nav && nav.querySelector('.top-navbar__links');
  var cerrarMenu = function () {};

  if (nav && enlaces) {
    if (!enlaces.id) enlaces.id = 'mv-menu-principal';

    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'mv-nav-toggle';
    boton.setAttribute('aria-label', 'Abrir menú');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-controls', enlaces.id);
    boton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
        '<path class="mv-l1" d="M4 6h16"/><path class="mv-l2" d="M4 12h16"/><path class="mv-l3" d="M4 18h16"/>' +
      '</svg>';
    nav.appendChild(boton);

    var ponerMenu = function (abierto) {
      nav.classList.toggle('is-open', abierto);
      boton.setAttribute('aria-expanded', String(abierto));
      boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    };
    cerrarMenu = function () { ponerMenu(false); };

    boton.addEventListener('click', function (e) {
      e.stopPropagation();
      var abrir = !nav.classList.contains('is-open');
      if (abrir && typeof window.__cerrarPanelCapas === 'function') window.__cerrarPanelCapas();
      ponerMenu(abrir);
    });
    enlaces.addEventListener('click', function (e) {
      if (e.target.closest('a')) ponerMenu(false);
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('is-open') && !nav.contains(e.target)) ponerMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { ponerMenu(false); boton.focus(); }
    });
    alCambiar(esMenuMovil, function () { ponerMenu(false); });
  }

  /* ---------------------------------------------------------------
     2) Visor: panel de capas como hoja inferior
     --------------------------------------------------------------- */
  var app = document.getElementById('app');
  var panel = app && app.querySelector('.sidebar');
  var mapa = app && app.querySelector('.map-container');

  if (panel && mapa) {
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'mv-fab';
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'mv-hoja');
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 3 2 8.5l10 5.5 10-5.5L12 3z"/><path d="m2 13.5 10 5.5 10-5.5"/></svg>' +
      '<span>Capas y búsqueda</span>';
    mapa.appendChild(fab);

    var fondo = document.createElement('div');
    fondo.className = 'mv-backdrop';
    document.body.appendChild(fondo);

    panel.id = panel.id || 'mv-hoja';
    fab.setAttribute('aria-controls', panel.id);

    var cabecera = document.createElement('div');
    cabecera.className = 'mv-sheet-head';
    cabecera.innerHTML =
      '<span class="mv-grab" aria-hidden="true"></span>' +
      '<strong>Capas y búsqueda</strong>' +
      '<button type="button" class="mv-sheet-close" aria-label="Cerrar panel">✕</button>';
    panel.insertBefore(cabecera, panel.firstChild);

    var abrirPanel = function (abierto) {
      document.body.classList.toggle('mv-sheet-open', abierto);
      fab.setAttribute('aria-expanded', String(abierto));
      if (abierto) cerrarMenu();
      else if (panel.contains(document.activeElement)) document.activeElement.blur();
    };
    window.__cerrarPanelCapas = function () { abrirPanel(false); };

    fab.addEventListener('click', function () { abrirPanel(true); });
    fondo.addEventListener('click', function () { abrirPanel(false); });
    cabecera.querySelector('.mv-sheet-close').addEventListener('click', function () { abrirPanel(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('mv-sheet-open')) abrirPanel(false);
    });
    // Al elegir una institución en el buscador, se cierra el panel para ver el mapa.
    panel.addEventListener('click', function (e) {
      if (esCelular.matches && e.target.closest('.buscador__item')) setTimeout(function () { abrirPanel(false); }, 60);
    });
    alCambiar(esCelular, function () { abrirPanel(false); });
  }

  /* ---------------------------------------------------------------
     3) Selector de mapa base y capas (Leaflet): icono que se abre al tocar
     --------------------------------------------------------------- */
  var intentos = 0;
  (function prepararControlCapas() {
    var control = document.querySelector('.leaflet-control-layers');
    if (!control) {
      if (document.querySelector('.leaflet-container') && ++intentos < 24) setTimeout(prepararControlCapas, 250);
      else if (!document.querySelector('.leaflet-container') && ++intentos < 24) setTimeout(prepararControlCapas, 250);
      return;
    }
    if (control.__movil) return;
    control.__movil = true;

    var icono = control.querySelector('.leaflet-control-layers-toggle');
    if (icono) {
      icono.addEventListener('click', function (e) {
        if (!esTablet.matches) return;
        e.preventDefault();
        e.stopPropagation();
        control.classList.add('mv-abierto');
      }, true);
    }
    document.addEventListener('click', function (e) {
      if (control.classList.contains('mv-abierto') && !control.contains(e.target)) control.classList.remove('mv-abierto');
    });
    document.addEventListener('touchstart', function (e) {
      if (control.classList.contains('mv-abierto') && !control.contains(e.target)) control.classList.remove('mv-abierto');
    }, { passive: true });
    alCambiar(esTablet, function () { control.classList.remove('mv-abierto'); });
  })();
})();