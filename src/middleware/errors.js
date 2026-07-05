const { validationResult } = require('express-validator');

/**
 * Captura errores de express-validator y devuelve 422 con detalles.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Datos de entrada inválidos',
      detalles: errors.array().map((e) => ({ campo: e.path, mensaje: e.msg })),
    });
  }
  next();
};

/**
 * Manejador global de errores — va al final del stack de Express.
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err);

  // Error de unicidad PostgreSQL
  if (err.code === '23505') {
    const match = err.detail?.match(/\((.+?)\)=\((.+?)\)/);
    const campo = match ? match[1] : 'campo';
    const valor = match ? match[2] : '';
    return res.status(409).json({
      error: `Ya existe un registro con ese ${campo}: ${valor}`,
    });
  }

  // Foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referencia inválida a un recurso inexistente' });
  }

  // Error genérico
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * 404 para rutas no encontradas.
 */
const notFound = (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
};

module.exports = { validate, errorHandler, notFound };
