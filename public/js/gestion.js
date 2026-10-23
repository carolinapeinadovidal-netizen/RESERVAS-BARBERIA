// Panel de gestión: calendario de citas del barbero con sesión iniciada.

const estado = {
  vista: 'dia',
  ancla: hoy(),     // día de referencia de la vista actual
  horario: null,    // { 2: [['09:00','14:00'], ...], ... }
  intervalo: 30,
  inicioDia: 0,     // minutos del primer tramo visible (apertura más temprana)
  finDia: 0,        // minutos del último tramo visible (cierre más tardío)
  peticion: 0,
  barbero: null,
  servicios: [],
};

const $ = (sel) => document.querySelector(sel);

// ---------- Utilidades de fecha (fechas locales a mediodía para evitar líos con el cambio de hora) ----------

function hoy() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumarDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const lunesDe = (d) => sumarDias(d, -((d.getDay() + 6) % 7));
const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const fmt = (d, opciones) => d.toLocaleDateString('es-ES', opciones);

const bloquesDe = (d) => estado.horario[d.getDay()] || [];
const capacidadDe = (d) => bloquesDe(d).reduce((t, [a, c]) => t + (aMin(c) - aMin(a)) / estado.intervalo, 0);

function el(tag, attrs = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') nodo.className = v;
    else if (k === 'style') Object.assign(nodo.style, v);
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else nodo.setAttribute(k, v);
  }
  nodo.append(...hijos);
  return nodo;
}

async function api(url, opciones) {
  const res = await fetch(url, opciones);
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Sesión caducada');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || 'Error inesperado');
  return datos;
}

function mostrarAlerta(texto) {
  const a = $('#alerta');
  a.textContent = texto;
  a.hidden = !texto;
}

// ---------- Rango y título de cada vista ----------

function rangoVista() {
  const a = estado.ancla;
  if (estado.vista === 'dia') return { desde: a, hasta: a };
  if (estado.vista === 'semana') { const l = lunesDe(a); return { desde: l, hasta: sumarDias(l, 6) }; }
  const primero = new Date(a.getFullYear(), a.getMonth(), 1, 12);
  const ultimo = new Date(a.getFullYear(), a.getMonth() + 1, 0, 12);
  return { desde: lunesDe(primero), hasta: sumarDias(lunesDe(ultimo), 6) };
}

function titulo() {
  const a = estado.ancla;
  if (estado.vista === 'dia') return fmt(a, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (estado.vista === 'mes') return fmt(a, { month: 'long', year: 'numeric' });
  const l = lunesDe(a);
  const d = sumarDias(l, 6);
  const mismoMes = l.getMonth() === d.getMonth();
  return `${fmt(l, mismoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${fmt(d, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function mover(direccion) {
  const a = estado.ancla;
  if (estado.vista === 'dia') estado.ancla = sumarDias(a, direccion);
  else if (estado.vista === 'semana') estado.ancla = sumarDias(a, 7 * direccion);
  else estado.ancla = new Date(a.getFullYear(), a.getMonth() + direccion, 1, 12);
  pintar();
}

function cambiarVista(vista) {
  estado.vista = vista;
  document.querySelectorAll('[data-vista]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.vista === vista));
  });
  pintar();
}

// ---------- Pintado ----------

async function pintar() {
  const id = ++estado.peticion;
  $('#titulo').textContent = titulo();
  const cal = $('#calendario');
  cal.setAttribute('aria-busy', 'true');
  mostrarAlerta('');

  const { desde, hasta } = rangoVista();
  let citas;
  try {
    citas = await api(`/api/gestion/citas?desde=${iso(desde)}&hasta=${iso(hasta)}`);
  } catch (e) {
    if (id === estado.peticion) { mostrarAlerta(e.message); cal.setAttribute('aria-busy', 'false'); }
    return;
  }
  if (id !== estado.peticion) return; // llegó tarde una respuesta antigua

  const porDia = {};
  for (const c of citas) (porDia[c.fecha] ||= []).push(c);
  estado.porDia = porDia; // lo usa el arrastre para comprobar huecos

  if (estado.vista === 'mes') cal.replaceChildren(vistaMes(porDia));
  else {
    let dias = [estado.ancla];
    if (estado.vista === 'semana') {
      const l = lunesDe(estado.ancla);
      dias = [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(l, i)).filter((d) => bloquesDe(d).length);
    }
    cal.replaceChildren(vistaRejilla(dias, porDia));
  }
  cal.setAttribute('aria-busy', 'false');
}

// Vista de día o semana: columnas por día y filas de 30 minutos
function vistaRejilla(dias, porDia) {
  const { inicioDia, finDia, intervalo } = estado;
  const filas = (finDia - inicioDia) / intervalo;
  const hoyIso = iso(hoy());
  const px = (min) => `calc(var(--fila) * ${min / intervalo})`;

  const grid = el('div', { class: `cal-grid${estado.vista === 'dia' ? ' cal-grid--dia' : ''}` });
  grid.style.setProperty('--cols', dias.length);
  grid.style.setProperty('--rows', filas);

  // Cabecera
  grid.append(el('div', { class: 'cal-corner' }));
  for (const d of dias) {
    grid.append(el('div', { class: `cal-dayhead${iso(d) === hoyIso ? ' is-today' : ''}` },
      fmt(d, { weekday: 'short' }), el('strong', {}, d.getDate())));
  }

  // Columna de horas
  const horas = el('div', { class: 'cal-times' });
  for (let i = 0; i < filas; i++) {
    const min = inicioDia + i * intervalo;
    horas.append(el('div', { class: `cal-time${min % 60 ? ' cal-time--media' : ''}` }, aHora(min)));
  }
  grid.append(horas);

  // Columnas de días
  for (const d of dias) {
    const col = el('div', { class: `cal-col${iso(d) === hoyIso ? ' is-today' : ''}`, 'data-fecha': iso(d) });

    // Tramos cerrados (antes de abrir, descanso de mediodía, después de cerrar)
    const bloques = bloquesDe(d).map(([a, c]) => [aMin(a), aMin(c)]);
    let cursor = inicioDia;
    const huecos = [];
    for (const [a, c] of bloques) {
      if (a > cursor) huecos.push([cursor, a]);
      cursor = Math.max(cursor, c);
    }
    if (cursor < finDia) huecos.push([cursor, finDia]);
    for (const [a, c] of huecos) {
      const etiqueta = !bloques.length ? 'Cerrado' : (a > bloques[0][0] && c < finDia ? 'Descanso' : 'Cerrado');
      col.append(el('div', { class: 'cal-closed', style: { top: px(a - inicioDia), height: px(c - a) } },
        c - a >= intervalo ? etiqueta : ''));
    }

    // Huecos libres clicables (tramos de 30 min sin cita, dentro del horario y no pasados)
    const citasDia = (porDia[iso(d)] || []).map((c) => [aMin(c.hora), aMin(c.hora) + c.duracion]);
    const ahora = new Date();
    const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
    for (const [a, c] of bloques) {
      for (let t = a; t < c; t += intervalo) {
        if (iso(d) < hoyIso || (iso(d) === hoyIso && t <= minAhora)) continue;
        if (citasDia.some(([ini, fin]) => t >= ini && t < fin)) continue;
        const fecha = iso(d);
        const hora = aHora(t);
        col.append(el('button', {
          type: 'button',
          class: 'cal-free',
          style: { top: px(t - inicioDia) },
          'aria-label': `Crear cita el ${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${hora}`,
          onclick: () => abrirModal({ fecha, hora }),
        }, `+ ${hora}`));
      }
    }

    // Citas
    for (const c of porDia[iso(d)] || []) {
      const ini = aMin(c.hora);
      const fin = ini + c.duracion;
      const corta = c.duracion < 25;
      col.append(el('button', {
        type: 'button',
        class: `cal-event${corta ? ' cal-event--corta' : ''}${c.pasada ? '' : ' is-draggable'}`,
        style: { top: px(ini - inicioDia), height: `calc(${px(c.duracion)} - 2px)` },
        title: `${c.hora}–${aHora(fin)} · ${c.cliente} · ${c.servicio}${c.pasada ? '' : ' (arrastra para moverla)'}`,
        onclick: () => { if (!arrastre.recienSoltada) abrirDetalle(c.id); },
        onpointerdown: (ev) => iniciarArrastre(ev, c),
      },
      el('span', { class: 'cal-event__line' },
        el('span', { class: 'cal-event__time' }, `${c.hora}–${aHora(fin)}`),
        el('span', { class: 'cal-event__client' }, c.cliente)),
      el('span', { class: 'cal-event__service' }, c.servicio)));
    }
    grid.append(col);
  }

  return el('div', { class: 'cal-scroll' }, grid);
}

// Vista de mes: cada día con "reservadas/disponibles"
function vistaMes(porDia) {
  const { desde, hasta } = rangoVista();
  const mes = estado.ancla.getMonth();
  const hoyIso = iso(hoy());
  const cont = el('div', { class: 'cal-month' });

  for (let i = 0; i < 7; i++) {
    cont.append(el('div', { class: 'cal-month__dow' }, fmt(sumarDias(desde, i), { weekday: 'short' })));
  }

  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const clave = iso(d);
    const capacidad = capacidadDe(d);
    const reservadas = (porDia[clave] || []).length;
    const clases = ['cal-month__day'];
    if (d.getMonth() !== mes) clases.push('is-other');
    if (clave === hoyIso) clases.push('is-today');
    if (!capacidad) clases.push('is-closed');

    const dia = new Date(d);
    cont.append(el('button', {
      type: 'button',
      class: clases.join(' '),
      'aria-label': capacidad
        ? `${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${reservadas} de ${capacidad} citas`
        : `${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: cerrado`,
      onclick: () => { estado.ancla = dia; cambiarVista('dia'); },
    },
    el('span', { class: 'cal-month__num' }, d.getDate()),
    capacidad
      ? el('span', { class: `cal-month__count${reservadas ? '' : ' is-empty'}` },
        el('strong', {}, `${reservadas}/${capacidad}`), el('span', {}, ' citas'))
      : el('span', { class: 'cal-month__closed' }, 'Cerrado')));
  }
  return cont;
}

// ---------- Arrastrar citas (vista día y semana) ----------
// Pulsar y mover una cita la desplaza en tramos de 30 min; en la semana también entre días.
// Si apenas se mueve, se trata como un clic normal (abre el detalle).

const UMBRAL_ARRASTRE = 6; // px que hay que mover para que cuente como arrastre
const arrastre = { activo: null, recienSoltada: false };

// ¿Cabe la cita en ese día y hora? (horario, no pasada y sin chocar con otras citas)
function huecoValido(fecha, ini, duracion, idCita) {
  const bloques = bloquesDe(new Date(`${fecha}T12:00:00`)).map(([a, c]) => [aMin(a), aMin(c)]);
  if (!bloques.some(([a, c]) => ini >= a && ini + duracion <= c)) return false;

  const ahora = new Date();
  const hoyIso = iso(hoy());
  if (fecha < hoyIso || (fecha === hoyIso && ini <= ahora.getHours() * 60 + ahora.getMinutes())) return false;

  return !(estado.porDia[fecha] || []).some((c) => {
    if (c.id === idCita) return false;
    const cIni = aMin(c.hora);
    return cIni < ini + duracion && ini < cIni + c.duracion;
  });
}

function iniciarArrastre(ev, cita) {
  if (cita.pasada || ev.button !== 0 || estado.vista === 'mes' || arrastre.activo) return;
  const boton = ev.currentTarget;
  const a = {
    cita,
    boton,
    x0: ev.clientX,
    y0: ev.clientY,
    x: ev.clientX,
    y: ev.clientY,
    agarre: ev.clientY - boton.getBoundingClientRect().top, // dónde se cogió la cita
    moviendo: false,
    fantasma: null,
    destino: null,
    raf: 0,
  };
  arrastre.activo = a;

  const onMove = (e) => {
    a.x = e.clientX;
    a.y = e.clientY;
    if (!a.moviendo) {
      if (Math.hypot(a.x - a.x0, a.y - a.y0) < UMBRAL_ARRASTRE) return;
      empezarArrastre(a);
    }
    e.preventDefault();
    actualizarArrastre(a);
  };
  const onUp = () => { limpiar(); soltarArrastre(a); };
  const onCancel = () => { limpiar(); cancelarArrastre(a); };
  const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
  const limpiar = () => {
    boton.removeEventListener('pointermove', onMove);
    boton.removeEventListener('pointerup', onUp);
    boton.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey);
    if (boton.hasPointerCapture(ev.pointerId)) boton.releasePointerCapture(ev.pointerId);
    cancelAnimationFrame(a.raf);
    document.body.classList.remove('is-arrastrando');
    arrastre.activo = null;
  };

  boton.setPointerCapture(ev.pointerId);
  boton.addEventListener('pointermove', onMove);
  boton.addEventListener('pointerup', onUp);
  boton.addEventListener('pointercancel', onCancel);
  document.addEventListener('keydown', onKey);
}

function empezarArrastre(a) {
  a.moviendo = true;
  a.boton.classList.add('is-dragging');
  document.body.classList.add('is-arrastrando');
  a.fantasma = a.boton.cloneNode(true);
  a.fantasma.classList.remove('is-dragging');
  a.fantasma.classList.add('cal-event--ghost');
  a.fantasma.removeAttribute('title');
  a.fantasma.setAttribute('aria-hidden', 'true');
  a.fantasma.tabIndex = -1;

  // Desplazamiento automático de la página al acercarse a los bordes
  const autoScroll = () => {
    const margen = 70;
    let dy = 0;
    if (a.y < margen + 60) dy = -14;            // 60 px de la barra superior fija
    else if (a.y > window.innerHeight - margen) dy = 14;
    if (dy) { window.scrollBy(0, dy); actualizarArrastre(a); }
    a.raf = requestAnimationFrame(autoScroll);
  };
  a.raf = requestAnimationFrame(autoScroll);
}

function actualizarArrastre(a) {
  const { inicioDia, finDia, intervalo } = estado;
  const cols = [...document.querySelectorAll('.cal-col')];
  if (!cols.length) return;

  // Columna (día) bajo el puntero; fuera de la rejilla, la más cercana
  let col = cols.find((c) => { const r = c.getBoundingClientRect(); return a.x >= r.left && a.x < r.right; });
  if (!col) col = a.x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];

  const r = col.getBoundingClientRect();
  const filaPx = r.height / ((finDia - inicioDia) / intervalo);
  const tramos = Math.round((a.y - r.top - a.agarre) / filaPx);
  const ini = Math.min(Math.max(inicioDia + tramos * intervalo, inicioDia), finDia - intervalo);
  const fecha = col.dataset.fecha;
  const valido = huecoValido(fecha, ini, a.cita.duracion, a.cita.id);

  if (a.fantasma.parentElement !== col) col.append(a.fantasma);
  a.fantasma.style.top = `calc(var(--fila) * ${(ini - inicioDia) / intervalo})`;
  a.fantasma.classList.toggle('is-invalid', !valido);
  a.fantasma.querySelector('.cal-event__time').textContent = `${aHora(ini)}–${aHora(ini + a.cita.duracion)}`;
  a.destino = { fecha, hora: aHora(ini), valido };
}

function cancelarArrastre(a) {
  a.fantasma?.remove();
  a.boton.classList.remove('is-dragging');
}

async function soltarArrastre(a) {
  if (!a.moviendo) return; // fue un clic: lo gestiona onclick

  // Evita que el clic que sigue al soltar abra el detalle
  arrastre.recienSoltada = true;
  setTimeout(() => { arrastre.recienSoltada = false; }, 0);

  const { cita, destino } = a;
  if (!destino || (destino.fecha === cita.fecha && destino.hora === cita.hora)) {
    cancelarArrastre(a);
    return;
  }
  if (!destino.valido) {
    cancelarArrastre(a);
    avisar('No se puede mover ahí: el hueco está ocupado, cerrado o ya ha pasado.');
    return;
  }

  // La cita se queda en su nueva posición mientras se guarda
  a.fantasma.classList.add('is-saving');
  try {
    await api(`/api/gestion/citas/${cita.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente: cita.idCliente, servicio: cita.idServicio, fecha: destino.fecha, hora: destino.hora }),
    });
    avisar(`Cita de ${cita.cliente} movida al ${fechaLarga(destino.fecha)} a las ${destino.hora}`);
  } catch (e) {
    mostrarAlerta(e.message);
  }
  pintar();
}

// ---------- Crear cita ----------
// Dos formas: botón "Crear cita" (servicio -> día -> huecos según duración)
// o clic en un hueco libre (día y hora fijos -> servicios que caben).

const modal = {
  hueco: null,          // { fecha, hora } si se abrió desde un hueco del calendario
  editando: null,       // cita que se está editando (detalle completo)
  modoCliente: 'existente',
  cliente: null,        // cliente existente elegido
  servicio: null,
  fecha: null,
  hora: null,
  busqueda: 0,
  temporizador: null,
};

function alertaModal(texto) {
  const a = $('#alerta-modal');
  a.textContent = texto;
  a.hidden = !texto;
  if (texto) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function avisar(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { t.hidden = true; }, 4000);
}

const fechaLarga = (fecha) => fmt(new Date(`${fecha}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });

// `edicion` = detalle de una cita para editarla (mismo formulario, ya relleno)
function abrirModal(hueco = null, edicion = null) {
  Object.assign(modal, { hueco, editando: edicion, cliente: null, servicio: null, fecha: null, hora: null });
  alertaModal('');
  $('#form-cita').reset();
  cambiarModoCliente('existente');
  $('#resultados-cliente').replaceChildren();
  $('#modal-titulo').textContent = edicion ? 'Editar cita' : 'Nueva cita';
  $('#btn-guardar-cita').textContent = edicion ? 'Guardar cambios' : 'Crear cita';

  if (edicion) {
    modal.cliente = edicion.cliente;
    modal.servicio = estado.servicios.find((s) => s.id === edicion.servicio.id) || edicion.servicio;
    modal.fecha = edicion.fecha;
    modal.hora = edicion.hora;
  }
  pintarClienteElegido();

  if (edicion) {
    $('#hueco-libre').hidden = false;
    $('#hueco-fijo').hidden = true;
    $('#hint-servicio').hidden = true;
    pintarServiciosModal(estado.servicios);
    $('#fecha-cita').min = iso(hoy());
    $('#fecha-cita').value = edicion.fecha;
    cargarHuecosModal();
  } else if (hueco) {
    modal.fecha = hueco.fecha;
    modal.hora = hueco.hora;
    $('#hueco-libre').hidden = true;
    $('#hueco-fijo').hidden = false;
    $('#hueco-fijo').replaceChildren(el('span', {}, el('strong', {}, `${fechaLarga(hueco.fecha)} · ${hueco.hora}`)));
    cargarServiciosHueco();
  } else {
    $('#hueco-libre').hidden = false;
    $('#hueco-fijo').hidden = true;
    $('#hint-servicio').hidden = true;
    pintarServiciosModal(estado.servicios);
    const hoyIso = iso(hoy());
    const ancla = iso(estado.ancla);
    $('#fecha-cita').min = hoyIso;
    $('#fecha-cita').value = ancla >= hoyIso ? ancla : hoyIso;
    modal.fecha = $('#fecha-cita').value;
    $('#lista-huecos').replaceChildren(el('p', { class: 'hint' }, 'Elige primero un servicio.'));
  }
  actualizarGuardar();
  $('#modal-cita').showModal();
  if (!edicion) $('#buscar-cliente').focus();
}

function cerrarModal() {
  $('#modal-cita').close();
}

// --- Cliente ---

function cambiarModoCliente(modo) {
  modal.modoCliente = modo;
  document.querySelectorAll('[data-modo-cliente]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.modoCliente === modo));
  });
  $('#cliente-existente').hidden = modo !== 'existente';
  $('#cliente-nuevo').hidden = modo !== 'nuevo';
  actualizarGuardar();
}

function pintarClienteElegido() {
  const chip = $('#cliente-elegido');
  const buscador = $('#buscar-cliente').closest('.field');
  if (!modal.cliente) {
    chip.hidden = true;
    buscador.hidden = false;
    return;
  }
  const c = modal.cliente;
  chip.replaceChildren(
    el('span', {}, el('strong', {}, `${c.nombre} ${c.apellidos || ''}`), el('br'), c.telefono),
    el('button', {
      type: 'button',
      class: 'summary__link',
      onclick: () => { modal.cliente = null; pintarClienteElegido(); actualizarGuardar(); $('#buscar-cliente').focus(); },
    }, 'Cambiar'));
  chip.hidden = false;
  buscador.hidden = true;
  $('#resultados-cliente').replaceChildren();
}

async function buscarClientes() {
  const q = $('#buscar-cliente').value.trim();
  const lista = $('#resultados-cliente');
  const id = ++modal.busqueda;
  if (q.length < 2) { lista.replaceChildren(); return; }
  try {
    const clientes = await api(`/api/gestion/clientes?q=${encodeURIComponent(q)}`);
    if (id !== modal.busqueda) return;
    if (!clientes.length) {
      lista.replaceChildren(el('li', {}, el('p', { class: 'hint' }, 'No hay clientes con esos datos. Puedes crearlo en "Nuevo cliente".')));
      return;
    }
    lista.replaceChildren(...clientes.map((c) => el('li', {},
      el('button', {
        type: 'button',
        onclick: () => { modal.cliente = c; pintarClienteElegido(); actualizarGuardar(); },
      },
      el('span', {}, `${c.nombre} ${c.apellidos || ''}`),
      el('small', {}, c.telefono)))));
  } catch (e) {
    alertaModal(e.message);
  }
}

function datosClienteNuevo() {
  return {
    nombre: $('#nuevo-nombre').value.trim(),
    apellidos: $('#nuevo-apellidos').value.trim(),
    telefono: $('#nuevo-telefono').value.replace(/[\s-]/g, ''),
  };
}

function clienteValido() {
  if (modal.modoCliente === 'existente') return !!modal.cliente;
  const { nombre, telefono } = datosClienteNuevo();
  return nombre.length >= 2 && /^\+?\d{9,15}$/.test(telefono);
}

// --- Servicio ---

async function cargarServiciosHueco() {
  const lista = $('#lista-servicios');
  const hint = $('#hint-servicio');
  lista.replaceChildren(el('p', { class: 'hint' }, 'Buscando servicios que caben en el hueco…'));
  hint.hidden = true;
  try {
    const { fecha, hora } = modal.hueco;
    const servicios = await api(`/api/gestion/servicios-hueco?fecha=${fecha}&hora=${hora}`);
    if (!servicios.length) {
      lista.replaceChildren(el('p', { class: 'hint' }, 'No cabe ningún servicio en este hueco.'));
      return;
    }
    hint.textContent = `Servicios que caben empezando a las ${hora}:`;
    hint.hidden = false;
    pintarServiciosModal(servicios);
  } catch (e) {
    lista.replaceChildren();
    alertaModal(e.message);
  }
}

function pintarServiciosModal(servicios) {
  $('#lista-servicios').replaceChildren(...servicios.map((s) => el('button', {
    type: 'button',
    class: 'service-opt',
    'aria-pressed': String(modal.servicio?.id === s.id),
    onclick: () => {
      modal.servicio = s;
      pintarServiciosModal(servicios);
      // Si la hora elegida sigue cabiendo con el nuevo servicio, se mantiene
      if (!modal.hueco) cargarHuecosModal();
      actualizarGuardar();
    },
  }, el('span', {}, s.nombre), el('small', {}, `${s.duracion} min`))));
}

// --- Día y hora (solo desde el botón) ---

async function cargarHuecosModal() {
  const cont = $('#lista-huecos');
  if (!modal.servicio) {
    cont.replaceChildren(el('p', { class: 'hint' }, 'Elige primero un servicio.'));
    return;
  }
  if (!modal.fecha) {
    cont.replaceChildren(el('p', { class: 'hint' }, 'Elige un día.'));
    return;
  }
  cont.replaceChildren(el('p', { class: 'hint' }, 'Buscando huecos libres…'));
  try {
    const params = new URLSearchParams({ servicio: modal.servicio.id, fecha: modal.fecha });
    if (modal.editando) params.set('excluir', modal.editando.id); // la propia cita no ocupa su hueco
    const { huecos } = await api(`/api/gestion/disponibilidad?${params}`);
    if (modal.hora && !huecos.includes(modal.hora)) modal.hora = null;
    actualizarGuardar();
    if (!huecos.length) {
      cont.replaceChildren(el('p', { class: 'hint' }, 'No hay huecos libres para este servicio ese día.'));
      return;
    }
    cont.replaceChildren(...huecos.map((h) => el('button', {
      type: 'button',
      class: 'slot',
      'aria-pressed': String(modal.hora === h),
      onclick: () => { modal.hora = h; cargarHuecosModalPintados(huecos); actualizarGuardar(); },
    }, h)));
  } catch (e) {
    cont.replaceChildren();
    alertaModal(e.message);
  }
}

function cargarHuecosModalPintados(huecos) {
  document.querySelectorAll('#lista-huecos .slot').forEach((b, i) => {
    b.setAttribute('aria-pressed', String(huecos[i] === modal.hora));
  });
}

function actualizarGuardar() {
  $('#btn-guardar-cita').disabled = !(clienteValido() && modal.servicio && modal.fecha && modal.hora);
}

// --- Guardar ---

async function guardarCita(ev) {
  ev.preventDefault();
  alertaModal('');
  if (!clienteValido()) {
    return alertaModal(modal.modoCliente === 'nuevo'
      ? 'Escribe el nombre y un teléfono válido (mínimo 9 dígitos).'
      : 'Busca y elige un cliente.');
  }
  const cuerpo = {
    servicio: modal.servicio.id,
    fecha: modal.fecha,
    hora: modal.hora,
  };
  if (modal.modoCliente === 'nuevo') cuerpo.nuevoCliente = datosClienteNuevo();
  else cuerpo.cliente = modal.cliente.id;

  const boton = $('#btn-guardar-cita');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const editando = modal.editando;
    await api(editando ? `/api/gestion/citas/${editando.id}` : '/api/gestion/citas', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    cerrarModal();
    avisar(`${editando ? 'Cita actualizada' : 'Cita creada'}: ${fechaLarga(modal.fecha)} a las ${modal.hora}`);
    // Llevamos el calendario al día de la cita si no se ve en la vista actual
    const { desde, hasta } = rangoVista();
    if (modal.fecha < iso(desde) || modal.fecha > iso(hasta)) estado.ancla = new Date(`${modal.fecha}T12:00:00`);
    pintar();
  } catch (e) {
    alertaModal(e.message);
    if (/hueco/i.test(e.message)) {
      if (modal.hueco) cargarServiciosHueco();
      else { modal.hora = null; cargarHuecosModal(); }
    }
  } finally {
    boton.textContent = modal.editando ? 'Guardar cambios' : 'Crear cita';
    actualizarGuardar();
  }
}

// ---------- Detalle de cita: ver, editar y eliminar ----------

let citaAbierta = null;

async function abrirDetalle(id) {
  try {
    citaAbierta = await api(`/api/gestion/citas/${id}`);
  } catch (e) {
    mostrarAlerta(e.message);
    pintar();
    return;
  }
  const c = citaAbierta;
  const fin = aHora(aMin(c.hora) + c.servicio.duracion);
  const filas = [
    ['Cliente', `${c.cliente.nombre} ${c.cliente.apellidos || ''}`.trim()],
    ['Teléfono', c.cliente.telefono],
    ['Servicio', c.servicio.nombre],
    ['Duración', `${c.servicio.duracion} min`],
    ['Precio', c.servicio.precio != null ? `${Number(c.servicio.precio).toLocaleString('es-ES')} €` : '—'],
    ['Día', fechaLarga(c.fecha)],
    ['Hora', `${c.hora} – ${fin}`],
  ];
  $('#detalle-datos').replaceChildren(el('dl', {}, ...filas.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])));

  $('#btn-editar-cita').disabled = c.pasada;
  $('#detalle-pasada').hidden = !c.pasada;
  mostrarConfirmacion(false);
  $('#modal-detalle').showModal();
}

function mostrarConfirmacion(visible) {
  $('#detalle-acciones').hidden = visible;
  $('#detalle-confirmar').hidden = !visible;
  $('#alerta-detalle').hidden = true;
  if (visible) {
    const c = citaAbierta;
    $('#texto-confirmar').textContent =
      `¿Seguro que quieres eliminar la cita de ${c.cliente.nombre} (${c.servicio.nombre}) del ${fechaLarga(c.fecha)} a las ${c.hora}? Esta acción no se puede deshacer.`;
    $('#btn-confirmar-no').focus();
  }
}

async function eliminarCita() {
  const boton = $('#btn-confirmar-si');
  boton.disabled = true;
  boton.textContent = 'Eliminando…';
  try {
    await api(`/api/gestion/citas/${citaAbierta.id}`, { method: 'DELETE' });
    $('#modal-detalle').close();
    avisar('Cita eliminada');
    pintar();
  } catch (e) {
    const a = $('#alerta-detalle');
    a.textContent = e.message;
    a.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Sí, eliminar';
  }
}

function prepararDetalle() {
  $('#btn-cerrar-detalle').addEventListener('click', () => $('#modal-detalle').close());
  $('#btn-eliminar-cita').addEventListener('click', () => mostrarConfirmacion(true));
  $('#btn-confirmar-no').addEventListener('click', () => mostrarConfirmacion(false));
  $('#btn-confirmar-si').addEventListener('click', eliminarCita);
  $('#btn-editar-cita').addEventListener('click', () => {
    $('#modal-detalle').close();
    abrirModal(null, citaAbierta);
  });
}

function prepararModal() {
  $('#btn-cerrar-modal').addEventListener('click', cerrarModal);
  $('#btn-cancelar').addEventListener('click', cerrarModal);
  $('#form-cita').addEventListener('submit', guardarCita);
  document.querySelectorAll('[data-modo-cliente]').forEach((b) => {
    b.addEventListener('click', () => cambiarModoCliente(b.dataset.modoCliente));
  });
  $('#buscar-cliente').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(modal.temporizador); buscarClientes(); }
  });
  $('#buscar-cliente').addEventListener('input', () => {
    clearTimeout(modal.temporizador);
    modal.temporizador = setTimeout(buscarClientes, 300);
  });
  ['#nuevo-nombre', '#nuevo-apellidos', '#nuevo-telefono'].forEach((s) => $(s).addEventListener('input', actualizarGuardar));
  $('#fecha-cita').addEventListener('change', (ev) => {
    modal.fecha = ev.target.value || null;
    modal.hora = null;
    cargarHuecosModal();
    actualizarGuardar();
  });
}

// ---------- Inicio ----------

async function iniciar() {
  try {
    const [{ barbero }, { horario, intervalo }, servicios] = await Promise.all([
      api('/api/sesion'), api('/api/horario'), api('/api/servicios'),
    ]);
    if (!barbero) { location.href = '/login'; return; }
    $('#usuario-actual').textContent = `Hola, ${barbero.nombre}`;
    estado.barbero = barbero;
    estado.servicios = servicios;

    estado.horario = horario;
    estado.intervalo = intervalo;
    const todos = Object.values(horario).flat();
    estado.inicioDia = Math.min(...todos.map(([a]) => aMin(a)));
    estado.finDia = Math.max(...todos.map(([, c]) => aMin(c)));
  } catch (e) {
    mostrarAlerta('No se pudo cargar el panel. Recarga la página.');
    return;
  }

  $('#btn-anterior').addEventListener('click', () => mover(-1));
  $('#btn-siguiente').addEventListener('click', () => mover(1));
  document.querySelectorAll('[data-vista]').forEach((b) => {
    b.addEventListener('click', () => cambiarVista(b.dataset.vista));
  });
  prepararModal();
  prepararDetalle();
  $('#btn-crear').addEventListener('click', () => abrirModal());
  $('#btn-salir').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/';
  });

  pintar();
}

iniciar();
