const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/equiposController');
const { authenticate, authorize, empresaScope } = require('../middleware/auth');
const { validate } = require('../middleware/errors');

router.use(authenticate, empresaScope);

router.get('/',        ctrl.list);
router.get('/stats',   ctrl.stats);
router.get('/:id',     ctrl.get);
router.post('/',       ctrl.createValidation, validate, ctrl.create);
router.patch('/:id',   ctrl.updateValidation, validate, ctrl.update);
router.delete('/:id',  authorize('superadmin','admin_cst'), ctrl.remove);

module.exports = router;
