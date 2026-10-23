const express = require('express');
const supabase = require('../lib/supabase');
const { esFecha, huecosLibres } = require('../lib/horario');
const {
  esId,
  fechaFueraDeRango,
  obtenerServicio,
  obtenerServicios,
  citasOcupadas,
  validarCliente,
  comprobarHueco,
  insertarCita,
} = require('../lib/citas');

const router = express.Router();

router.get('/barberos', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('barbero')
      .select('id, nombre, apellidos')
      .order('id');
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/servicios', async (req, res, next) => {
  try {
    res.json(await obtenerServicios());
  } catch (e) { next(e); }
});

// GET /api/disponibilidad?barbero=1&servicio=2&fecha=2026-10-22
router.get('/disponibilidad', async (req, res, next) => {
  try {
    const { barbero, servicio, fecha } = req.query;
    if (!esId(barbero) || !esId(servicio) || !esFecha(fecha)) {
      return res.status(400).json({ error: 'Parámetros no válidos' });
    }
    if (fechaFueraDeRango(fecha)) return res.json({ huecos: [] });

    const serv = await obtenerServicio(servicio);
    if (!serv) return res.status(404).json({ error: 'Servicio no encontrado' });

    const ocupadas = await citasOcupadas(barbero, fecha);
    res.json({ huecos: huecosLibres(fecha, serv.duracion, ocupadas) });
  } catch (e) { next(e); }
});

// POST /api/citas (reserva pública)
router.post('/citas', async (req, res, next) => {
  try {
    const { barbero: idBarbero, servicio: idServicio, fecha, hora } = req.body;
    const datosCliente = validarCliente(req.body);
    const { barbero, servicio } = await comprobarHueco({ idBarbero, idServicio, fecha, hora });

    // El cliente se reconoce por su teléfono
    const { data: cliente, error } = await supabase
      .from('cliente')
      .upsert(datosCliente, { onConflict: 'telefono' })
      .select('id')
      .single();
    if (error) throw error;

    const cita = await insertarCita({ idCliente: cliente.id, idBarbero: barbero.id, idServicio: servicio.id, fecha, hora });

    res.status(201).json({
      id: cita.id,
      barbero: `${barbero.nombre} ${barbero.apellidos || ''}`.trim(),
      servicio: servicio.nombre,
      duracion: servicio.duracion,
      precio: servicio.precio,
      fecha,
      hora,
      nombre: datosCliente.nombre,
    });
  } catch (e) { next(e); }
});

module.exports = router;
