const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { query } = require('../../config/database');

// ─── Helpers ────────────────────────────────────────────────────────────────

const signAccess = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const signRefresh = () => uuidv4() + '-' + uuidv4();

// ─── POST /auth/login ────────────────────────────────────────────────────────

exports.loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
];

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      `SELECT u.*, e.nombre AS empresa_nombre
       FROM usuarios u
       LEFT JOIN empresas e ON e.id = u.empresa_id
       WHERE u.email = $1`,
      [email]
    );

    const user = rows[0];
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Actualizar último acceso
    await query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1', [user.id]);

    // Crear refresh token
    const refreshToken = signRefresh();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
    await query(
      'INSERT INTO refresh_tokens(usuario_id, token, expires_at) VALUES($1,$2,$3)',
      [user.id, refreshToken, expiresAt]
    );

    const accessToken = signAccess(user.id);

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 604800, // 7 días en segundos
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        empresa_id: user.empresa_id,
        empresa_nombre: user.empresa_nombre,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/refresh ──────────────────────────────────────────────────────

exports.refresh = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token requerido' });
    }

    const { rows } = await query(
      `SELECT rt.*, u.activo FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token = $1 AND rt.revoked = false AND rt.expires_at > NOW()`,
      [refresh_token]
    );

    if (!rows.length || !rows[0].activo) {
      return res.status(401).json({ error: 'Refresh token inválido o expirado' });
    }

    const { usuario_id, id: tokenId } = rows[0];

    // Revocar el token actual (rotación)
    await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [tokenId]);

    // Crear nuevos tokens
    const newRefresh = signRefresh();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens(usuario_id, token, expires_at) VALUES($1,$2,$3)',
      [usuario_id, newRefresh, expiresAt]
    );

    res.json({
      access_token: signAccess(usuario_id),
      refresh_token: newRefresh,
      expires_in: 604800,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/logout ───────────────────────────────────────────────────────

exports.logout = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      await query(
        'UPDATE refresh_tokens SET revoked = true WHERE token = $1 AND usuario_id = $2',
        [refresh_token, req.user.id]
      );
    }
    res.json({ message: 'Sesión cerrada exitosamente' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /auth/me ────────────────────────────────────────────────────────────

exports.me = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.ultimo_acceso,
              u.empresa_id, e.nombre AS empresa_nombre, e.nit
       FROM usuarios u
       LEFT JOIN empresas e ON e.id = u.empresa_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};
