const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verifica el JWT y adjunta el usuario al request.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.empresa_id, u.activo
       FROM usuarios u WHERE u.id = $1`,
      [payload.sub]
    );

    if (!rows.length || !rows[0].activo) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

/**
 * Middleware de autorización por roles.
 * Uso: authorize('superadmin', 'admin_cst')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes permisos para esta acción' });
  }
  next();
};

/**
 * Asegura que un cliente solo acceda a datos de su propia empresa.
 * Los admins de CST pueden acceder a cualquier empresa pasada como :empresaId.
 */
const empresaScope = async (req, res, next) => {
  const { user } = req;

  if (user.rol === 'cliente') {
    // El cliente solo puede ver su propia empresa
    req.empresaId = user.empresa_id;
    return next();
  }

  // Para admins: usar el parámetro de ruta o query si existe, si no, null = acceso total
  req.empresaId = req.params.empresaId || req.query.empresa_id || null;
  next();
};

module.exports = { authenticate, authorize, empresaScope };
