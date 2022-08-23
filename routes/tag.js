const express = require('express');

const UserCtrl = require('../controllers/user');
const TagCtrl = require('../controllers/tag');
const { catchError } = require('../controllers/error');

const router = express.Router();

router.post('/', UserCtrl.checkAuth, catchError(TagCtrl.create));
router.get('/', UserCtrl.checkAuth, catchError(TagCtrl.get));
router.post('/search', UserCtrl.checkAuth, catchError(TagCtrl.search));
router.get('/getAll', UserCtrl.checkAuth, catchError(TagCtrl.getAll));
router.get('/load', UserCtrl.checkAuth, catchError(TagCtrl.getTagsDetail));
router.post('/update', UserCtrl.checkAuth, catchError(TagCtrl.updateTag));
router.post('/delete', UserCtrl.checkAuth, catchError(TagCtrl.deleteTag));

module.exports = router;
