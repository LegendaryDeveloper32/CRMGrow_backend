const express = require('express');

const UserCtrl = require('../controllers/user');
const TimeLineCtrl = require('../controllers/time_line');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/create', UserCtrl.checkAuth, catchError(TimeLineCtrl.create));
router.post(
  '/create_new',
  UserCtrl.checkAuth,
  catchError(TimeLineCtrl.recreate)
);
router.get(
  '/cancel/:contact',
  UserCtrl.checkAuth,
  catchError(TimeLineCtrl.cancel)
);

module.exports = router;
