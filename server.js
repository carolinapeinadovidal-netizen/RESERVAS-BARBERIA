const express = require('express');
const session = require('express-session');
const path = require('path');
const apiRouter = require('./routes/api');
const gestionRouter = require('./routes/gestion');

const app = express();
const PORT = process.env.PORT || 3000;

// La sesión caduca tras 2 horas sin actividad
const DURACION_SESION = 2 * 60 * 60 * 1000;

if (!process.env.SESSION_SECRET) {
  throw new Error('Falta SESSION_SECRET en el archivo .env');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // cada petición renueva las 2 horas
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DURACION_SESION,
  },
}));

app.use('/api', apiRouter);
app.use('/api', gestionRouter);

// Landing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Reserva de cita
app.get('/reserva', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reserva.html'));
});

// Páginas legales
for (const pagina of ['aviso-legal', 'privacidad', 'cookies']) {
  app.get(`/${pagina}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${pagina}.html`));
  });
}

// Login de barberos
app.get('/login', (req, res) => {
  if (req.session.barbero) return res.redirect('/gestion');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Panel de gestión (solo con sesión)
app.get('/gestion', (req, res) => {
  if (!req.session.barbero) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'views', 'gestion.html'));
});

app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error del servidor. Inténtalo de nuevo.' });
});

app.listen(PORT, () => {
  console.log(`Barbería escuchando en http://localhost:${PORT}`);
});
