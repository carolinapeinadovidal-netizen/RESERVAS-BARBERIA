// Si hay un barbero con sesión, el botón de login pasa a "Gestión Citas"
(async () => {
  try {
    const res = await fetch('/api/sesion');
    const { barbero } = await res.json();
    if (barbero) {
      const boton = document.getElementById('btn-login');
      boton.href = '/gestion';
      boton.textContent = 'Gestión Citas';

      const salir = document.createElement('button');
      salir.type = 'button';
      salir.className = 'btn btn--ghost';
      salir.textContent = 'Cerrar sesión';
      salir.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
      });
      boton.after(salir);
    }
  } catch { /* sin sesión: se queda "Iniciar sesión" */ }
})();

// Carga la carta de servicios desde el servidor

(async () => {
  const cont = document.getElementById('menu-servicios');
  const euros = (n) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`;

  try {
    const res = await fetch('/api/servicios');
    if (!res.ok) throw new Error();
    const servicios = await res.json();

    const card = document.createElement('div');
    card.className = 'menu-card menu-card--single';
    card.innerHTML = '<h3 class="menu-card__title">Carta de servicios</h3>';

    const tabla = document.createElement('table');
    tabla.className = 'menu-table';
    const cuerpo = tabla.createTBody();

    for (const s of servicios) {
      const fila = cuerpo.insertRow();
      const nombre = fila.insertCell();
      const enlace = document.createElement('a');
      enlace.href = `/reserva?servicio=${s.id}`;
      enlace.textContent = s.nombre;
      const dur = document.createElement('small');
      dur.textContent = ` · ${s.duracion} min`;
      nombre.append(enlace, dur);
      fila.insertCell().className = 'dots';
      const precio = fila.insertCell();
      precio.className = 'price';
      precio.textContent = s.precio != null ? euros(s.precio) : '';
    }

    card.append(tabla);
    cont.replaceChildren(card);
  } catch {
    cont.innerHTML = '<p class="loading">No se pudo cargar la carta. Inténtalo más tarde.</p>';
  }
})();
