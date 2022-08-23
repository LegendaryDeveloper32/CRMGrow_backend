const express = require('express');

const UserCtrl = require('../controllers/user');
const CampaignCtrl = require('../controllers/campaign');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/',
  UserCtrl.checkAuth,
  UserCtrl.checkSuspended,
  catchError(CampaignCtrl.create)
);

router.get('/', UserCtrl.checkAuth, catchError(CampaignCtrl.getAll));
router.get('/:id', UserCtrl.checkAuth, catchError(CampaignCtrl.get));

module.exports = router;
