/**
 * empresasController.js — CRUD de empresas (solo admin CST / superadmin)
 */
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { query } = require('../../config/database');

// ─── Empresas ─────────────────────────────────────────────────────────────────

exports.listEmpresas = async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT e.*,
        COUNT(DISTINCT u.id)  AS total_usuarios,
        COUNT(DISTINCT eq.id) AS total_equipos,
        COUNT(DISTINCT a.id) FILTER (WHERE a.estado = 'activa') AS alertas_activas
      FROM empresas e
      LEFT JOIN usuarios u  ON u.empresa_id = e.id
      LEFT JOIN equipos  eq ON eq.empresa_id = e.id AND eq.activo = true
      LEFT JOIN alertas  a  ON a.empresa_id = e.id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
};

exports.getEmpresa = async (req, res, next) => {
  try {
    const id = req.user.rol === 'cliente' ? req.user.empresa_id : req.params.id;
    const { rows } = await query('SELECT * FROM empresas WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.createEmpresaValidation = [
  body('nombre').notEmpty().trim(),
  body('nit').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
];

exports.createEmpresa = async (req, res, next) => {
  try {
    const { nombre, nit, email, telefono, direccion, ciudad, contacto } = req.body;
    const { rows } = await query(`
      INSERT INTO empresas (nombre, nit, email, telefono, direccion, ciudad, contacto)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [nombre, nit, email, telefono, direccion, ciudad, contacto]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

exports.updateEmpresa = async (req, res, next) => {
  try {
    const id = req.user.rol === 'cliente' ? req.user.empresa_id : req.params.id;
    const campos = ['nombre','telefono','direccion','ciudad','contacto'];
    const updates = []; const params = []; let i = 1;
    for (const c of campos) {
      if (req.body[c] !== undefined) { updates.push(`${c} = $${i++}`); params.push(req.body[c]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Sin campos' });
    params.push(id);
    const { rows } = await query(
      `UPDATE empresas SET ${updates.join(',')} WHERE id = $${i} RETURNING *`, params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ─── Usuarios ─────────────────────────────────────────────────────────────────

exports.listUsuarios = async (req, res, next) => {
  try {
    const empresaId = req.user.rol === 'cliente'
      ? req.user.empresa_id
      : req.query.empresa_id || null;

    let conditions = [];
    const params = [];
    let i = 1;
    if (empresaId) { conditions.push(`empresa_id = $${i++}`); params.push(empresaId); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const { rows } = await query(
      `SELECT id, nombre, email, rol, activo, ultimo_acceso, empresa_id, created_at
       FROM usuarios ${where} ORDER BY nombre`,
      params
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
};

exports.createUsuarioValidation = [
  body('nombre').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  body('rol').isIn(['admin_cst','cliente']),
];

exports.createUsuario = async (req, res, next) => {
  try {
    const { nombre, email, password, rol, empresa_id } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, empresa_id)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, nombre, email, rol, empresa_id, created_at
    `, [nombre, email, hash, rol, empresa_id || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

exports.updatePassword = async (req, res, next) => {
  try {
    const { password_actual, password_nuevo } = req.body;
    const { rows } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(password_actual, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    const hash = await bcrypt.hash(password_nuevo, 12);
    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) { next(err); }
};
