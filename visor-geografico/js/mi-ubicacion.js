/**
 * mi-ubicacion.js
 * ------------------------------------------------------------------
 * Botón «Mi ubicación» en la barra de herramientas del mapa.
 * Marca en el mapa dónde está la persona y, durante unos segundos,
 * sigue afinando la lectura del GPS hasta quedarse con la más exacta.
 *
 * Solo necesita Leaflet y la variable global `map` de main.js.
 * Los estilos van incluidos en este mismo archivo.
 * ------------------------------------------------------------------
 */
(function () {
  if (window.__miUbicacion) return;
  window.__miUbicacion = true;

  // Ajustes (se pueden cambiar definiendo window.UBICACION_CONFIG antes de cargar este archivo)
  const CFG = Object.assign({
    precisionObjetivo: 20,   // metros: al llegar a esta precisión se deja de buscar
    tiempoMax: 15000,        // milisegundos máximos buscando una mejor señal
    zoomMax: 18,
  }, window.UBICACION_CONFIG);

  const ICONO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';

  const MENSAJES = {
    1: 'No diste permiso para usar tu ubicación. Actívalo para este sitio en tu navegador (candado junto a la dirección) y vuelve a intentarlo.',
    2: 'No pudimos determinar dónde estás. Revisa que el GPS o la conexión estén activos e inténtalo de nuevo.',
    3: 'Tardó demasiado en obtener tu ubicación. Inténtalo de nuevo.',
  };

  // ----------------------------------------------------------------
  // Estilos
  // ----------------------------------------------------------------
  const estilos = document.createElement('style');
  estilos.textContent = `
    .ubic-barra.leaflet-bar { border: 0; background: transparent; box-shadow: none; }
    .ubic-btn {
      width: 36px; height: 36px; padding: 0; display: grid; place-items: center; cursor: pointer;
      color: var(--text-primary, #eef5ea); background: rgba(6, 16, 10, .9);
      border: 1px solid var(--border-subtle, #21412e); border-radius: 9px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, .35); transition: color .15s, border-color .15s, background .15s;
    }
    .ubic-btn:hover { color: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .ubic-btn:focus-visible { outline: 2px solid var(--accent, #69b544); outline-offset: 2px; }
    .ubic-btn.is-on { color: var(--accent-ink, #08210f); background: var(--accent, #69b544); border-color: var(--accent, #69b544); }
    .ubic-btn.is-busy { color: var(--accent, #69b544); border-color: var(--accent, #69b544); cursor: progress; }
    .ubic-btn.is-busy svg { animation: ubic-giro 1s linear infinite; }
    @keyframes ubic-giro { to { transform: rotate(360deg); } }

    .ubic-icono { background: none; border: 0; }
    .ubic-icono { cursor: grab; }
    .ubic-icono:active { cursor: grabbing; }
    .ubic-pin { position: relative; width: 34px; height: 44px; }
    .ubic-pin svg { position: absolute; inset: 0; filter: drop-shadow(0 3px 4px rgba(0, 0, 0, .5)); }
    .ubic-pulso {
      position: absolute; left: 17px; bottom: 2px; width: 18px; height: 18px; margin-left: -9px;
      border-radius: 50%; background: rgba(245, 195, 36, .55); animation: ubic-pulso 2s ease-out infinite;
    }
    @keyframes ubic-pulso { 0% { transform: scale(.4); opacity: .95; } 100% { transform: scale(2.8); opacity: 0; } }

    .ubic-popup { min-width: 210px; font-size: 13px; line-height: 1.5; }
    .ubic-popup strong { display: block; margin-bottom: 6px; font-size: 14px; color: var(--sab-amarillo, #f5c324); }
    .ubic-popup dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0 0 8px; }
    .ubic-popup dt { color: var(--text-secondary, #9fb8a6); }
    .ubic-popup dd { margin: 0; text-align: right; font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; }
    .ubic-popup p { margin: 0 0 8px; padding: 6px 9px; border-radius: 7px; background: rgba(245, 195, 36, .14); color: #f6dc84; font-size: 12px; }
    .ubic-popup p.ubic-popup__tip { background: transparent; color: var(--text-secondary, #9fb8a6); padding: 0; }
    .ubic-popup__acciones { display: flex; gap: 6px; }
    .ubic-popup__acciones button {
      flex: 1; min-height: 36px; padding: 6px 10px; border-radius: 8px; cursor: pointer;
      border: 1px solid var(--border-subtle, #21412e); background: rgba(255, 255, 255, .06);
      color: var(--text-primary, #eef5ea); font-family: inherit; font-size: 12px; font-weight: 600;
    }
    .ubic-popup__acciones button:hover { border-color: var(--accent, #69b544); color: var(--accent, #69b544); }

    .ubic-aviso {
      position: fixed; z-index: 10050; left: 50%; top: calc(var(--nav-h, 64px) + 12px);
      width: max-content; max-width: min(440px, calc(100vw - 24px)); padding: 12px 16px;
      transform: translate(-50%, -8px); opacity: 0; pointer-events: none;
      border-radius: 12px; border: 1px solid var(--accent, #69b544); background: #0b1f13; color: #eef5ea;
      box-shadow: 0 12px 32px rgba(0, 0, 0, .45); font-size: 13.5px; line-height: 1.45;
      transition: opacity .2s ease, transform .2s ease;
    }
    .ubic-aviso.visible { opacity: 1; transform: translate(-50%, 0); }
    .ubic-aviso.error { border-color: #e5484d; }
    @media (prefers-reduced-motion: reduce) { .ubic-pulso, .ubic-btn.is-busy svg { animation: none; } }
  `;
  document.head.appendChild(estilos);

  // ----------------------------------------------------------------
  // Estado
  // ----------------------------------------------------------------
  let boton = null;
  let marcador = null;
  let circulo = null;
  let mejor = null;          // lectura más precisa obtenida hasta ahora
  let vigilancia = null;     // id de watchPosition
  let temporizador = null;   // fin de la búsqueda
  let ultimoError = null;
  let buscando = false;
  let avisoEl = null;
  let avisoTimer = null;

  const obtenerMapa = () => (typeof map !== 'undefined' && map ? map : null);
  const sinMovimiento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----------------------------------------------------------------
  // Aviso breve
  // ----------------------------------------------------------------
  function aviso(texto, error, fijo) {
    if (!avisoEl) {
      avisoEl = document.createElement('div');
      avisoEl.className = 'ubic-aviso';
      avisoEl.setAttribute('role', 'status');
      document.body.appendChild(avisoEl);
    }
    avisoEl.textContent = texto;
    avisoEl.classList.toggle('error', !!error);
    avisoEl.classList.add('visible');
    clearTimeout(avisoTimer);
    if (!fijo) avisoTimer = setTimeout(ocultarAviso, 7000);
  }
  function ocultarAviso() {
    clearTimeout(avisoTimer);
    if (avisoEl) avisoEl.classList.remove('visible');
  }

  function pintarBoton() {
    boton.classList.toggle('is-busy', buscando);
    boton.classList.toggle('is-on', !buscando && !!marcador);
    boton.setAttribute('aria-pressed', String(!buscando && !!marcador));
  }

  // ----------------------------------------------------------------
  // Dibujo en el mapa
  // ----------------------------------------------------------------
  function iconoPin() {
    return L.divIcon({
      className: 'ubic-icono',
      html: '<div class="ubic-pin"><span class="ubic-pulso"></span>' +
            '<svg viewBox="0 0 34 44" aria-hidden="true"><path d="M17 42C17 42 3 27.5 3 16.5a14 14 0 0 1 28 0C31 27.5 17 42 17 42z" fill="#f5c324" stroke="#0c6434" stroke-width="2.5"/><circle cx="17" cy="16.5" r="5.2" fill="#0c6434"/></svg></div>',
      iconSize: [34, 44], iconAnchor: [17, 42], popupAnchor: [0, -38],
    });
  }

  function calidad(m) {
    if (m <= 20) return 'muy precisa';
    if (m <= 50) return 'buena';
    if (m <= 100) return 'aproximada';
    return 'poco precisa';
  }

  function contenido(p) {
    const nota = p.manual
      ? '<p>Posición ajustada manualmente. Puedes volver a arrastrar el pin si hace falta.</p>'
      : (p.precision > 100
        ? '<p>Tu dispositivo está usando Wi-Fi o la red, no GPS, por eso el margen de error es grande. En un celular con el GPS activado y a cielo abierto suele bajar a menos de 20 m.</p>'
        : '') + '<p class="ubic-popup__tip">¿No es exactamente aquí? Arrastra el pin hasta tu posición real.</p>';
    return '<div class="ubic-popup"><strong>Tu ubicación</strong>' +
      '<dl><dt>Latitud</dt><dd>' + p.lat.toFixed(6) + '°</dd>' +
      '<dt>Longitud</dt><dd>' + p.lon.toFixed(6) + '°</dd>' +
      '<dt>Precisión</dt><dd>' + (p.manual ? 'Ajustada a mano' : '± ' + Math.round(p.precision) + ' m (' + calidad(p.precision) + ')') + '</dd></dl>' +
      nota +
      '<div class="ubic-popup__acciones">' +
        '<button type="button" data-ubic="copiar">Copiar coordenadas</button>' +
        '<button type="button" data-ubic="quitar">Quitar</button>' +
      '</div></div>';
  }

  function zoomPara(m) {
    return Math.max(14, Math.min(CFG.zoomMax, m.getMaxZoom() || CFG.zoomMax, m.getBoundsZoom(circulo.getBounds())));
  }

  function irA(m, punto) {
    const z = zoomPara(m);
    if (sinMovimiento()) m.setView(punto, z);
    else m.flyTo(punto, z, { duration: 0.9 });
  }

  function dibujar(p, primera) {
    const m = obtenerMapa();
    const punto = L.latLng(p.lat, p.lon);
    if (!marcador) {
      circulo = L.circle(punto, {
        radius: p.precision, color: '#f5c324', weight: 1.5, dashArray: '4 4',
        fillColor: '#f5c324', fillOpacity: 0.14, interactive: false,
      }).addTo(m);
      marcador = L.marker(punto, { icon: iconoPin(), title: 'Tu ubicación', alt: 'Tu ubicación', zIndexOffset: 2000, keyboard: false, draggable: true }).addTo(m);
      marcador.bindPopup('', { maxWidth: 290, autoPanPadding: [20, 70] });
      marcador.on('dragstart', () => { detener(); ocultarAviso(); marcador.closePopup(); });
      marcador.on('drag', () => { if (circulo) circulo.setLatLng(marcador.getLatLng()); });
      marcador.on('dragend', ajustadoAMano);
    } else {
      marcador.setLatLng(punto);
      circulo.setLatLng(punto);
      circulo.setRadius(p.precision);
      circulo.setStyle({ opacity: 1, fillOpacity: 0.14 });
    }
    if (primera) irA(m, punto);
  }

  // El usuario arrastró el pin: esa posición manda y se deja de buscar con el GPS.
  function ajustadoAMano() {
    const q = marcador.getLatLng();
    mejor = { lat: q.lat, lon: q.lng, precision: 0, manual: true, t: Date.now() };
    if (circulo) { circulo.setLatLng(q); circulo.setRadius(1); circulo.setStyle({ opacity: 0, fillOpacity: 0 }); }
    marcador.setPopupContent(contenido(mejor));
    marcador.openPopup();
  }

  function quitar() {
    const m = obtenerMapa();
    detener();
    if (m && marcador) m.removeLayer(marcador);
    if (m && circulo) m.removeLayer(circulo);
    marcador = circulo = mejor = null;
    pintarBoton();
  }

  // ----------------------------------------------------------------
  // Búsqueda de la mejor señal
  // ----------------------------------------------------------------
  function detener() {
    if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
    vigilancia = null;
    clearTimeout(temporizador);
    buscando = false;
    if (boton) pintarBoton();
  }

  function terminar() {
    const m = obtenerMapa();
    detener();
    ocultarAviso();
    if (!mejor || !marcador) return;
    marcador.setPopupContent(contenido(mejor));
    irA(m, marcador.getLatLng());                    // reencuadra con la precisión definitiva
    setTimeout(() => { if (marcador) marcador.openPopup(); }, sinMovimiento() ? 50 : 900);
  }

  function rendirse(error) {
    if (mejor && !(error && error.code === 1)) return terminar();   // ya hay una lectura utilizable
    detener();
    aviso(MENSAJES[error && error.code] || 'No fue posible obtener tu ubicación.', true);
  }

  function alRecibir(pos) {
    const lectura = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      precision: pos.coords.accuracy > 0 ? pos.coords.accuracy : 9999,
      t: Date.now(),
    };
    // Solo se conserva la lectura más precisa; las peores se descartan.
    if (!mejor || lectura.precision <= mejor.precision) {
      const primera = !mejor;
      mejor = lectura;
      dibujar(mejor, primera);
    }
    if (mejor.precision <= CFG.precisionObjetivo) return terminar();
    aviso('Afinando tu ubicación… precisión actual ± ' + Math.round(mejor.precision) + ' m', false, true);
  }

  // Un error puntual (el GPS pierde la señal un momento) no es el final: se sigue esperando.
  // Solo el permiso denegado corta de inmediato.
  function alFallar(error) {
    if (error.code === 1) rendirse(error);
    else ultimoError = error;
  }

  function localizar() {
    const m = obtenerMapa();
    if (!m) return aviso('El mapa todavía se está cargando. Inténtalo en un momento.', true);
    if (buscando) return;
    if (!('geolocation' in navigator)) return aviso('Tu navegador no permite obtener la ubicación.', true);
    if (window.isSecureContext === false) return aviso('La ubicación solo funciona en páginas seguras (https).', true);

    m.closePopup();
    mejor = null;
    ultimoError = null;
    buscando = true;
    pintarBoton();
    aviso('Buscando tu ubicación…', false, true);

    // watchPosition entrega lecturas sucesivas: la primera suele ser aproximada (Wi-Fi/red)
    // y las siguientes mejoran cuando el GPS engancha. maximumAge 0 evita lecturas guardadas.
    vigilancia = navigator.geolocation.watchPosition(alRecibir, alFallar, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
    });
    temporizador = setTimeout(() => (mejor ? terminar() : rendirse(ultimoError || { code: 3 })), CFG.tiempoMax);
  }

  // ----------------------------------------------------------------
  // Botones de la ventana emergente
  // ----------------------------------------------------------------
  function copiar(texto, el) {
    const listo = () => { const t = el.textContent; el.textContent = '¡Copiado!'; setTimeout(() => { el.textContent = t; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(listo, () => {});
    }
  }

  document.addEventListener('click', (e) => {
    const accion = e.target.closest && e.target.closest('[data-ubic]');
    if (!accion) return;
    if (accion.dataset.ubic === 'quitar') {
      obtenerMapa().closePopup();
      quitar();
    } else if (accion.dataset.ubic === 'copiar' && marcador) {
      const p = marcador.getLatLng();
      copiar(p.lat.toFixed(6) + ', ' + p.lng.toFixed(6), accion);
    }
  });

  // ----------------------------------------------------------------
  // El botón en la barra de herramientas del mapa
  // ----------------------------------------------------------------
  function ponerBoton(m) {
    const barra = L.DomUtil.create('div', 'leaflet-bar ubic-barra');
    boton = L.DomUtil.create('button', 'ubic-btn', barra);
    boton.type = 'button';
    boton.id = 'btn-mi-ubicacion';
    boton.title = 'Mostrar mi ubicación';
    boton.setAttribute('aria-label', 'Mostrar mi ubicación en el mapa');
    boton.setAttribute('aria-pressed', 'false');
    boton.innerHTML = ICONO;
    boton.addEventListener('click', localizar);

    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() { L.DomEvent.disableClickPropagation(barra); return barra; },
    });
    const control = new Control().addTo(m);

    // Si existe la barra de coordenadas y mediciones, el botón queda justo debajo de ella.
    const herramientas = document.querySelector('.hm-barra');
    if (herramientas) herramientas.after(control.getContainer());
  }

  // Se espera al mapa (y unos instantes a la barra de herramientas, para quedar en su sitio).
  let intentos = 0;
  (function esperar() {
    const m = obtenerMapa();
    if (m && window.L && (document.querySelector('.hm-barra') || intentos++ > 10)) ponerBoton(m);
    else setTimeout(esperar, 300);
  })();

  // ----------------------------------------------------------------
  // Para otros módulos (por ejemplo «Cómo llegar»)
  // ----------------------------------------------------------------
  // Posición del pin si está en el mapa (la que la persona ajustó o la mejor medida).
  function actual() {
    if (!marcador) return null;
    const q = marcador.getLatLng();
    return { lat: q.lat, lon: q.lng, precision: mejor ? mejor.precision : 9999, manual: !!(mejor && mejor.manual), t: (mejor && mejor.t) || 0 };
  }

  // Coloca el pin en un punto elegido por la persona (por ejemplo, tocando el mapa).
  function fijar(lat, lon) {
    detener();
    ocultarAviso();
    mejor = { lat, lon, precision: 1, manual: true, t: Date.now() };
    dibujar(mejor, false);
    if (circulo) circulo.setStyle({ opacity: 0, fillOpacity: 0 });
    marcador.setPopupContent(contenido(mejor));
    pintarBoton();
    return actual();
  }

  // Mide la ubicación y devuelve la lectura más precisa que llegue (o null si no hay permiso o señal).
  // Termina cuando llega una lectura buena, cuando la precisión deja de mejorar (unos 2,5 s)
  // o al agotarse el tiempo máximo. Con dibujar:true deja el pin en el mapa para poder corregirlo.
  function medir(opciones) {
    const o = Object.assign({ tiempo: 8000, objetivo: 25, estable: 2500, dibujar: false }, opciones);
    return new Promise((resolve) => {
      if (!('geolocation' in navigator) || window.isSecureContext === false) return resolve(null);
      let mejorLectura = null;
      let id = null;
      let fin = false;
      let relojMax = null;
      let relojEstable = null;
      function cerrar() {
        if (fin) return;
        fin = true;
        if (id !== null) navigator.geolocation.clearWatch(id);
        clearTimeout(relojMax);
        clearTimeout(relojEstable);
        ocultarAviso();
        if (o.dibujar && mejorLectura && obtenerMapa() && !(mejor && mejor.manual)) {
          mejor = mejorLectura;
          dibujar(mejor, false);
          marcador.setPopupContent(contenido(mejor));
          pintarBoton();
        }
        resolve(mejorLectura);
      }
      aviso('Calculando tu ubicación…', false, true);
      relojMax = setTimeout(cerrar, o.tiempo);
      id = navigator.geolocation.watchPosition((pos) => {
        const l = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy > 0 ? pos.coords.accuracy : 9999, t: Date.now() };
        const mejora = !mejorLectura || l.precision < mejorLectura.precision * 0.9;
        if (!mejorLectura || l.precision <= mejorLectura.precision) mejorLectura = l;
        if (mejorLectura.precision <= o.objetivo) return cerrar();
        if (mejora) { clearTimeout(relojEstable); relojEstable = setTimeout(cerrar, o.estable); }
      }, (error) => { if (error.code === 1) cerrar(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: o.tiempo });
    });
  }

  window.MiUbicacion = { localizar, quitar, actual, medir, fijar };
})();