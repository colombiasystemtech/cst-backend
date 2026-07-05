// ─── routes/auth.js ──────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/errors');

router.post('/login',   ctrl.loginValidation, validate, ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout',  authenticate, ctrl.logout);
router.get('/me',       authenticate, ctrl.me);

module.exports = router;
