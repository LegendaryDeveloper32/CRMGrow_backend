const express = require('express');

const UserCtrl = require('../controllers/user');
const MaterialCtrl = require('../controllers/material');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post(
  '/bulk-email',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.bulkEmail)
);

router.post(
  '/bulk-text',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.bulkText)
);

router.post('/social-share', catchError(MaterialCtrl.socialShare));
router.post('/thumbs-up', catchError(MaterialCtrl.thumbsUp));
router.post(
  '/update-folders',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.updateFolders)
);
router.post(
  '/remove-folders',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.removeFolders)
);
router.get('/load', UserCtrl.checkAuth, catchError(MaterialCtrl.loadMaterial));
router.post(
  '/folder',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.createFolder)
);
router.put(
  '/folder/:id',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.editFolder)
);
router.post(
  '/remove-folder',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.removeFolder)
);
router.post('/remove', UserCtrl.checkAuth, catchError(MaterialCtrl.bulkRemove));
router.post(
  '/move-material',
  UserCtrl.checkAuth,
  catchError(MaterialCtrl.moveMaterials)
);

module.exports = router;
