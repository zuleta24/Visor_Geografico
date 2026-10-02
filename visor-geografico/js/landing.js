/**
 * landing.js
 * ------------------------------------------------------------------
 * Controla la transición de la pantalla de bienvenida hacia el
 * geovisor. Agrega este <script src="js/landing.js"></script> en
 * index.html DESPUÉS del script que crea el mapa de Leaflet (para que
 * la variable global `map` ya exista cuando se haga clic).
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', () => {
  const landing = document.getElementById('landing-screen');
  const btnAcceder = document.getElementById('btn-acceder-geovisor');

  if (!landing || !btnAcceder) return;

  btnAcceder.addEventListener('click', () => {
    landing.classList.add('landing--oculto');

    // Espera a que termine la transición de opacidad (0.5s, definida en CSS)
    // antes de quitar la pantalla del flujo y recalcular el tamaño del mapa.
    setTimeout(() => {
      landing.style.display = 'none';

      // El mapa se inicializa mientras está tapado por la pantalla de
      // bienvenida; Leaflet necesita que le avisen el tamaño real una
      // vez el contenedor queda visible, o se ve gris/recortado.
      if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
    }, 500);
  });
});