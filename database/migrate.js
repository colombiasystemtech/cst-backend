/**
 * Migraciones de base de datos — Colombia System Tech Portal
 * Ejecutar: node database/migrate.js
 * Resetear: node database/migrate.js reset
 */

require('dotenv').config();
const { pool } = require('../config/database');

const migrations = [

  // ─── 001: Extensiones ───────────────────────────────────────────────
  {
    name: '001_extensions',
    up: `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `,
  },

  // ─── 002: Empresas (clientes) ───────────────────────────────────────
  {
    name: '002_empresas',
    up: `
      CREATE TABLE IF NOT EXISTS empresas (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre        VARCHAR(200) NOT NULL,
        nit           VARCHAR(20) UNIQUE NOT NULL,
        email         VARCHAR(150) UNIQUE NOT NULL,
        telefono      VARCHAR(30),
        direccion     TEXT,
        ciudad        VARCHAR(100),
        contacto      VARCHAR(150),
        activa        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      COMMENT ON TABLE empresas IS 'Clientes de Colombia System Tech';
    `,
  },

  // ─── 003: Usuarios ──────────────────────────────────────────────────
  {
    name: '003_usuarios',
    up: `
      CREATE TYPE rol_usuario AS ENUM ('superadmin', 'admin_cst', 'cliente');

      CREATE TABLE IF NOT EXISTS usuarios (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id      UUID REFERENCES empresas(id) ON DELETE SET NULL,
        nombre          VARCHAR(150) NOT NULL,
        email           VARCHAR(150) UNIQUE NOT NULL,
        password_hash   TEXT NOT NULL,
        rol             rol_usuario NOT NULL DEFAULT 'cliente',
        activo          BOOLEAN NOT NULL DEFAULT true,
        ultimo_acceso   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_usuarios_empresa  ON usuarios(empresa_id);
      CREATE INDEX idx_usuarios_email    ON usuarios(email);

      COMMENT ON TABLE usuarios IS 'Usuarios del portal (clientes y técnicos CST)';
    `,
  },

  // ─── 004: Equipos ───────────────────────────────────────────────────
  {
    name: '004_equipos',
    up: `
      CREATE TYPE tipo_equipo  AS ENUM ('desktop', 'laptop', 'servidor', 'impresora', 'red', 'otro');
      CREATE TYPE estado_equipo AS ENUM ('operativo', 'mantenimiento', 'alerta', 'dado_de_baja');

      CREATE TABLE IF NOT EXISTS equipos (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        numero_inventario VARCHAR(50) UNIQUE NOT NULL,
        nombre            VARCHAR(150) NOT NULL,
        tipo              tipo_equipo NOT NULL DEFAULT 'desktop',
        estado            estado_equipo NOT NULL DEFAULT 'operativo',

        -- Especificaciones técnicas
        marca             VARCHAR(100),
        modelo            VARCHAR(150),
        serial            VARCHAR(100),
        procesador        VARCHAR(100),
        ram_gb            SMALLINT,
        almacenamiento    VARCHAR(100),
        sistema_operativo VARCHAR(100),
        gpu               VARCHAR(100),

        -- Fechas
        fecha_compra      DATE,
        garantia_hasta    DATE,
        ultimo_servicio   DATE,
        proximo_servicio  DATE,

        -- Ubicación
        ubicacion         VARCHAR(200),
        asignado_a        VARCHAR(150),

        -- Meta
        notas             TEXT,
        activo            BOOLEAN NOT NULL DEFAULT true,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_equipos_empresa ON equipos(empresa_id);
      CREATE INDEX idx_equipos_estado  ON equipos(estado);
      CREATE INDEX idx_equipos_tipo    ON equipos(tipo);

      COMMENT ON TABLE equipos IS 'Activos tecnológicos de cada empresa cliente';
    `,
  },

  // ─── 005: Mantenimientos ────────────────────────────────────────────
  {
    name: '005_mantenimientos',
    up: `
      CREATE TYPE tipo_mantenimiento   AS ENUM ('preventivo', 'correctivo', 'actualizacion', 'instalacion', 'diagnostico');
      CREATE TYPE estado_mantenimiento AS ENUM ('programado', 'en_proceso', 'completado', 'cancelado');

      CREATE TABLE IF NOT EXISTS mantenimientos (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        equipo_id       UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        tecnico_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,

        numero_orden    VARCHAR(30) UNIQUE NOT NULL,
        tipo            tipo_mantenimiento NOT NULL,
        estado          estado_mantenimiento NOT NULL DEFAULT 'programado',

        titulo          VARCHAR(200) NOT NULL,
        descripcion     TEXT,
        diagnostico     TEXT,
        trabajo_realizado TEXT,
        recomendaciones TEXT,

        -- Fechas
        fecha_programada  DATE,
        fecha_inicio      TIMESTAMPTZ,
        fecha_fin         TIMESTAMPTZ,

        -- Costos (para historial interno del técnico)
        costo_mano_obra DECIMAL(12,2),
        costo_repuestos DECIMAL(12,2),

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_mant_equipo   ON mantenimientos(equipo_id);
      CREATE INDEX idx_mant_empresa  ON mantenimientos(empresa_id);
      CREATE INDEX idx_mant_tecnico  ON mantenimientos(tecnico_id);
      CREATE INDEX idx_mant_estado   ON mantenimientos(estado);
      CREATE INDEX idx_mant_fecha    ON mantenimientos(fecha_programada);

      COMMENT ON TABLE mantenimientos IS 'Historial de servicios técnicos por equipo';
    `,
  },

  // ─── 006: Repuestos usados en mantenimientos ────────────────────────
  {
    name: '006_repuestos',
    up: `
      CREATE TABLE IF NOT EXISTS repuestos_mantenimiento (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        mantenimiento_id  UUID NOT NULL REFERENCES mantenimientos(id) ON DELETE CASCADE,
        descripcion       VARCHAR(200) NOT NULL,
        cantidad          SMALLINT NOT NULL DEFAULT 1,
        costo_unitario    DECIMAL(12,2),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_repuestos_mant ON repuestos_mantenimiento(mantenimiento_id);
    `,
  },

  // ─── 007: Alertas ───────────────────────────────────────────────────
  {
    name: '007_alertas',
    up: `
      CREATE TYPE tipo_alerta      AS ENUM ('almacenamiento', 'licencia', 'actualizacion', 'hardware', 'seguridad', 'otro');
      CREATE TYPE prioridad_alerta AS ENUM ('baja', 'media', 'alta', 'critica');
      CREATE TYPE estado_alerta    AS ENUM ('activa', 'en_gestion', 'resuelta', 'descartada');

      CREATE TABLE IF NOT EXISTS alertas (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        equipo_id       UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
        empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

        tipo            tipo_alerta NOT NULL,
        prioridad       prioridad_alerta NOT NULL DEFAULT 'media',
        estado          estado_alerta NOT NULL DEFAULT 'activa',

        titulo          VARCHAR(200) NOT NULL,
        descripcion     TEXT,
        accion_sugerida TEXT,

        -- Resolución
        resuelta_en     TIMESTAMPTZ,
        resuelta_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
        nota_resolucion TEXT,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_alertas_equipo   ON alertas(equipo_id);
      CREATE INDEX idx_alertas_empresa  ON alertas(empresa_id);
      CREATE INDEX idx_alertas_estado   ON alertas(estado);
      CREATE INDEX idx_alertas_prioridad ON alertas(prioridad);
    `,
  },

  // ─── 008: Refresh tokens ────────────────────────────────────────────
  {
    name: '008_refresh_tokens',
    up: `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token       TEXT UNIQUE NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        revoked     BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_rt_usuario ON refresh_tokens(usuario_id);
      CREATE INDEX idx_rt_token   ON refresh_tokens(token);
    `,
  },

  // ─── 009: Trigger updated_at automático ─────────────────────────────
  {
    name: '009_updated_at_trigger',
    up: `
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_empresas_updated_at
        BEFORE UPDATE ON empresas
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TRIGGER trg_usuarios_updated_at
        BEFORE UPDATE ON usuarios
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TRIGGER trg_equipos_updated_at
        BEFORE UPDATE ON equipos
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TRIGGER trg_mantenimientos_updated_at
        BEFORE UPDATE ON mantenimientos
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TRIGGER trg_alertas_updated_at
        BEFORE UPDATE ON alertas
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `,
  },

];

// ─── Migration runner ───────────────────────────────────────────────────
async function migrate(reset = false) {
  const client = await pool.connect();
  try {
    // Tabla de control de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    if (reset) {
      console.log('⚠️  Reseteando base de datos...');
      await client.query(`
        DROP TABLE IF EXISTS
          refresh_tokens, repuestos_mantenimiento, alertas,
          mantenimientos, equipos, usuarios, empresas, _migrations
        CASCADE;
        DROP TYPE IF EXISTS
          rol_usuario, tipo_equipo, estado_equipo,
          tipo_mantenimiento, estado_mantenimiento,
          tipo_alerta, prioridad_alerta, estado_alerta
        CASCADE;
        DROP FUNCTION IF EXISTS set_updated_at CASCADE;
      `);
      console.log('✅ Base de datos limpiada\n');
    }

    for (const m of migrations) {
      const { rows } = await client.query(
        'SELECT name FROM _migrations WHERE name = $1',
        [m.name]
      );
      if (rows.length > 0) {
        console.log(`⏭  ${m.name} — ya aplicada`);
        continue;
      }
      try {
        await client.query('BEGIN');
        await client.query(m.up);
        await client.query('INSERT INTO _migrations(name) VALUES($1)', [m.name]);
        await client.query('COMMIT');
        console.log(`✅ ${m.name} — aplicada`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ ${m.name} — ERROR:`, err.message);
        throw err;
      }
    }

    console.log('\n🚀 Migraciones completadas');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate(process.argv[2] === 'reset').catch((err) => {
  console.error(err);
  process.exit(1);
});
