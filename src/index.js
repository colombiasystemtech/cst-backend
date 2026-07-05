require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');

const authRoutes  = require('./routes/auth');
const equiposRoutes = require('./routes/equipos');
const { mRouter, aRouter, eRouter } = require('./routes/index');
const { errorHandler, notFound } = require('./middleware/errors');
const { pool } = require('../config/database');

const app = express();

// ─── Seguridad ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  credentials: true,
}));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)       || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intente más tarde' },
});
app.use('/api/', limiter);

// Más restrictivo en login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login' },
});
app.use('/api/auth/login', loginLimiter);

// ─── Parsers & logging ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      app: 'Colombia System Tech API',
      version: '1.0.0',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── Rutas ───────────────────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/equipos',         equiposRoutes);
app.use('/api/mantenimientos',  mRouter);
app.use('/api/alertas',         aRouter);
app.use('/api/empresas',        eRouter);

// ─── 404 y manejo de errores ─────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Inicio del servidor ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Colombia System Tech API corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health:  http://localhost:${PORT}/health\n`);
});

module.exports = app;
