const { body, param, query: qv } = require('express-validator');
const { query } = require('../../config/database');

// ─── Validaciones ────────────────────────────────────────────────────────────

exports.createValidation = [
  body('nombre').notEmpty().trim().withMessage('Nombre requerido'),
  body('tipo').isIn(['desktop','laptop','servidor','impresora','red','otro']).withMessage('Tipo inválido'),
  body('numero_inventario').notEmpty().trim().withMessage('Número de inventario requerido'),
  body('empresa_id').optional().isUUID().withMessage('empresa_id inválido'),
  body('ram_gb').optional().isInt({ min: 1, max: 2048 }).withMessage('RAM inválida'),
];

exports.updateValidation = [
  param('id').isUUID().withMessage('ID inválido'),
  body('tipo').optional().isIn(['desktop','laptop','servidor','impresora','red','otro']),
  body('estado').optional().isIn(['operativo','mantenimiento','alerta','dado_de_baja']),
];

// ─── GET /equipos ────────────────────────────────────────────────────────────

exports.list = async (req, res, next) => {
  try {
    const empresaId = req.empresaId;
    const { estado, tipo, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['e.activo = true'];
    const params = [];
    let i = 1;

    if (empresaId) { conditions.push(`e.empresa_id = $${i++}`); params.push(empresaId); }
    if (estado)    { conditions.push(`e.estado = $${i++}`); params.push(estado); }
    if (tipo)      { conditions.push(`e.tipo = $${i++}`); params.push(tipo); }
    if (search)    {
      conditions.push(`(e.nombre ILIKE $${i} OR e.modelo ILIKE $${i} OR e.numero_inventario ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows: equipos } = await query(`
      SELECT e.*,
             emp.nombre AS empresa_nombre,
             (SELECT COUNT(*) FROM mantenimientos m WHERE m.equipo_id = e.id) AS total_mantenimientos,
             (SELECT COUNT(*) FROM alertas a WHERE a.equipo_id = e.id AND a.estado = 'activa') AS alertas_activas
      FROM equipos e
      JOIN empresas emp ON emp.id = e.empresa_id
      ${where}
      ORDER BY e.created_at DESC
      LIMIT $${i} OFFSET $${i+1}
    `, [...params, parseInt(limit), offset]);

    const { rows: [{ total }] } = await query(
      `SELECT COUNT(*) AS total FROM equipos e ${where}`, params
    );

    res.json({
      data: equipos,
      paginacion: {
        total: parseInt(total),
        pagina: parseInt(page),
        limite: parseInt(limit),
        paginas: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /equipos/:id ────────────────────────────────────────────────────────

exports.get = async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT e.*,
             emp.nombre AS empresa_nombre,
             emp.nit    AS empresa_nit
      FROM equipos e
      JOIN empresas emp ON emp.id = e.empresa_id
      WHERE e.id = $1 AND e.activo = true
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });

    // Verificar scope del cliente
    if (req.user.rol === 'cliente' && rows[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Últimos mantenimientos
    const { rows: mantenimientos } = await query(`
      SELECT m.id, m.numero_orden, m.tipo, m.estado, m.titulo,
             m.fecha_programada, m.fecha_fin, u.nombre AS tecnico
      FROM mantenimientos m
      LEFT JOIN usuarios u ON u.id = m.tecnico_id
      WHERE m.equipo_id = $1
      ORDER BY m.fecha_programada DESC
      LIMIT 10
    `, [req.params.id]);

    // Alertas activas del equipo
    const { rows: alertas } = await query(`
      SELECT id, tipo, prioridad, titulo, created_at
      FROM alertas WHERE equipo_id = $1 AND estado = 'activa'
    `, [req.params.id]);

    res.json({ ...rows[0], mantenimientos, alertas });
  } catch (err) {
    next(err);
  }
};

// ─── POST /equipos ───────────────────────────────────────────────────────────

exports.create = async (req, res, next) => {
  try {
    const empresaId = req.user.rol === 'cliente'
      ? req.user.empresa_id
      : (req.body.empresa_id || req.user.empresa_id);

    const {
      numero_inventario, nombre, tipo, marca, modelo, serial,
      procesador, ram_gb, almacenamiento, sistema_operativo, gpu,
      fecha_compra, garantia_hasta, ubicacion, asignado_a, notas,
    } = req.body;

    const { rows } = await query(`
      INSERT INTO equipos (
        empresa_id, numero_inventario, nombre, tipo, marca, modelo, serial,
        procesador, ram_gb, almacenamiento, sistema_operativo, gpu,
        fecha_compra, garantia_hasta, ubicacion, asignado_a, notas
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      empresaId, numero_inventario, nombre, tipo || 'desktop', marca, modelo,
      serial, procesador, ram_gb, almacenamiento, sistema_operativo, gpu,
      fecha_compra || null, garantia_hasta || null, ubicacion, asignado_a, notas,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /equipos/:id ──────────────────────────────────────────────────────

exports.update = async (req, res, next) => {
  try {
    // Verificar que existe y pertenece al scope
    const { rows: existing } = await query(
      'SELECT empresa_id FROM equipos WHERE id = $1 AND activo = true',
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Equipo no encontrado' });
    if (req.user.rol === 'cliente' && existing[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const campos = [
      'nombre','tipo','estado','marca','modelo','serial','procesador',
      'ram_gb','almacenamiento','sistema_operativo','gpu','fecha_compra',
      'garantia_hasta','proximo_servicio','ubicacion','asignado_a','notas',
    ];

    const updates = [];
    const params = [];
    let i = 1;

    for (const campo of campos) {
      if (req.body[campo] !== undefined) {
        updates.push(`${campo} = $${i++}`);
        params.push(req.body[campo]);
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE equipos SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /equipos/:id ─────────────────────────────────────────────────────

exports.remove = async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE equipos SET activo = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });
    res.json({ message: 'Equipo dado de baja correctamente' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /equipos/stats ──────────────────────────────────────────────────────

exports.stats = async (req, res, next) => {
  try {
    const empresaId = req.empresaId;
    const params = empresaId ? [empresaId] : [];
    const filter = empresaId ? 'WHERE empresa_id = $1 AND activo = true' : 'WHERE activo = true';

    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE activo = true) AS total,
        COUNT(*) FILTER (WHERE estado = 'operativo') AS operativos,
        COUNT(*) FILTER (WHERE estado = 'mantenimiento') AS en_mantenimiento,
        COUNT(*) FILTER (WHERE estado = 'alerta') AS con_alerta,
        COUNT(*) FILTER (WHERE tipo = 'desktop') AS desktops,
        COUNT(*) FILTER (WHERE tipo = 'laptop') AS laptops,
        COUNT(*) FILTER (WHERE tipo = 'servidor') AS servidores
      FROM equipos ${filter}
    `, params);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};
