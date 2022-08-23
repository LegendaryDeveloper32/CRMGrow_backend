const express = require('express');

const UserCtrl = require('../controllers/user');
const ActivityCtrl = require('../controllers/activity');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/remove-all',
  UserCtrl.checkAuth,
  catchError(ActivityCtrl.removeAll)
);
router.post('/remove', UserCtrl.checkAuth, catchError(ActivityCtrl.removeBulk));
router.post(
  '/load',
  UserCtrl.checkAuth,
  catchError(ActivityCtrl.contactActivity)
);
router.post('/', UserCtrl.checkAuth, catchError(ActivityCtrl.create));
router.post('/get', UserCtrl.checkAuth, catchError(ActivityCtrl.load));
router.get('/', UserCtrl.checkAuth, catchError(ActivityCtrl.get));
router.get(
  '/:id',
  UserCtrl.checkAuth,
  UserCtrl.checkLastLogin,
  catchError(ActivityCtrl.get)
);
router.post('/get', UserCtrl.checkAuth, catchError(ActivityCtrl.load));

module.exports = router;
