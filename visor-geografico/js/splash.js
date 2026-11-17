// EduMap · pantalla de presentación: se muestra antes del geovisor y se cierra con el botón.
(function () {
  var splash = document.getElementById('landing-screen');
  var boton = document.getElementById('btn-acceder-geovisor');
  if (!splash || !boton) return;

  function visible() { return getComputedStyle(splash).display !== 'none'; }
  function actualizar() { document.body.classList.toggle('splash-activo', visible()); }

  function cerrar() {
    splash.classList.add('landing--oculto');
    document.body.classList.remove('splash-activo');
    setTimeout(function () {
      splash.style.display = 'none';
      window.dispatchEvent(new Event('resize'));   // Leaflet recalcula el tamaño del mapa
    }, 450);
  }

  boton.addEventListener('click', cerrar);
  // Si otro script (o la URL con #) oculta la pantalla, se libera el scroll.
  new MutationObserver(actualizar).observe(splash, { attributes: true, attributeFilter: ['style', 'class'] });
  actualizar();
  if (visible()) setTimeout(function () { boton.focus({ preventScroll: true }); }, 400);
})();
