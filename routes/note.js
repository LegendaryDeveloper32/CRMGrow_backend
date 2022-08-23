const express = require('express');

const UserCtrl = require('../controllers/user');
const NoteCtrl = require('../controllers/note');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  UserCtrl.checkAuth,
  UserCtrl.checkSuspended,
  catchError(NoteCtrl.create)
);
router.get('/', UserCtrl.checkAuth, catchError(NoteCtrl.get));
router.post(
  '/create',
  UserCtrl.checkAuth,
  UserCtrl.checkSuspended,
  catchError(NoteCtrl.bulkCreate)
);
router.put('/:id', UserCtrl.checkAuth, catchError(NoteCtrl.update));
router.delete('/:id', UserCtrl.checkAuth, catchError(NoteCtrl.remove));

module.exports = router;
