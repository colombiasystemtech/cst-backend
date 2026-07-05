# Colombia System Tech — API Backend

API REST completa para el portal de gestión de equipos de cómputo.
**Stack:** Node.js · Express · PostgreSQL

---

## Estructura del proyecto

```
cst-backend/
├── config/
│   └── database.js          # Conexión al pool de PostgreSQL
├── database/
│   ├── migrate.js           # Migraciones (crea todas las tablas)
│   └── seed.js              # Datos de prueba
├── src/
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── equiposController.js
│   │   ├── mantenimientosController.js
│   │   ├── alertasController.js
│   │   └── empresasController.js
│   ├── middleware/
│   │   ├── auth.js          # JWT + autorización por roles
│   │   └── errors.js        # Validaciones y manejo de errores
│   ├── routes/
│   │   ├── auth.js
│   │   ├── equipos.js
│   │   └── index.js         # Mantenimientos, alertas, empresas
│   └── index.js             # Servidor Express principal
├── .env.example
└── package.json
```

---

## Instalación rápida

### 1. Requisitos previos
- Node.js 18+
- PostgreSQL 14+

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL
```

### 4. Crear la base de datos en PostgreSQL
```sql
-- Conectarse a psql y ejecutar:
CREATE DATABASE cst_portal;
```

### 5. Ejecutar migraciones
```bash
npm run migrate
```
Esto crea todas las tablas, tipos ENUM, índices y triggers.

### 6. Cargar datos de prueba
```bash
npm run seed
```

### 7. Iniciar el servidor
```bash
npm run dev        # Modo desarrollo (nodemon)
npm start          # Producción
```

---

## Esquema de la base de datos

```
empresas          — Clientes de CST
usuarios          — Personal CST y contactos de empresas
equipos           — Activos tecnológicos por empresa
mantenimientos    — Historial de servicios técnicos
repuestos_mant.   — Repuestos usados en cada mantenimiento
alertas           — Situaciones que requieren atención
refresh_tokens    — Gestión de sesiones JWT
```

### Roles de usuario
| Rol          | Acceso                                              |
|--------------|-----------------------------------------------------|
| `superadmin` | Todo — gestión de empresas, usuarios, equipos       |
| `admin_cst`  | Gestión técnica — crear/editar equipos y servicios  |
| `cliente`    | Solo lectura de sus propios equipos y servicios     |

---

## API Reference

### Autenticación

| Método | Ruta            | Descripción                       |
|--------|-----------------|-----------------------------------|
| POST   | /api/auth/login | Iniciar sesión → access + refresh token |
| POST   | /api/auth/refresh | Rotar refresh token              |
| POST   | /api/auth/logout | Revocar sesión                   |
| GET    | /api/auth/me    | Datos del usuario autenticado     |

**Login request:**
```json
POST /api/auth/login
{
  "email": "admin@empresaalfa.com",
  "password": "Admin123!"
}
```

**Login response:**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "uuid-uuid",
  "expires_in": 604800,
  "usuario": {
    "id": "...",
    "nombre": "Carlos Mendoza",
    "email": "admin@empresaalfa.com",
    "rol": "cliente",
    "empresa_id": "...",
    "empresa_nombre": "Empresa Alfa S.A.S"
  }
}
```

Todos los endpoints protegidos requieren header:
```
Authorization: Bearer <access_token>
```

---

### Equipos

| Método | Ruta                  | Descripción                    | Roles |
|--------|-----------------------|--------------------------------|-------|
| GET    | /api/equipos          | Listar equipos (paginado)      | Todos |
| GET    | /api/equipos/stats    | Estadísticas de equipos        | Todos |
| GET    | /api/equipos/:id      | Detalle de un equipo           | Todos |
| POST   | /api/equipos          | Crear equipo                   | CST   |
| PATCH  | /api/equipos/:id      | Actualizar equipo              | CST   |
| DELETE | /api/equipos/:id      | Dar de baja (soft delete)      | Admin |

**Filtros disponibles (GET /api/equipos):**
```
?estado=operativo|mantenimiento|alerta|dado_de_baja
?tipo=desktop|laptop|servidor|impresora|red|otro
?search=texto
?page=1&limit=20
```

---

### Mantenimientos

| Método | Ruta                        | Descripción                 | Roles |
|--------|-----------------------------|-----------------------------|-------|
| GET    | /api/mantenimientos         | Listar mantenimientos       | Todos |
| GET    | /api/mantenimientos/stats   | Estadísticas y gráfica      | Todos |
| GET    | /api/mantenimientos/:id     | Detalle + repuestos         | Todos |
| POST   | /api/mantenimientos         | Crear mantenimiento         | CST   |
| PATCH  | /api/mantenimientos/:id     | Actualizar / completar      | CST   |

**Crear mantenimiento:**
```json
POST /api/mantenimientos
{
  "equipo_id": "uuid-del-equipo",
  "tipo": "preventivo",
  "titulo": "Mantenimiento semestral",
  "descripcion": "Limpieza y diagnóstico completo",
  "fecha_programada": "2025-07-15",
  "tecnico_id": "uuid-tecnico",
  "repuestos": [
    { "descripcion": "Pasta térmica Arctic MX-4", "cantidad": 1, "costo_unitario": 25000 }
  ]
}
```

**Completar mantenimiento:**
```json
PATCH /api/mantenimientos/:id
{
  "estado": "completado",
  "trabajo_realizado": "Descripción del trabajo...",
  "recomendaciones": "...",
  "fecha_fin": "2025-07-15T17:00:00Z"
}
```
Al completar, el equipo vuelve automáticamente a estado `operativo`.

---

### Alertas

| Método | Ruta                      | Descripción          | Roles |
|--------|---------------------------|----------------------|-------|
| GET    | /api/alertas              | Listar alertas       | Todos |
| POST   | /api/alertas              | Crear alerta         | CST   |
| PATCH  | /api/alertas/:id/resolver | Marcar como resuelta | Todos |

---

### Empresas y Usuarios

| Método | Ruta                         | Descripción              | Roles     |
|--------|------------------------------|--------------------------|-----------|
| GET    | /api/empresas                | Listar empresas          | SuperAdm  |
| POST   | /api/empresas                | Crear empresa cliente    | SuperAdm  |
| GET    | /api/empresas/mi-empresa     | Datos de mi empresa      | Cliente   |
| POST   | /api/empresas/usuarios       | Crear usuario            | CST       |
| PATCH  | /api/empresas/usuarios/password | Cambiar contraseña    | Auth      |

---

## Credenciales de prueba (después del seed)

| Rol         | Email                              | Contraseña |
|-------------|-------------------------------------|------------|
| Superadmin  | admin@colombiasystemtech.com        | Admin123!  |
| Técnico CST | jruiz@colombiasystemtech.com        | Admin123!  |
| Cliente     | admin@empresaalfa.com               | Admin123!  |

---

## Reset completo de la base de datos

```bash
npm run migrate:reset   # Elimina todo
npm run migrate         # Recrea las tablas
npm run seed            # Carga datos de prueba
```

---

## Despliegue en producción

1. Configurar `NODE_ENV=production` en `.env`
2. Usar un secreto JWT fuerte (mínimo 64 caracteres aleatorios)
3. Habilitar SSL para PostgreSQL: `DB_SSL=true`
4. Usar un proceso manager como **PM2**: `pm2 start src/index.js --name cst-api`
5. Poner detrás de **Nginx** como proxy inverso
6. Recomendado: **Railway**, **Render** o **DigitalOcean App Platform** para hosting simple
