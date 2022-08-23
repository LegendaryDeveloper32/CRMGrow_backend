const express = require('express');

const UserCtrl = require('../controllers/user');
const AutomationCtrl = require('../controllers/automation');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/', UserCtrl.checkAuth, catchError(AutomationCtrl.getAll));

router.post('/search', UserCtrl.checkAuth, catchError(AutomationCtrl.search));

router.post(
  '/search-contact',
  UserCtrl.checkAuth,
  catchError(AutomationCtrl.searchContact)
);

router.post('/', UserCtrl.checkAuth, catchError(AutomationCtrl.create));

router.put('/:id', UserCtrl.checkAuth, catchError(AutomationCtrl.update));

router.delete('/:id', UserCtrl.checkAuth, catchError(AutomationCtrl.remove));

router.get('/list/own', UserCtrl.checkAuth, catchError(AutomationCtrl.loadOwn));

router.get(
  '/list/:page',
  UserCtrl.checkAuth,
  catchError(AutomationCtrl.getPage)
);

router.post(
  '/detail/:id',
  UserCtrl.checkAuth,
  catchError(AutomationCtrl.getStatus)
);

router.get(
  '/easy-load',
  UserCtrl.checkAuth,
  catchError(AutomationCtrl.getEasyLoad)
);

router.get(
  '/assigned-contacts/:id',
  UserCtrl.checkAuth,
  catchError(AutomationCtrl.getAssignedContacts)
);

router.post(
  '/contact-detail',
  UserCtrl.checkAuth,
  catchError(AutomationCtrl.getContactDetail)
);

router.post('/get-detail', UserCtrl.checkAuth, catchError(AutomationCtrl.get));

// Update existing automation
router.post(
  '/update-old',
  UserCtrl.checkAuth,
  catchError(AutomationCtrl.updateExistingContacts)
);

// Default Video Edit
router.post(
  '/update-admin',
  UserCtrl.checkAuth,
  UserCtrl.checkSuspended,
  catchError(AutomationCtrl.updateDefault)
);

module.exports = router;
