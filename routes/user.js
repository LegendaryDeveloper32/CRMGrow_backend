const express = require('express');

const { body, query } = require('express-validator/check');

const UserCtrl = require('../controllers/user');
const { catchError } = require('../controllers/error');

const router = express.Router();

// SignUp
router.post(
  '/',
  [
    body('email').isEmail(),
    body('user_name')
      .isLength({ min: 3 })
      .withMessage('user_name must be at least 3 chars long'),
    // password must be at least 5 chars long
    body('password')
      .isLength({ min: 5 })
      .withMessage('password must be at least 5 chars long'),
    // :TODO phone number regexp should be used
    body('cell_phone')
      .isLength({ min: 9 })
      .matches(/^[\+\d]?(?:[\d-.\s()]*)$/)
      .withMessage('cell_phone must be a valid phone number!'),
  ],
  catchError(UserCtrl.signUp)
);

// Login
router.post(
  '/login',
  [
    body('email').optional().isLength({ min: 3 }),
    body('user_name').optional().isLength({ min: 3 }),
    body('password').isLength({ min: 1 }),
  ],
  catchError(UserCtrl.login)
);

router.post('/check', catchError(UserCtrl.checkUser));

router.post('/logout', UserCtrl.checkAuth, catchError(UserCtrl.logout));

// Edit own profile
router.get('/me', UserCtrl.checkAuth, catchError(UserCtrl.getMe));

// Edit own profile
router.put('/me', UserCtrl.checkAuthGuest, catchError(UserCtrl.editMe));

// New Password by old one
router.post(
  '/new-password',
  UserCtrl.checkAuth,
  [
    body('old_password').isLength({ min: 5 }),
    body('new_password').isLength({ min: 5 }),
  ],
  catchError(UserCtrl.resetPasswordByOld)
);

router.post(
  '/create-password',
  UserCtrl.checkAuth,
  catchError(UserCtrl.createPassword)
);

// Forgot password
router.post('/forgot-password', catchError(UserCtrl.forgotPassword));

// Rest own profile
router.post('/reset-password', catchError(UserCtrl.resetPasswordByCode));

// Synchronize with outlook email
router.get(
  '/sync-outlook',
  UserCtrl.checkAuth,
  catchError(UserCtrl.syncOutlook)
);

// Synchronize with gmail
router.get('/sync-gmail', UserCtrl.checkAuth, catchError(UserCtrl.syncGmail));

// Disconnect with gmail
router.get(
  '/discon-email',
  UserCtrl.checkAuth,
  catchError(UserCtrl.disconnectEmail)
);

// Synchronize with yahoo
router.get('/sync-yahoo', UserCtrl.checkAuth, catchError(UserCtrl.syncYahoo));

// Outlook Email authorization
router.get(
  '/authorize-outlook',
  UserCtrl.checkAuth,
  catchError(UserCtrl.authorizeOutlook)
);

// Synchorinze other mailer
router.post(
  '/authorize-mailer',
  UserCtrl.checkAuth,
  catchError(UserCtrl.authorizeOtherEmailer)
);

// Gmail authorized
router.get(
  '/authorize-gmail',
  UserCtrl.checkAuth,
  catchError(UserCtrl.authorizeGmail)
);

// Yahoo authorized
router.get(
  '/authorize-yahoo',
  UserCtrl.checkAuth,
  catchError(UserCtrl.authorizeYahoo)
);

// Zoom authorized
router.get(
  '/authorize-zoom',
  UserCtrl.checkAuth,
  catchError(UserCtrl.authorizeZoom)
);

// Zoom authorized
router.get('/sync-zoom', UserCtrl.checkAuth, catchError(UserCtrl.syncZoom));

/**
 * Calendar
 */

// Synchronize calendar with connected outlook email
router.get(
  '/sync-google-calendar',
  UserCtrl.checkAuth,
  catchError(UserCtrl.syncGoogleCalendar)
);

// Synchronize calendar with connected outlook email
router.get(
  '/sync-outlook-calendar',
  UserCtrl.checkAuth,
  catchError(UserCtrl.syncOutlookCalendar)
);

// Synchronize calendar with connected outlook email
router.get(
  '/authorize-google-calendar',
  UserCtrl.checkAuth,
  catchError(UserCtrl.authorizeGoogleCalendar)
);

// Synchronize calendar with connected outlook email
router.get(
  '/authorize-outlook-calendar',
  UserCtrl.checkAuth,
  catchError(UserCtrl.authorizeOutlookCalendar)
);

// Daily Report
router.get(
  '/daily-report',
  UserCtrl.checkAuth,
  catchError(UserCtrl.dailyReport)
);

// Disconnect Daily Report
router.get(
  '/discon-daily',
  UserCtrl.checkAuth,
  catchError(UserCtrl.disconDaily)
);

// Daily Report
router.get(
  '/weekly-report',
  UserCtrl.checkAuth,
  catchError(UserCtrl.weeklyReport)
);

// Disconnect Weekly Report
router.get(
  '/discon-weekly',
  UserCtrl.checkAuth,
  catchError(UserCtrl.disconWeekly)
);

// Desktop Notification
router.post(
  '/desktop-notification',
  UserCtrl.checkAuth,
  catchError(UserCtrl.desktopNotification)
);

// Text Notification
router.get(
  '/text-notification',
  UserCtrl.checkAuth,
  catchError(UserCtrl.textNotification)
);

// Disconnect Google Calendar
router.post(
  '/discon-calendar',
  UserCtrl.checkAuth,
  catchError(UserCtrl.disconnectCalendar)
);

// Signup Gmail
router.get('/signup-gmail', catchError(UserCtrl.signUpGmail));

// Signup Outlook
router.get('/signup-outlook', catchError(UserCtrl.signUpOutlook));

// Social google profile
router.get('/social-gmail', catchError(UserCtrl.socialGmail));

// Edit outlook profile
router.get('/social-outlook', catchError(UserCtrl.socialOutlook));

// Edit own profile
router.post('/social-login', catchError(UserCtrl.socialLogin));

// Edit own profile
router.post('/social-signup', catchError(UserCtrl.socialSignUp));

router.get('/app-google-signin', catchError(UserCtrl.appGoogleSignIn));

router.get('/app-outlook-signin', catchError(UserCtrl.appOutlookSignIn));

// Connect Another Email Service
router.get(
  '/another-con',
  UserCtrl.checkAuth,
  catchError(UserCtrl.connectAnotherEmail)
);

// Search user email
router.post('/search-email', catchError(UserCtrl.searchUserEmail));

// Search nickname
router.post('/search-nickname', catchError(UserCtrl.searchNickName));

// Search Phonenumber
router.post('/search-phone', catchError(UserCtrl.searchPhone));

// update package
router.post(
  '/update-package',
  UserCtrl.checkAuth,
  catchError(UserCtrl.updatePackage)
);
// Schedule a paid demo
router.post(
  '/schedule-demo',
  UserCtrl.checkAuth,
  catchError(UserCtrl.schedulePaidDemo)
);

router.get('/push-notification/:id', catchError(UserCtrl.pushNotification));

// Cancel account
router.post(
  '/cancel-account',
  UserCtrl.checkAuth,
  catchError(UserCtrl.closeAccount)
);

router.get('/get-call-token', UserCtrl.getCallToken);

// Edit own profile
router.get('/:id', UserCtrl.checkAuth, catchError(UserCtrl.getUser));

// Get overflow plan status
router.post(
  '/check-downgrade',
  UserCtrl.checkAuth,
  catchError(UserCtrl.checkDowngrade)
);

module.exports = router;
