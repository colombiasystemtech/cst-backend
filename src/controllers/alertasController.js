const { body } = require('express-validator');
const { query } = require('../../config/database');

exports.createValidation = [
  body('equipo_id').isUUID().withMessage('equipo_id inválido'),
  body('tipo').isIn(['almacenamiento','licencia','actualizacion','hardware','seguridad','otro']),
  body('prioridad').isIn(['baja','media','alta','critica']),
  body('titulo').notEmpty().trim().withMessage('Título requerido'),
];

// ─── GET /alertas ─────────────────────────────────────────────────────────────

exports.list = async (req, res, next) => {
  try {
    const empresaId = req.empresaId;
    const { estado, prioridad, tipo } = req.query;

    let conditions = [];
    const params = [];
    let i = 1;

    if (empresaId) { conditions.push(`a.empresa_id = $${i++}`); params.push(empresaId); }
    if (estado)    { conditions.push(`a.estado = $${i++}`); params.push(estado); }
    if (prioridad) { conditions.push(`a.prioridad = $${i++}`); params.push(prioridad); }
    if (tipo)      { conditions.push(`a.tipo = $${i++}`); params.push(tipo); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await query(`
      SELECT a.*, e.nombre AS equipo_nombre, e.numero_inventario,
             u.nombre AS resuelta_por_nombre
      FROM alertas a
      JOIN equipos e ON e.id = a.equipo_id
      LEFT JOIN usuarios u ON u.id = a.resuelta_por
      ${where}
      ORDER BY
        CASE a.prioridad WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
        a.created_at DESC
    `, params);

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    next(err);
  }
};

// ─── POST /alertas ────────────────────────────────────────────────────────────

exports.create = async (req, res, next) => {
  try {
    const { equipo_id, tipo, prioridad, titulo, descripcion, accion_sugerida } = req.body;

    const { rows: [eq] } = await query(
      'SELECT empresa_id FROM equipos WHERE id = $1', [equipo_id]
    );
    if (!eq) return res.status(404).json({ error: 'Equipo no encontrado' });

    // Actualizar estado del equipo si la alerta es crítica o alta
    if (['critica', 'alta'].includes(prioridad)) {
      await query("UPDATE equipos SET estado = 'alerta' WHERE id = $1", [equipo_id]);
    }

    const { rows } = await query(`
      INSERT INTO alertas (equipo_id, empresa_id, tipo, prioridad, titulo, descripcion, accion_sugerida)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [equipo_id, eq.empresa_id, tipo, prioridad, titulo, descripcion, accion_sugerida]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /alertas/:id/resolver ─────────────────────────────────────────────

exports.resolver = async (req, res, next) => {
  try {
    const { nota_resolucion } = req.body;

    const { rows } = await query(`
      UPDATE alertas SET
        estado = 'resuelta',
        resuelta_en = NOW(),
        resuelta_por = $1,
        nota_resolucion = $2
      WHERE id = $3
      RETURNING *, equipo_id
    `, [req.user.id, nota_resolucion || null, req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Alerta no encontrada' });

    // Si ya no hay alertas activas en el equipo, volver a 'operativo'
    const { rows: [{ count }] } = await query(
      "SELECT COUNT(*) FROM alertas WHERE equipo_id = $1 AND estado = 'activa'",
      [rows[0].equipo_id]
    );
    if (parseInt(count) === 0) {
      await query("UPDATE equipos SET estado = 'operativo' WHERE id = $1", [rows[0].equipo_id]);
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};
