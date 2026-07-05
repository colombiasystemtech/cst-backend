/**
 * Datos de prueba — Colombia System Tech Portal
 * Ejecutar: node database/seed.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Insertando datos de prueba...\n');

    // ─── Empresa demo ───────────────────────────────────────────────
    const { rows: [empresa] } = await client.query(`
      INSERT INTO empresas (nombre, nit, email, telefono, direccion, ciudad, contacto)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (nit) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id
    `, ['Empresa Alfa S.A.S', '900123456-7', 'admin@empresaalfa.com',
        '3001234567', 'Cra 15 #45-23 Of. 301', 'Bogotá', 'Carlos Mendoza']);
    console.log(`✅ Empresa creada: ${empresa.id}`);

    // ─── Usuarios ───────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('Admin123!', 12);

    await client.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol)
      VALUES ($1,$2,$3,'superadmin')
      ON CONFLICT (email) DO NOTHING
    `, ['Administrador CST', 'admin@colombiasystemtech.com', passwordHash]);

    const { rows: [tecnico] } = await client.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol)
      VALUES ($1,$2,$3,'admin_cst')
      ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id
    `, ['Juan Camilo Ruiz', 'jruiz@colombiasystemtech.com', passwordHash]);

    const { rows: [userCliente] } = await client.query(`
      INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
      VALUES ($1,$2,$3,$4,'cliente')
      ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id
    `, [empresa.id, 'Carlos Mendoza', 'admin@empresaalfa.com', passwordHash]);

    console.log(`✅ Usuarios creados`);

    // ─── Equipos ────────────────────────────────────────────────────
    const equiposData = [
      {
        numero: 'INV-2024-001', nombre: 'PC Contabilidad 01', tipo: 'desktop',
        estado: 'operativo', marca: 'DELL', modelo: 'OptiPlex 7090',
        serial: 'DL7090-COL-001', procesador: 'Intel Core i7-11700',
        ram: 16, almacenamiento: 'SSD 512 GB Samsung 870', so: 'Windows 11 Pro',
        ubicacion: 'Área de Contabilidad', asignado: 'Ana Lucía Torres',
        ultimo: '2025-05-02', proximo: '2025-08-02',
      },
      {
        numero: 'INV-2024-002', nombre: 'PC Gerencia', tipo: 'desktop',
        estado: 'mantenimiento', marca: 'HP', modelo: 'EliteDesk 800 G8',
        serial: 'HP800G8-COL-002', procesador: 'Intel Core i9-10900',
        ram: 32, almacenamiento: 'SSD 1 TB Samsung 980 Pro', so: 'Windows 11 Pro',
        ubicacion: 'Gerencia General', asignado: 'Roberto Cifuentes',
        ultimo: '2024-12-10', proximo: '2025-06-15',
      },
      {
        numero: 'INV-2024-003', nombre: 'Laptop Ventas 01', tipo: 'laptop',
        estado: 'operativo', marca: 'Lenovo', modelo: 'ThinkPad E15 Gen 3',
        serial: 'LNV-E15-COL-003', procesador: 'Intel Core i5-1135G7',
        ram: 8, almacenamiento: 'SSD 256 GB', so: 'Windows 10 Pro',
        ubicacion: 'Área Comercial', asignado: 'Mónica Pérez',
        ultimo: '2025-04-15', proximo: '2025-07-15',
      },
      {
        numero: 'INV-2024-004', nombre: 'PC Diseño Gráfico', tipo: 'desktop',
        estado: 'operativo', marca: 'MSI', modelo: 'Infinite RS 12TH',
        serial: 'MSI-INF-COL-004', procesador: 'Intel Core i9-12900K',
        ram: 64, almacenamiento: 'SSD NVMe 2 TB Samsung 970 EVO',
        so: 'Windows 11 Pro', gpu: 'NVIDIA RTX 3080 10 GB',
        ubicacion: 'Área de Diseño', asignado: 'Felipe Andrade',
        ultimo: '2025-04-15', proximo: '2025-07-15',
      },
      {
        numero: 'INV-2024-005', nombre: 'PC Recursos Humanos', tipo: 'desktop',
        estado: 'alerta', marca: 'Lenovo', modelo: 'ThinkCentre M70q',
        serial: 'LNV-M70Q-COL-005', procesador: 'Intel Core i5-10400',
        ram: 8, almacenamiento: 'HDD 256 GB (94% uso)', so: 'Windows 10 Pro',
        ubicacion: 'Área de RRHH', asignado: 'Sandra Gómez',
        ultimo: '2025-01-15', proximo: '2025-07-10',
        notas: 'ALERTA: Disco con 94% de capacidad usada. Requiere limpieza urgente.',
      },
      {
        numero: 'INV-2024-006', nombre: 'Laptop Soporte Técnico', tipo: 'laptop',
        estado: 'operativo', marca: 'ASUS', modelo: 'ExpertBook B9 B9450FA',
        serial: 'ASUS-B9-COL-006', procesador: 'Intel Core i7-1165G7',
        ram: 16, almacenamiento: 'SSD 512 GB', so: 'Windows 11 Pro',
        ubicacion: 'Sala de Reuniones', asignado: 'Pool equipo',
        ultimo: '2025-01-15', proximo: '2025-07-15',
      },
    ];

    const equipoIds = [];
    for (const e of equiposData) {
      const { rows: [eq] } = await client.query(`
        INSERT INTO equipos (
          empresa_id, numero_inventario, nombre, tipo, estado,
          marca, modelo, serial, procesador, ram_gb, almacenamiento,
          sistema_operativo, gpu, ubicacion, asignado_a,
          ultimo_servicio, proximo_servicio, notas
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (numero_inventario) DO UPDATE SET estado = EXCLUDED.estado
        RETURNING id
      `, [
        empresa.id, e.numero, e.nombre, e.tipo, e.estado,
        e.marca, e.modelo, e.serial, e.procesador, e.ram,
        e.almacenamiento, e.so, e.gpu || null, e.ubicacion, e.asignado,
        e.ultimo, e.proximo, e.notas || null,
      ]);
      equipoIds.push({ id: eq.id, nombre: e.nombre });
    }
    console.log(`✅ ${equipoIds.length} equipos creados`);

    // ─── Mantenimientos ─────────────────────────────────────────────
    const mantData = [
      {
        eq: 1, orden: 'ORD-2025-0608', tipo: 'preventivo', estado: 'en_proceso',
        titulo: 'Mantenimiento preventivo — PC Gerencia',
        desc: 'Limpieza interna completa, aplicación de pasta térmica, revisión de fuente de poder, diagnóstico de componentes.',
        programada: '2025-06-08', inicio: '2025-06-08 09:00',
      },
      {
        eq: 0, orden: 'ORD-2025-0502', tipo: 'actualizacion', estado: 'completado',
        titulo: 'Actualización SO y drivers — PC Contabilidad 01',
        desc: 'Actualización a Windows 11 Pro 24H2, actualización de BIOS, instalación de drivers certificados.',
        trabajo: 'Se actualizó exitosamente el sistema operativo a la versión 24H2. BIOS actualizado a versión 1.8.2. Todos los drivers certificados instalados y verificados.',
        programada: '2025-05-02', inicio: '2025-05-02 08:00', fin: '2025-05-02 11:30',
      },
      {
        eq: 3, orden: 'ORD-2025-0415', tipo: 'instalacion', estado: 'completado',
        titulo: 'Instalación SSD NVMe — PC Diseño Gráfico',
        desc: 'Instalación de SSD Samsung 970 EVO 2TB, migración de datos desde HDD anterior, clonación de partición del sistema operativo.',
        trabajo: 'SSD instalado y funcional. Migración de 1.2 TB de datos completada sin pérdidas. Sistema operativo clonado y verificado. Rendimiento mejorado en 380% respecto al HDD.',
        programada: '2025-04-15', inicio: '2025-04-15 09:00', fin: '2025-04-15 14:00',
      },
      {
        eq: 2, orden: 'ORD-2025-0310', tipo: 'correctivo', estado: 'completado',
        titulo: 'Reemplazo teclado y trackpad — Laptop Ventas 01',
        desc: 'Reemplazo de teclado dañado por derrame de líquido. Limpieza de placa, prueba de circuitos.',
        trabajo: 'Teclado y trackpad reemplazados por repuestos originales Lenovo. Placa limpiada. Sistema funcional al 100%.',
        programada: '2025-03-10', inicio: '2025-03-10 10:00', fin: '2025-03-10 15:00',
      },
    ];

    for (const m of mantData) {
      const eqId = equipoIds[m.eq].id;
      const { rows: [mant] } = await client.query(`
        INSERT INTO mantenimientos (
          equipo_id, empresa_id, tecnico_id, numero_orden, tipo, estado,
          titulo, descripcion, trabajo_realizado, fecha_programada, fecha_inicio, fecha_fin
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (numero_orden) DO NOTHING
        RETURNING id
      `, [
        eqId, empresa.id, tecnico.id, m.orden, m.tipo, m.estado,
        m.titulo, m.desc, m.trabajo || null,
        m.programada, m.inicio || null, m.fin || null,
      ]);

      if (mant && m.orden === 'ORD-2025-0415') {
        await client.query(`
          INSERT INTO repuestos_mantenimiento (mantenimiento_id, descripcion, cantidad, costo_unitario)
          VALUES ($1, 'SSD Samsung 970 EVO Plus 2TB NVMe', 1, 420000)
        `, [mant.id]);
      }
    }
    console.log(`✅ Mantenimientos creados`);

    // ─── Alertas ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO alertas (equipo_id, empresa_id, tipo, prioridad, titulo, descripcion, accion_sugerida)
      VALUES
        ($1,$2,'almacenamiento','critica',
         'Disco casi lleno — PC Recursos Humanos',
         'El disco C: ha alcanzado el 94% de capacidad (238 GB de 256 GB usados). Riesgo de pérdida de datos.',
         'Realizar limpieza de archivos temporales y ampliar el almacenamiento. Se recomienda instalar SSD de 1 TB.'),
        ($3,$2,'licencia','alta',
         'Licencias de antivirus próximas a vencer',
         'Las licencias de ESET Endpoint Security en 2 equipos vencen el 25 de junio de 2025.',
         'Renovar licencias antes de la fecha de vencimiento para mantener la protección activa.'),
        ($4,$2,'actualizacion','media',
         'Actualizaciones de Windows pendientes',
         'Hay 8 actualizaciones de seguridad de Windows pendientes, incluyendo parches críticos de mayo 2025.',
         'Programar la instalación de actualizaciones fuera del horario laboral.')
      ON CONFLICT DO NOTHING
    `, [equipoIds[4].id, empresa.id, equipoIds[0].id, equipoIds[2].id]);
    console.log(`✅ Alertas creadas`);

    await client.query('COMMIT');

    console.log('\n─────────────────────────────────────────');
    console.log('🎉 Seed completado exitosamente');
    console.log('\n📋 Credenciales de acceso:');
    console.log('   Superadmin : admin@colombiasystemtech.com / Admin123!');
    console.log('   Técnico    : jruiz@colombiasystemtech.com / Admin123!');
    console.log('   Cliente    : admin@empresaalfa.com / Admin123!');
    console.log('─────────────────────────────────────────\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
