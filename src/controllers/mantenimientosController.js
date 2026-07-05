const { body, param } = require('express-validator');
const { query, transaction } = require('../../config/database');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generarNumeroOrden = () => {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${yyyymmdd}-${rand}`;
};

// ─── Validaciones ─────────────────────────────────────────────────────────────

exports.createValidation = [
  body('equipo_id').isUUID().withMessage('equipo_id inválido'),
  body('tipo').isIn(['preventivo','correctivo','actualizacion','instalacion','diagnostico']).withMessage('Tipo inválido'),
  body('titulo').notEmpty().trim().withMessage('Título requerido'),
  body('fecha_programada').optional().isDate().withMessage('Fecha inválida'),
];

// ─── GET /mantenimientos ──────────────────────────────────────────────────────

exports.list = async (req, res, next) => {
  try {
    const empresaId = req.empresaId;
    const { estado, tipo, equipo_id, desde, hasta, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [];
    const params = [];
    let i = 1;

    if (empresaId)  { conditions.push(`m.empresa_id = $${i++}`); params.push(empresaId); }
    if (estado)     { conditions.push(`m.estado = $${i++}`); params.push(estado); }
    if (tipo)       { conditions.push(`m.tipo = $${i++}`); params.push(tipo); }
    if (equipo_id)  { conditions.push(`m.equipo_id = $${i++}`); params.push(equipo_id); }
    if (desde)      { conditions.push(`m.fecha_programada >= $${i++}`); params.push(desde); }
    if (hasta)      { conditions.push(`m.fecha_programada <= $${i++}`); params.push(hasta); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await query(`
      SELECT
        m.*,
        e.nombre  AS equipo_nombre,
        e.modelo  AS equipo_modelo,
        e.numero_inventario,
        emp.nombre AS empresa_nombre,
        u.nombre  AS tecnico_nombre
      FROM mantenimientos m
      JOIN equipos    e   ON e.id  = m.equipo_id
      JOIN empresas   emp ON emp.id = m.empresa_id
      LEFT JOIN usuarios u ON u.id = m.tecnico_id
      ${where}
      ORDER BY m.fecha_programada DESC, m.created_at DESC
      LIMIT $${i} OFFSET $${i+1}
    `, [...params, parseInt(limit), offset]);

    const { rows: [{ total }] } = await query(
      `SELECT COUNT(*) AS total FROM mantenimientos m ${where}`, params
    );

    res.json({
      data: rows,
      paginacion: { total: parseInt(total), pagina: parseInt(page), limite: parseInt(limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /mantenimientos/:id ──────────────────────────────────────────────────

exports.get = async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT m.*, e.nombre AS equipo_nombre, e.modelo AS equipo_modelo,
             e.numero_inventario, emp.nombre AS empresa_nombre,
             u.nombre AS tecnico_nombre, u.email AS tecnico_email
      FROM mantenimientos m
      JOIN equipos    e   ON e.id  = m.equipo_id
      JOIN empresas   emp ON emp.id = m.empresa_id
      LEFT JOIN usuarios u ON u.id = m.tecnico_id
      WHERE m.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Mantenimiento no encontrado' });

    if (req.user.rol === 'cliente' && rows[0].empresa_id !== req.user.empresa_id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Repuestos usados
    const { rows: repuestos } = await query(
      'SELECT * FROM repuestos_mantenimiento WHERE mantenimiento_id = $1',
      [req.params.id]
    );

    res.json({ ...rows[0], repuestos });
  } catch (err) {
    next(err);
  }
};

// ─── POST /mantenimientos ─────────────────────────────────────────────────────

exports.create = async (req, res, next) => {
  try {
    const {
      equipo_id, tipo, titulo, descripcion, fecha_programada,
      tecnico_id, repuestos = [],
    } = req.body;

    const { rows: [eq] } = await query(
      'SELECT empresa_id FROM equipos WHERE id = $1 AND activo = true',
      [equipo_id]
    );
    if (!eq) return res.status(404).json({ error: 'Equipo no encontrado' });

    const result = await transaction(async (client) => {
      const { rows: [mant] } = await client.query(`
        INSERT INTO mantenimientos (
          equipo_id, empresa_id, tecnico_id, numero_orden,
          tipo, estado, titulo, descripcion, fecha_programada
        ) VALUES ($1,$2,$3,$4,$5,'programado',$6,$7,$8)
        RETURNING *
      `, [
        equipo_id, eq.empresa_id,
        tecnico_id || null,
        generarNumeroOrden(),
        tipo, titulo, descripcion || null,
        fecha_programada || null,
      ]);

      // Insertar repuestos si los hay
      for (const r of repuestos) {
        await client.query(`
          INSERT INTO repuestos_mantenimiento (mantenimiento_id, descripcion, cantidad, costo_unitario)
          VALUES ($1,$2,$3,$4)
        `, [mant.id, r.descripcion, r.cantidad || 1, r.costo_unitario || null]);
      }

      // Actualizar estado del equipo
      if (tipo === 'correctivo' || tipo === 'preventivo') {
        await client.query(
          "UPDATE equipos SET estado = 'mantenimiento' WHERE id = $1",
          [equipo_id]
        );
      }

      return mant;
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /mantenimientos/:id ────────────────────────────────────────────────

exports.update = async (req, res, next) => {
  try {
    const { rows: existing } = await query(
      'SELECT * FROM mantenimientos WHERE id = $1', [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'No encontrado' });

    const m = existing[0];

    const campos = ['tipo','estado','titulo','descripcion','diagnostico',
      'trabajo_realizado','recomendaciones','fecha_programada',
      'fecha_inicio','fecha_fin','tecnico_id','costo_mano_obra','costo_repuestos'];

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
      `UPDATE mantenimientos SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );

    // Si se completó el mantenimiento, actualizar el equipo
    if (req.body.estado === 'completado') {
      await query(`
        UPDATE equipos SET
          estado = 'operativo',
          ultimo_servicio = NOW()::date
        WHERE id = $1
      `, [m.equipo_id]);
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// ─── GET /mantenimientos/stats ────────────────────────────────────────────────

exports.stats = async (req, res, next) => {
  try {
    const empresaId = req.empresaId;
    const filter = empresaId ? 'WHERE empresa_id = $1' : '';
    const params = empresaId ? [empresaId] : [];

    const { rows } = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE estado = 'completado')  AS completados,
        COUNT(*) FILTER (WHERE estado = 'en_proceso')  AS en_proceso,
        COUNT(*) FILTER (WHERE estado = 'programado')  AS programados,
        COUNT(*) FILTER (WHERE tipo = 'preventivo')    AS preventivos,
        COUNT(*) FILTER (WHERE tipo = 'correctivo')    AS correctivos,
        COUNT(*) FILTER (WHERE tipo = 'instalacion')   AS instalaciones,
        COUNT(*) FILTER (WHERE tipo = 'actualizacion') AS actualizaciones
      FROM mantenimientos ${filter}
    `, params);

    // Mantenimientos por mes (últimos 12 meses)
    const { rows: porMes } = await query(`
      SELECT
        TO_CHAR(fecha_programada, 'YYYY-MM') AS mes,
        COUNT(*) AS cantidad
      FROM mantenimientos
      ${filter ? filter + ' AND' : 'WHERE'} fecha_programada >= NOW() - INTERVAL '12 months'
      GROUP BY mes
      ORDER BY mes
    `, params);

    res.json({ ...rows[0], por_mes: porMes });
  } catch (err) {
    next(err);
  }
};
