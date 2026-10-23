// Lógica compartida de citas: la usan la reserva pública y el panel de gestión.

const supabase = require('./supabase');
const { esFecha, madridADate, huecosLibres } = require('./horario');

// Máximo de días de antelación para reservar
const DIAS_ANTELACION = 60;

// Error con código HTTP para devolver al cliente tal cual
class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const esId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const esHora = (v) => /^\d{2}:\d{2}$/.test(v || '');

function fechaFueraDeRango(fecha) {
  const limite = new Date(Date.now() + DIAS_ANTELACION * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return fecha > limite;
}

async function obtenerServicio(id) {
  const { data, error } = await supabase
    .from('servicio')
    .select('id, nombre, duracion, precio')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function obtenerServicios() {
  const { data, error } = await supabase
    .from('servicio')
    .select('id, nombre, duracion, precio')
    .order('id');
  if (error) throw error;
  return data;
}

async function obtenerBarbero(id) {
  const { data, error } = await supabase
    .from('barbero')
    .select('id, nombre, apellidos')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Citas del barbero que tocan ese día, como intervalos [inicio, fin).
// `excluirId` deja fuera una cita (la que se está editando).
async function citasOcupadas(idBarbero, fecha, excluirId = null) {
  const desde = madridADate(fecha, '00:00');
  const hasta = new Date(desde.getTime() + 24 * 3600 * 1000);
  const { data, error } = await supabase
    .from('cita')
    .select('id, fecha_y_hora, servicio(duracion)')
    .eq('id_barbero', idBarbero)
    .gte('fecha_y_hora', desde.toISOString())
    .lt('fecha_y_hora', hasta.toISOString());
  if (error) throw error;
  return data.filter((c) => c.id !== Number(excluirId)).map((c) => {
    const inicio = new Date(c.fecha_y_hora);
    return { inicio, fin: new Date(inicio.getTime() + c.servicio.duracion * 60000) };
  });
}

// Normaliza y valida nombre, apellidos y teléfono. Lanza ErrorHttp 400 si algo falla.
function validarCliente(datos = {}) {
  const nombre = String(datos.nombre || '').trim();
  const apellidos = String(datos.apellidos || '').trim();
  const telefono = String(datos.telefono || '').replace(/[\s-]/g, '');
  if (nombre.length < 2 || nombre.length > 60 || apellidos.length > 80) {
    throw new ErrorHttp(400, 'Revisa el nombre y los apellidos');
  }
  if (!/^\+?\d{9,15}$/.test(telefono)) {
    throw new ErrorHttp(400, 'El teléfono no es válido');
  }
  return { nombre, apellidos: apellidos || null, telefono };
}

// Comprueba barbero, servicio, fecha y hora, y que el hueco esté libre. Devuelve { barbero, servicio }.
async function comprobarHueco({ idBarbero, idServicio, fecha, hora, excluirId = null }) {
  if (!esId(idBarbero) || !esId(idServicio) || !esFecha(fecha) || !esHora(hora)) {
    throw new ErrorHttp(400, 'Faltan datos de la cita');
  }
  if (fechaFueraDeRango(fecha)) {
    throw new ErrorHttp(400, `Solo se puede reservar con ${DIAS_ANTELACION} días de antelación`);
  }
  const [servicio, barbero] = await Promise.all([obtenerServicio(idServicio), obtenerBarbero(idBarbero)]);
  if (!servicio || !barbero) throw new ErrorHttp(404, 'Barbero o servicio no encontrado');

  // El hueco tiene que seguir libre y dentro del horario
  const ocupadas = await citasOcupadas(idBarbero, fecha, excluirId);
  if (!huecosLibres(fecha, servicio.duracion, ocupadas).includes(hora)) {
    throw new ErrorHttp(409, 'Ese hueco ya no está disponible. Elige otra hora.');
  }
  return { barbero, servicio };
}

async function insertarCita({ idCliente, idBarbero, idServicio, fecha, hora }) {
  const { data, error } = await supabase
    .from('cita')
    .insert({
      id_cliente: idCliente,
      id_barbero: idBarbero,
      id_servicio: idServicio,
      fecha_y_hora: madridADate(fecha, hora).toISOString(),
    })
    .select('id')
    .single();
  // La base de datos rechaza solapes si dos personas reservan a la vez
  if (error) throw errorDeCita(error);
  return data;
}

// Pasa el error del trigger de solapes a un 409 legible
function errorDeCita(error) {
  if (String(error.message).includes('HUECO_OCUPADO')) {
    return new ErrorHttp(409, 'Ese hueco acaba de ocuparse. Elige otra hora.');
  }
  return error;
}

module.exports = {
  errorDeCita,
  DIAS_ANTELACION,
  ErrorHttp,
  esId,
  esHora,
  fechaFueraDeRango,
  obtenerServicio,
  obtenerServicios,
  obtenerBarbero,
  citasOcupadas,
  validarCliente,
  comprobarHueco,
  insertarCita,
};
