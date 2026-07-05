// ─── routes/mantenimientos.js ─────────────────────────────────────────────────
const express = require('express');
const mRouter = express.Router();
const mCtrl   = require('../controllers/mantenimientosController');
const { authenticate, authorize, empresaScope } = require('../middleware/auth');
const { validate } = require('../middleware/errors');

mRouter.use(authenticate, empresaScope);
mRouter.get('/',       mCtrl.list);
mRouter.get('/stats',  mCtrl.stats);
mRouter.get('/:id',    mCtrl.get);
mRouter.post('/',      authorize('superadmin','admin_cst'), mCtrl.createValidation, validate, mCtrl.create);
mRouter.patch('/:id',  authorize('superadmin','admin_cst'), mCtrl.update);

// ─── routes/alertas.js ────────────────────────────────────────────────────────
const aRouter = express.Router();
const aCtrl   = require('../controllers/alertasController');

aRouter.use(authenticate, empresaScope);
aRouter.get('/',                  aCtrl.list);
aRouter.post('/',                 authorize('superadmin','admin_cst'), aCtrl.createValidation, validate, aCtrl.create);
aRouter.patch('/:id/resolver',    aCtrl.resolver);

// ─── routes/empresas.js ──────────────────────────────────────────────────────
const eRouter = express.Router();
const eCtrl   = require('../controllers/empresasController');

eRouter.use(authenticate);

// Empresas
eRouter.get('/',             authorize('superadmin','admin_cst'), eCtrl.listEmpresas);
eRouter.get('/mi-empresa',   eCtrl.getEmpresa);
eRouter.get('/:id',          authorize('superadmin','admin_cst'), eCtrl.getEmpresa);
eRouter.post('/',            authorize('superadmin'), eCtrl.createEmpresaValidation, validate, eCtrl.createEmpresa);
eRouter.patch('/:id',        authorize('superadmin','admin_cst'), eCtrl.updateEmpresa);

// Usuarios
eRouter.get('/usuarios/lista',        eCtrl.listUsuarios);
eRouter.post('/usuarios',             authorize('superadmin','admin_cst'), eCtrl.createUsuarioValidation, validate, eCtrl.createUsuario);
eRouter.patch('/usuarios/password',   eCtrl.updatePassword);

module.exports = { mRouter, aRouter, eRouter };
