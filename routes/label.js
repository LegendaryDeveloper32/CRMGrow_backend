const express = require('express');

const UserCtrl = require('../controllers/user');
const LabelCtrl = require('../controllers/label');
const { catchError } = require('../controllers/error');

const router = express.Router();

// Create label
router.post(
  '/',
  UserCtrl.checkAuth,
  UserCtrl.checkSuspended,
  catchError(LabelCtrl.create)
);
// Get all labels
router.get('/', UserCtrl.checkAuth, catchError(LabelCtrl.getAll));
// Update label by id
router.put('/:id', UserCtrl.checkAuth, catchError(LabelCtrl.update));
// Remove label by id
router.delete('/:id', UserCtrl.checkAuth, catchError(LabelCtrl.remove));
// Change Label orders
router.post('/order', UserCtrl.checkAuth, catchError(LabelCtrl.changeOrder));

module.exports = router;
