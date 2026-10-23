const express = require('express');
const supabase = require('../lib/supabase');
const { HORARIO, INTERVALO, esFecha, madridADate, aMadrid, huecosLibres } = require('../lib/horario');
const {
  ErrorHttp,
  errorDeCita,
  esId,
  esHora,
  fechaFueraDeRango,
  obtenerServicio,
  obtenerServicios,
  citasOcupadas,
  validarCliente,
  comprobarHueco,
  insertarCita,
} = require('../lib/citas');

const router = express.Router();

// Máximo de días que se pueden pedir de una vez (vista mensual con semanas de relleno)
const MAX_DIAS_RANGO = 45;

function requiereSesion(req, res, next) {
  if (!req.session.barbero) return res.status(401).json({ error: 'Sesión caducada. Vuelve a iniciar sesión.' });
  next();
}

router.post('/login', async (req, res, next) => {
  try {
    const usuario = String(req.body.usuario || '').trim().toLowerCase();
    const contrasena = String(req.body.contrasena || '');
    if (!usuario || !contrasena) {
      return res.status(400).json({ error: 'Escribe tu usuario y tu contraseña.' });
    }

    // La comprobación de la contraseña la hace la base de datos (bcrypt)
    const { data: id, error } = await supabase.rpc('login_barbero', {
      p_usuario: usuario,
      p_contrasena: contrasena,
    });
    if (error) throw error;
    if (!id) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

    const { data: barbero, error: errBarbero } = await supabase
      .from('barbero')
      .select('id, nombre, apellidos')
      .eq('id', id)
      .single();
    if (errBarbero) throw errBarbero;

    // Nueva sesión para evitar fijación de sesión
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.barbero = barbero;
      res.json({ barbero });
    });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

router.get('/sesion', (req, res) => {
  res.json({ barbero: req.session.barbero || null });
});

router.get('/horario', (req, res) => {
  res.json({ horario: HORARIO, intervalo: INTERVALO });
});

// GET /api/gestion/citas?desde=2026-10-01&hasta=2026-10-31 (ambos incluidos)
router.get('/gestion/citas', requiereSesion, async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) {
      return res.status(400).json({ error: 'Rango de fechas no válido' });
    }
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
    if (dias > MAX_DIAS_RANGO) return res.status(400).json({ error: 'Rango demasiado grande' });

    const inicio = madridADate(desde, '00:00');
    const finDia = new Date(Date.parse(`${hasta}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const fin = madridADate(finDia, '00:00');

    const { data, error } = await supabase
      .from('cita')
      .select('id, fecha_y_hora, cliente(id, nombre, apellidos), servicio(id, nombre, duracion)')
      .eq('id_barbero', req.session.barbero.id)
      .gte('fecha_y_hora', inicio.toISOString())
      .lt('fecha_y_hora', fin.toISOString())
      .order('fecha_y_hora');
    if (error) throw error;

    const ahora = new Date();
    res.json(data.map((c) => {
      const { fecha, hora } = aMadrid(new Date(c.fecha_y_hora));
      return {
        id: c.id,
        fecha,
        hora,
        pasada: new Date(c.fecha_y_hora) <= ahora,
        duracion: c.servicio.duracion,
        idServicio: c.servicio.id,
        servicio: c.servicio.nombre,
        idCliente: c.cliente.id,
        cliente: `${c.cliente.nombre} ${c.cliente.apellidos || ''}`.trim(),
      };
    }));
  } catch (e) { next(e); }
});

// GET /api/gestion/clientes?q=lucia gomez  |  ?q=699000
router.get('/gestion/clientes', requiereSesion, async (req, res, next) => {
  try {
    // Quitamos caracteres con significado en los filtros de PostgREST
    const q = String(req.query.q || '').replace(/[%_,()*\\:."']/g, ' ').trim();
    if (q.length < 2) return res.json([]);

    let consulta = supabase
      .from('cliente')
      .select('id, nombre, apellidos, telefono')
      .order('nombre')
      .limit(10);

    const soloDigitos = q.replace(/[\s+-]/g, '');
    if (/^\d+$/.test(soloDigitos)) {
      consulta = consulta.ilike('telefono', `%${soloDigitos}%`);
    } else {
      // Cada palabra debe aparecer en el nombre o en los apellidos
      for (const palabra of q.split(/\s+/).slice(0, 4)) {
        consulta = consulta.or(`nombre.ilike.%${palabra}%,apellidos.ilike.%${palabra}%`);
      }
    }

    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/gestion/servicios-hueco?fecha=2026-10-22&hora=12:00
// Servicios cuya duración cabe empezando en ese hueco
router.get('/gestion/servicios-hueco', requiereSesion, async (req, res, next) => {
  try {
    const { fecha, hora } = req.query;
    if (!esFecha(fecha) || !esHora(hora)) return res.status(400).json({ error: 'Hueco no válido' });

    const [servicios, ocupadas] = await Promise.all([
      obtenerServicios(),
      citasOcupadas(req.session.barbero.id, fecha),
    ]);
    res.json(servicios.filter((s) => huecosLibres(fecha, s.duracion, ocupadas).includes(hora)));
  } catch (e) { next(e); }
});

// GET /api/gestion/disponibilidad?servicio=2&fecha=2026-10-22[&excluir=15]
// Huecos del barbero con sesión; `excluir` ignora la cita que se está editando
router.get('/gestion/disponibilidad', requiereSesion, async (req, res, next) => {
  try {
    const { servicio: idServicio, fecha, excluir } = req.query;
    if (!esId(idServicio) || !esFecha(fecha)) return res.status(400).json({ error: 'Parámetros no válidos' });
    if (fechaFueraDeRango(fecha)) return res.json({ huecos: [] });

    const servicio = await obtenerServicio(idServicio);
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });

    const ocupadas = await citasOcupadas(req.session.barbero.id, fecha, esId(excluir) ? excluir : null);
    res.json({ huecos: huecosLibres(fecha, servicio.duracion, ocupadas) });
  } catch (e) { next(e); }
});

// Devuelve el id del cliente: el existente elegido o uno nuevo (comprobando que el teléfono no exista).
// Primero se valida (`preparar`) y solo se crea al final (`obtenerId`), cuando el hueco ya está comprobado.
async function prepararCliente({ cliente, nuevoCliente }) {
  if (nuevoCliente) {
    const datos = validarCliente(nuevoCliente);
    const { data: existente, error } = await supabase
      .from('cliente')
      .select('nombre, apellidos')
      .eq('telefono', datos.telefono)
      .maybeSingle();
    if (error) throw error;
    if (existente) {
      const nombre = `${existente.nombre} ${existente.apellidos || ''}`.trim();
      throw new ErrorHttp(409, `Ya existe un cliente con ese teléfono (${nombre}). Búscalo en "Cliente existente".`);
    }
    return async () => {
      const { data, error: errInsert } = await supabase.from('cliente').insert(datos).select('id').single();
      if (errInsert) throw errInsert;
      return data.id;
    };
  }
  if (esId(cliente)) {
    const { data, error } = await supabase.from('cliente').select('id').eq('id', cliente).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErrorHttp(404, 'El cliente no existe');
    return async () => data.id;
  }
  throw new ErrorHttp(400, 'Elige un cliente o crea uno nuevo');
}

// Cita del barbero con sesión (o 404 si no existe o es de otro barbero)
async function citaDelBarbero(id, idBarbero) {
  if (!esId(id)) throw new ErrorHttp(400, 'Cita no válida');
  const { data, error } = await supabase
    .from('cita')
    .select('id, fecha_y_hora, cliente(id, nombre, apellidos, telefono), servicio(id, nombre, duracion, precio)')
    .eq('id', id)
    .eq('id_barbero', idBarbero)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorHttp(404, 'La cita no existe o ya fue eliminada');
  const { fecha, hora } = aMadrid(new Date(data.fecha_y_hora));
  const pasada = new Date(data.fecha_y_hora) <= new Date();
  return { id: data.id, fecha, hora, pasada, cliente: data.cliente, servicio: data.servicio };
}

// POST /api/gestion/citas
// { cliente: 12 } para un cliente existente, o { nuevoCliente: { nombre, apellidos, telefono } }
router.post('/gestion/citas', requiereSesion, async (req, res, next) => {
  try {
    const { servicio: idServicio, fecha, hora } = req.body;
    const idBarbero = req.session.barbero.id;

    const obtenerIdCliente = await prepararCliente(req.body);
    const { servicio } = await comprobarHueco({ idBarbero, idServicio, fecha, hora });
    const idCliente = await obtenerIdCliente();

    const cita = await insertarCita({ idCliente, idBarbero, idServicio: servicio.id, fecha, hora });
    res.status(201).json({ id: cita.id, fecha, hora, servicio: servicio.nombre });
  } catch (e) { next(e); }
});

// GET /api/gestion/citas/15
router.get('/gestion/citas/:id', requiereSesion, async (req, res, next) => {
  try {
    res.json(await citaDelBarbero(req.params.id, req.session.barbero.id));
  } catch (e) { next(e); }
});

// PUT /api/gestion/citas/15 — cambia cliente, servicio, día y hora
router.put('/gestion/citas/:id', requiereSesion, async (req, res, next) => {
  try {
    const idBarbero = req.session.barbero.id;
    const actual = await citaDelBarbero(req.params.id, idBarbero);
    if (actual.pasada) throw new ErrorHttp(400, 'No se puede editar una cita que ya ha empezado o pasado.');

    const { servicio: idServicio, fecha, hora } = req.body;
    const obtenerIdCliente = await prepararCliente(req.body);
    const { servicio } = await comprobarHueco({ idBarbero, idServicio, fecha, hora, excluirId: actual.id });
    const idCliente = await obtenerIdCliente();

    const { error } = await supabase
      .from('cita')
      .update({
        id_cliente: idCliente,
        id_servicio: servicio.id,
        fecha_y_hora: madridADate(fecha, hora).toISOString(),
      })
      .eq('id', actual.id)
      .eq('id_barbero', idBarbero);
    if (error) throw errorDeCita(error);

    res.json({ id: actual.id, fecha, hora, servicio: servicio.nombre });
  } catch (e) { next(e); }
});

// DELETE /api/gestion/citas/15
router.delete('/gestion/citas/:id', requiereSesion, async (req, res, next) => {
  try {
    const idBarbero = req.session.barbero.id;
    const actual = await citaDelBarbero(req.params.id, idBarbero);
    const { error } = await supabase.from('cita').delete().eq('id', actual.id).eq('id_barbero', idBarbero);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
