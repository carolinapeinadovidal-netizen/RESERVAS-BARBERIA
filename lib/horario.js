// Horario de la barbería y cálculo de huecos (zona horaria de Madrid)

const ZONA = 'Europe/Madrid';
const INTERVALO = 30; // minutos entre huecos

// 0 = domingo ... 6 = sábado
const HORARIO = {
  2: [['09:00', '14:00'], ['16:00', '20:30']],
  3: [['09:00', '14:00'], ['16:00', '20:30']],
  4: [['09:00', '14:00'], ['16:00', '20:30']],
  5: [['09:00', '14:00'], ['16:00', '20:30']],
  6: [['10:00', '13:30']],
};

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const aHora = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const diaSemana = (fecha) => new Date(`${fecha}T00:00:00Z`).getUTCDay();

// Diferencia (ms) entre la hora de Madrid y UTC en un instante dado
function desfaseMadrid(ts) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ts)).map(({ type, value }) => [type, value])
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ts;
}

// "2026-10-22" + "12:00" (hora de Madrid) -> Date en UTC
function madridADate(fecha, hhmm) {
  const [y, mo, d] = fecha.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const local = Date.UTC(y, mo - 1, d, h, mi);
  let ts = local - desfaseMadrid(local);
  ts = local - desfaseMadrid(ts); // ajuste en los cambios de hora
  return new Date(ts);
}

// Fecha y minutos actuales en Madrid
function ahoraMadrid() {
  const ahora = Date.now();
  const local = new Date(ahora + desfaseMadrid(ahora));
  return {
    fecha: local.toISOString().slice(0, 10),
    minutos: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

// Date (UTC) -> { fecha: 'YYYY-MM-DD', hora: 'HH:MM' } en hora de Madrid
function aMadrid(date) {
  const ts = date.getTime();
  const local = new Date(ts + desfaseMadrid(ts));
  return { fecha: local.toISOString().slice(0, 10), hora: local.toISOString().slice(11, 16) };
}

/**
 * Huecos libres de un día para un servicio de `duracion` minutos.
 * `ocupadas` = [{ inicio: Date, fin: Date }] citas ya reservadas del barbero.
 */
function huecosLibres(fecha, duracion, ocupadas) {
  const bloques = HORARIO[diaSemana(fecha)];
  if (!bloques) return [];

  const hoy = ahoraMadrid();
  if (fecha < hoy.fecha) return [];

  const libres = [];
  for (const [abre, cierra] of bloques) {
    const fin = aMinutos(cierra);
    for (let t = aMinutos(abre); t + duracion <= fin; t += INTERVALO) {
      if (fecha === hoy.fecha && t <= hoy.minutos) continue;
      const hora = aHora(t);
      const inicio = madridADate(fecha, hora);
      const final = new Date(inicio.getTime() + duracion * 60000);
      const choca = ocupadas.some((c) => c.inicio < final && inicio < c.fin);
      if (!choca) libres.push(hora);
    }
  }
  return libres;
}

module.exports = { HORARIO, INTERVALO, esFecha, diaSemana, madridADate, aMadrid, ahoraMadrid, huecosLibres };
