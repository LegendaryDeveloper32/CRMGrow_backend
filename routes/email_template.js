const express = require('express');

const UserCtrl = require('../controllers/user');
const TemplateCtrl = require('../controllers/email_template');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.get('/', UserCtrl.checkAuth, catchError(TemplateCtrl.getAll));
router.post('/create', UserCtrl.checkAuth, catchError(TemplateCtrl.create));
router.get(
  '/easy-load',
  UserCtrl.checkAuth,
  catchError(TemplateCtrl.getEasyLoad)
);
router.get('/:id', UserCtrl.checkAuth, catchError(TemplateCtrl.get));
router.put('/:id', UserCtrl.checkAuth, catchError(TemplateCtrl.update));
router.delete('/:id', UserCtrl.checkAuth, catchError(TemplateCtrl.remove));
router.post('/list/own', UserCtrl.checkAuth, catchError(TemplateCtrl.loadOwn));
router.post(
  '/list/:page',
  UserCtrl.checkAuth,
  catchError(TemplateCtrl.getTemplates)
);
router.post('/delete', UserCtrl.checkAuth, catchError(TemplateCtrl.bulkRemove));
router.post('/search', UserCtrl.checkAuth, catchError(TemplateCtrl.search));
router.post(
  '/search-own',
  UserCtrl.checkAuth,
  catchError(TemplateCtrl.ownSearch)
);
// router.get('/receive' , UserCtrl.checkAuth, catchError(EmailCtrl.receive))

module.exports = router;
