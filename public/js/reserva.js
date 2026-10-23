// Reserva de cita en dos pasos. Toda la comunicación va contra /api (el servidor habla con Supabase).

const DIAS_ANTELACION = 60;
const DIAS_ABIERTO = [2, 3, 4, 5, 6]; // martes a sábado

const estado = {
  barberos: [],
  servicios: [],
  barbero: null,
  servicio: null,
  fecha: null,
  hora: null,
};

const $ = (sel) => document.querySelector(sel);
const euros = (n) => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function el(tag, attrs = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') nodo.className = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else nodo.setAttribute(k, v);
  }
  nodo.append(...hijos);
  return nodo;
}

async function api(url, opciones) {
  const res = await fetch(url, opciones);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(datos.error || 'Error inesperado'), { status: res.status });
  return datos;
}

function mostrarAlerta(texto) {
  const alerta = $('#alerta');
  alerta.textContent = texto;
  alerta.hidden = !texto;
  if (texto) alerta.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- Paso 1 ----------

function pintarBarberos() {
  const cont = $('#lista-barberos');
  cont.replaceChildren(...estado.barberos.map((b) =>
    el('button', {
      type: 'button',
      class: 'choice choice--barber',
      'aria-pressed': String(estado.barbero?.id === b.id),
      onclick: () => { estado.barbero = b; pintarBarberos(); actualizarPaso1(); },
    },
    el('img', {
      class: 'choice__photo',
      src: IMAGENES.barberos[b.id] || IMAGENES.barberoPorDefecto,
      alt: `Foto de ${b.nombre}`,
      loading: 'lazy',
    }),
    el('span', { class: 'choice__name' }, b.nombre),
    el('span', { class: 'choice__sub' }, b.apellidos || ''))
  ));
}

function pintarServicios() {
  const cont = $('#lista-servicios');
  cont.replaceChildren(...estado.servicios.map((s) =>
    el('button', {
      type: 'button',
      class: 'choice choice--service',
      'aria-pressed': String(estado.servicio?.id === s.id),
      onclick: () => { estado.servicio = s; pintarServicios(); actualizarPaso1(); },
    },
    el('img', {
      class: 'choice__thumb',
      src: IMAGENES.servicios[s.id] || IMAGENES.servicioPorDefecto,
      alt: '',
      loading: 'lazy',
    }),
    el('span', { class: 'choice__info' },
      el('strong', {}, s.nombre),
      el('small', {}, `${s.duracion} min`)),
    el('span', { class: 'choice__price' }, s.precio != null ? euros(s.precio) : ''))
  ));
}

function actualizarPaso1() {
  $('#btn-paso2').disabled = !(estado.barbero && estado.servicio);
}

// ---------- Paso 2 ----------

function irAPaso(n) {
  $('#paso1').hidden = n !== 1;
  $('#paso2').hidden = n !== 2;
  $('#confirmacion').hidden = n !== 3;
  document.querySelectorAll('.stepper__step').forEach((li) => {
    const paso = Number(li.dataset.step);
    li.classList.toggle('is-active', paso === n);
    li.classList.toggle('is-done', paso < n);
  });
  mostrarAlerta('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pintarResumen() {
  const { barbero, servicio } = estado;
  $('#resumen').replaceChildren(
    el('p', {},
      el('strong', {}, servicio.nombre),
      ` · ${servicio.duracion} min · ${euros(servicio.precio)}`,
      el('br'),
      `con ${barbero.nombre} ${barbero.apellidos || ''}`),
    el('button', { type: 'button', class: 'summary__link', onclick: () => irAPaso(1) }, 'Cambiar')
  );
}

function pintarDias() {
  const dias = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (let i = 0; i <= DIAS_ANTELACION; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    if (DIAS_ABIERTO.includes(d.getDay())) dias.push(d);
  }

  $('#lista-dias').replaceChildren(...dias.map((d) => {
    const fecha = iso(d);
    return el('button', {
      type: 'button',
      class: 'day',
      role: 'option',
      'aria-selected': String(estado.fecha === fecha),
      onclick: () => seleccionarDia(fecha),
    },
    el('span', { class: 'day__dow' }, d.toLocaleDateString('es-ES', { weekday: 'short' })),
    el('span', { class: 'day__num' }, d.getDate()),
    el('span', { class: 'day__mon' }, d.toLocaleDateString('es-ES', { month: 'short' })));
  }));
}

async function seleccionarDia(fecha) {
  estado.fecha = fecha;
  estado.hora = null;
  actualizarConfirmar();
  const scroll = $('#lista-dias').scrollLeft;
  pintarDias();
  $('#lista-dias').scrollLeft = scroll;
  await cargarHuecos();
}

async function cargarHuecos() {
  const cont = $('#lista-huecos');
  cont.replaceChildren(el('p', { class: 'hint' }, 'Buscando huecos libres…'));
  try {
    const params = new URLSearchParams({
      barbero: estado.barbero.id,
      servicio: estado.servicio.id,
      fecha: estado.fecha,
    });
    const { huecos } = await api(`/api/disponibilidad?${params}`);
    pintarHuecos(huecos);
  } catch (e) {
    cont.replaceChildren(el('p', { class: 'hint' }, 'No se pudieron cargar los huecos.'));
    mostrarAlerta(e.message);
  }
}

function pintarHuecos(huecos) {
  const cont = $('#lista-huecos');
  if (!huecos.length) {
    cont.replaceChildren(el('p', { class: 'hint' }, 'No quedan huecos libres este día. Prueba con otro día.'));
    return;
  }
  const manana = huecos.filter((h) => h < '15:00');
  const tarde = huecos.filter((h) => h >= '15:00');
  const boton = (h) => el('button', {
    type: 'button',
    class: 'slot',
    'aria-pressed': String(estado.hora === h),
    onclick: () => { estado.hora = h; pintarHuecos(huecos); actualizarConfirmar(); },
  }, h);

  const nodos = [];
  if (manana.length) nodos.push(el('p', { class: 'slots__group' }, 'Mañana'), ...manana.map(boton));
  if (tarde.length) nodos.push(el('p', { class: 'slots__group' }, 'Tarde'), ...tarde.map(boton));
  cont.replaceChildren(...nodos);
}

function actualizarConfirmar() {
  $('#btn-confirmar').disabled = !(estado.fecha && estado.hora);
}

function validarFormulario(form) {
  const nombre = form.nombre.value.trim();
  const telefono = form.telefono.value.replace(/[\s-]/g, '');
  const okNombre = nombre.length >= 2;
  const okTel = /^\+?\d{9,15}$/.test(telefono);
  form.nombre.setAttribute('aria-invalid', String(!okNombre));
  form.telefono.setAttribute('aria-invalid', String(!okTel));
  if (!okNombre) return 'Escribe tu nombre.';
  if (!okTel) return 'Escribe un teléfono válido (mínimo 9 dígitos).';
  return null;
}

async function confirmar(ev) {
  ev.preventDefault();
  const form = ev.target;
  const error = validarFormulario(form);
  if (error) return mostrarAlerta(error);

  const boton = $('#btn-confirmar');
  boton.disabled = true;
  boton.textContent = 'Reservando…';
  mostrarAlerta('');

  try {
    const cita = await api('/api/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barbero: estado.barbero.id,
        servicio: estado.servicio.id,
        fecha: estado.fecha,
        hora: estado.hora,
        nombre: form.nombre.value,
        apellidos: form.apellidos.value,
        telefono: form.telefono.value,
      }),
    });
    pintarTicket(cita);
    irAPaso(3);
  } catch (e) {
    mostrarAlerta(e.message);
    if (e.status === 409) {
      estado.hora = null;
      await cargarHuecos();
    }
  } finally {
    boton.textContent = 'Confirmar cita';
    actualizarConfirmar();
  }
}

function pintarTicket(cita) {
  const fechaLarga = new Date(`${cita.fecha}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const filas = [
    ['Cliente', cita.nombre],
    ['Barbero', cita.barbero],
    ['Servicio', `${cita.servicio} (${cita.duracion} min)`],
    ['Día', fechaLarga],
    ['Hora', cita.hora],
    ['Precio', cita.precio != null ? euros(cita.precio) : '—'],
  ];
  $('#ticket').replaceChildren(el('dl', {}, ...filas.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));
}

// ---------- Inicio ----------

async function iniciar() {
  try {
    const [barberos, servicios] = await Promise.all([api('/api/barberos'), api('/api/servicios')]);
    estado.barberos = barberos;
    estado.servicios = servicios;

    // Preselección desde la landing: /reserva?servicio=3
    const preServicio = Number(new URLSearchParams(location.search).get('servicio'));
    estado.servicio = servicios.find((s) => s.id === preServicio) || null;

    pintarBarberos();
    pintarServicios();
    actualizarPaso1();
  } catch (e) {
    mostrarAlerta('No se pudo conectar con la barbería. Recarga la página.');
  }

  $('#btn-paso2').addEventListener('click', () => {
    estado.fecha = null;
    estado.hora = null;
    pintarResumen();
    pintarDias();
    $('#lista-huecos').replaceChildren(el('p', { class: 'hint' }, 'Selecciona primero un día.'));
    actualizarConfirmar();
    irAPaso(2);
  });
  $('#btn-volver').addEventListener('click', () => irAPaso(1));
  $('#form-reserva').addEventListener('submit', confirmar);
}

iniciar();
