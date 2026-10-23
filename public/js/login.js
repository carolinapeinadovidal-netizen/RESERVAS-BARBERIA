const form = document.getElementById('form-login');
const alerta = document.getElementById('alerta');
const boton = document.getElementById('btn-entrar');

function mostrarAlerta(texto) {
  alerta.textContent = texto;
  alerta.hidden = !texto;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const usuario = form.usuario.value.trim();
  const contrasena = form.contrasena.value;
  if (!usuario || !contrasena) return mostrarAlerta('Escribe tu usuario y tu contraseña.');

  boton.disabled = true;
  boton.textContent = 'Entrando…';
  mostrarAlerta('');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasena }),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(datos.error || 'No se pudo iniciar sesión.');
    location.href = '/gestion';
  } catch (e) {
    mostrarAlerta(e.message);
    form.contrasena.value = '';
    form.contrasena.focus();
    boton.disabled = false;
    boton.textContent = 'Iniciar sesión';
  }
});
