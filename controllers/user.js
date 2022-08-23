const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator/check');
const randomstring = require('randomstring');
const sgMail = require('@sendgrid/mail');
const { google } = require('googleapis');
const request = require('request-promise');

const api = require('../config/api');
const system_settings = require('../config/system_settings');
const webPush = require('web-push');

const yahooCredentials = {
  clientID: api.YAHOO_CLIENT.YAHOO_CLIENT_ID1,
  clientSecret: api.YAHOO_CLIENT.YAHOO_CLIENT_CECRET,
  site: 'https://api.login.yahoo.com',
  authorizationPath: '/oauth2/request_auth',
  tokenPath: '/oauth2/get_token',
};
const yahooOauth2 = require('simple-oauth2')(yahooCredentials);

const credentials = {
  clientID: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_ID,
  clientSecret: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_SECRET,
  site: 'https://login.microsoftonline.com/common',
  authorizationPath: '/oauth2/v2.0/authorize',
  tokenPath: '/oauth2/v2.0/token',
};
const oauth2 = require('simple-oauth2')(credentials);
const nodemailer = require('nodemailer');
const AWS = require('aws-sdk');
const moment = require('moment-timezone');

const ses = new AWS.SES({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const User = require('../models/user');
const Garbage = require('../models/garbage');
const Activity = require('../models/activity');
const FollowUp = require('../models/follow_up');
const Payment = require('../models/payment');
const Appointment = require('../models/appointment');
const Contact = require('../models/contact');
const Text = require('../models/text');
const Notification = require('../models/notification');
const {
  create: createPayment,
  createCharge,
  cancelCustomer,
  updateSubscription,
} = require('./payment');
const UserLog = require('../models/user_log');
const Guest = require('../models/guest');
const Team = require('../models/team');
const PaidDemo = require('../models/paid_demo');
const Reminder = require('../models/reminder');
const Tag = require('../models/tag');
const TimeLine = require('../models/time_line');
const Video = require('../models/video');
const PDF = require('../models/pdf');

const {
  getTwilioNumber,
  releaseSignalWireNumber,
  releaseTwilioNumber,
} = require('../helpers/text');
const { sendNotificationEmail } = require('../helpers/email');
const { setPackage } = require('../helpers/user');
const urls = require('../constants/urls');
const mail_contents = require('../constants/mail_contents');

const signUp = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }

  const _user = await User.findOne({
    email: new RegExp(req.body.email, 'i'),
    del: false,
  }).catch((err) => {
    console.log('user find err in signup', err.message);
  });

  if (_user) {
    res.status(400).send({
      status: false,
      error: 'User already exists',
    });
    return;
  }

  const { user_name, email, token, referral, is_trial } = req.body;
  console.log(referral);
  const level = req.body.level || system_settings.DEFAULT_PACKAGE;

  const payment_data = {
    user_name,
    email,
    token,
    level,
    is_trial,
    referral,
  };

  createPayment(payment_data)
    .then(async (payment) => {
      const password = req.body.password;
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto
        .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
        .toString('hex');

      const user = new User({
        ...req.body,
        is_trial,
        package_level: level,
        payment: payment.id,
        salt,
        hash,
      });

      user
        .save()
        .then((_res) => {
          const garbage = new Garbage({
            user: _res.id,
          });

          garbage.save().catch((err) => {
            console.log('garbage save err', err.message);
          });

          const package_data = {
            user: _res.id,
            level,
          };

          setPackage(package_data).catch((err) => {
            console.log('user set package err', err.message);
          });

          // if (_res.phone) {
          //   getTwilioNumber(_res.id);
          // }

          const time_zone = _res.time_zone_info
            ? JSON.parse(_res.time_zone_info).tz_name
            : system_settings.TIME_ZONE;

          const email_data = {
            template_data: {
              user_email: email,
              verification_url: `${urls.VERIFY_EMAIL_URL}?id=${_res.id}`,
              user_name: _res.user_name,
              created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
              password,
              oneonone_url: urls.ONEONONE_URL,
              recording_url: urls.INTRO_VIDEO_URL,
              recording_preview: urls.RECORDING_PREVIEW_URL,
              webinar_url: system_settings.WEBINAR_LINK,
              import_url: urls.IMPORT_CSV_URL,
              template_url: urls.CONTACT_CSV_URL,
              connect_url: urls.INTEGRATION_URL,
            },
            template_name: 'Welcome',
            required_reply: true,
            email: _res.email,
          };

          sendNotificationEmail(email_data)
            .then(() => {
              console.log('welcome email has been sent out succeefully');
            })
            .catch((err) => {
              console.log('welcome email send err', err);
            });

          // const token = jwt.sign({ id: _res.id }, api.JWT_SECRET, {
          //   expiresIn: '30d',
          // });

          Team.find({ referrals: email })
            .populate('owner')
            .then((teams) => {
              for (let i = 0; i < teams.length; i++) {
                const team = teams[i];
                const members = team.members;
                const referrals = team.referrals;
                if (members.indexOf(_res.id) === -1) {
                  members.push(_res.id);
                }
                if (referrals.indexOf(email) !== -1) {
                  const pos = referrals.indexOf(email);
                  referrals.splice(pos, 1);
                }

                Team.updateOne(
                  {
                    _id: team.id,
                  },
                  {
                    $set: {
                      members,
                      referrals,
                    },
                  }
                )
                  .then(async () => {
                    sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

                    const owners = team.owner;
                    for (let i = 0; i < owners.length; i++) {
                      const owner = owners[i];
                      const msg = {
                        to: owner.email,
                        from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
                        templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
                        dynamic_template_data: {
                          subject: `${mail_contents.NOTIFICATION_INVITE_TEAM_MEMBER_ACCEPT.SUBJECT}${_res.user_name}`,
                          activity: `${mail_contents.NOTIFICATION_INVITE_TEAM_MEMBER_ACCEPT.SUBJECT}${_res.user_name} has accepted invitation to join ${team.name} in CRMGrow`,
                          team:
                            "<a href='" +
                            urls.TEAM_URL +
                            team.id +
                            "'><img src='" +
                            urls.DOMAIN_URL +
                            "assets/images/team.png'/></a>",
                        },
                      };

                      sgMail
                        .send(msg)
                        .then()
                        .catch((err) => {
                          console.log('send message err: ', err);
                        });
                    }
                  })
                  .catch((err) => {
                    console.log('team update err: ', err.message);
                  });
              }
            })
            .catch((err) => {
              console.log('err', err);
              res.status(400).send({
                status: false,
                error: err,
              });
            });

          const token = jwt.sign(
            {
              id: _res.id,
            },
            api.JWT_SECRET
          );

          const myJSON = JSON.stringify(_res);
          const user = JSON.parse(myJSON);
          delete user.hash;
          delete user.salt;
          user['payment'] = payment.id;

          return res.send({
            status: true,
            data: {
              token,
              user,
            },
          });
        })
        .catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message,
          });
        });
    })
    .catch((err) => {
      console.log('signup payment create err', err);
      res.status(400).send({
        status: false,
        error: err,
      });
    });
};

const checkUser = async (req, res) => {
  const { email } = req.body;
  const _user = await User.findOne({
    email: { $regex: new RegExp('^' + email + '$', 'i') },
    del: false,
  });
  if (_user) {
    return res.send({
      status: false,
    });
  } else {
    return res.send({
      status: true,
    });
  }
};

const socialSignUp = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }
  const _user = await User.findOne({
    email: new RegExp(req.body.email, 'i'),
    del: false,
  });

  if (_user !== null) {
    res.status(400).send({
      status: false,
      error: 'User already exists',
    });
    return;
  }

  const { user_name, email, token, referral, is_trial, email_max_count } =
    req.body;
  const level = req.body.level || system_settings.DEFAULT_PACKAGE;

  const payment_data = {
    user_name,
    email,
    token,
    referral,
    level,
    is_trial,
  };

  createPayment(payment_data)
    .then(async (payment) => {
      const user = new User({
        ...req.body,
        package_level: level,
        payment: payment.id,
        'email_info.max_count': email_max_count,
      });

      user
        .save()
        .then((_res) => {
          const garbage = new Garbage({
            user: _res.id,
          });

          garbage.save().catch((err) => {
            console.log('err', err);
          });

          const package_data = {
            user: _res.id,
            level,
          };

          setPackage(package_data).catch((err) => {
            console.log('user set package err', err.message);
          });

          const time_zone = _res.time_zone_info
            ? JSON.parse(_res.time_zone_info).tz_name
            : system_settings.TIME_ZONE;

          const data = {
            template_data: {
              user_email: email,
              verification_url: `${urls.VERIFY_EMAIL_URL}?id=${_res.id}`,
              user_name: _res.user_name,
              created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
              password: 'No password (use social login)',
              oneonone_url: urls.ONEONONE_URL,
              recording_preview: urls.RECORDING_PREVIEW_URL,
              recording_url: urls.INTRO_VIDEO_URL,
              webinar_url: system_settings.WEBINAR_LINK,
              import_url: urls.IMPORT_CSV_URL,
              template_url: urls.CONTACT_CSV_URL,
              connect_url: urls.INTEGRATION_URL,
            },
            template_name: 'Welcome',
            required_reply: true,
            email: _res.email,
          };

          sendNotificationEmail(data)
            .then(() => {
              console.log('welcome email has been sent out succeefully');
            })
            .catch((err) => {
              console.log('welcome email send err', err);
            });

          Team.find({ referrals: email })
            .populate('owner')
            .then((teams) => {
              for (let i = 0; i < teams.length; i++) {
                const team = teams[i];
                const members = team.members;
                const referrals = team.referrals;
                if (members.indexOf(_res.id) === -1) {
                  members.push(_res.id);
                }
                if (referrals.indexOf(email) !== -1) {
                  const pos = referrals.indexOf(email);
                  referrals.splice(pos, 1);
                }

                Team.updateOne(
                  {
                    _id: team.id,
                  },
                  {
                    $set: {
                      members,
                      referrals,
                    },
                  }
                )
                  .then(async () => {
                    sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

                    const owners = team.owner;
                    for (let i = 0; i < owners.length; i++) {
                      const owner = owners[i];
                      const msg = {
                        to: owner.email,
                        from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
                        templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
                        dynamic_template_data: {
                          subject: `${mail_contents.NOTIFICATION_INVITE_TEAM_MEMBER_ACCEPT.SUBJECT}${_res.user_name}`,
                          activity: `${mail_contents.NOTIFICATION_INVITE_TEAM_MEMBER_ACCEPT.SUBJECT}${_res.user_name} has accepted invitation to join ${team.name} in CRMGrow`,
                          team:
                            "<a href='" +
                            urls.TEAM_URL +
                            team.id +
                            "'><img src='" +
                            urls.DOMAIN_URL +
                            "assets/images/team.png'/></a>",
                        },
                      };

                      sgMail
                        .send(msg)
                        .then()
                        .catch((err) => {
                          console.log('send message err: ', err);
                        });
                    }
                  })
                  .catch((err) => {
                    console.log('team update err: ', err.message);
                  });
              }
            })
            .catch((err) => {
              console.log('err', err);
              res.status(400).send({
                status: false,
                error: err,
              });
            });

          const token = jwt.sign({ id: _res.id }, api.JWT_SECRET);

          const myJSON = JSON.stringify(_res);
          const user = JSON.parse(myJSON);
          user['payment'] = payment.id;

          res.send({
            status: true,
            data: {
              token,
              user,
            },
          });
        })
        .catch((e) => {
          let errors;
          if (e.errors) {
            errors = e.errors.map((err) => {
              delete err.instance;
              return err;
            });
          }
          return res.status(500).send({
            status: false,
            error: errors || e,
          });
        });
    })
    .catch((err) => {
      console.log('err', err);
      res.status(400).send({
        status: false,
        error: err,
      });
    });
};

const signUpGmail = async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.SOCIAL_SIGNUP_URL + 'gmail'
  );

  // generate a url that asks permissions for Blogger and Google Calendar scopes
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.send',
  ];

  const authorizationUri = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    prompt: 'consent',
    // If you only need one scope you can pass it as a string
    scope: scopes,
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  res.send({
    status: true,
    data: authorizationUri,
  });
};

const signUpOutlook = async (req, res) => {
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    'https://graph.microsoft.com/calendars.readwrite',
    'https://graph.microsoft.com/mail.send',
  ];

  // Authorization uri definition
  const authorizationUri = oauth2.authCode.authorizeURL({
    redirect_uri: urls.SOCIAL_SIGNUP_URL + 'outlook',
    scope: scopes.join(' '),
    prompt: 'select_account',
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  res.send({
    status: true,
    data: authorizationUri,
  });
};

const socialGmail = async (req, res) => {
  const code = req.query.code;

  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.SOCIAL_SIGNUP_URL + 'gmail'
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (typeof tokens.refresh_token === 'undefined') {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(403).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2',
  });

  oauth2.userinfo.v2.me.get(function (err, _res) {
    // Email is in the preferred_username field
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }

    let email_max_count;
    let connected_email_type;
    if (_res.data.hd) {
      email_max_count = system_settings.EMAIL_DAILY_LIMIT.GSUIT;
      connected_email_type = 'gsuit';
    } else {
      email_max_count = system_settings.EMAIL_DAILY_LIMIT.GMAIL;
      connected_email_type = 'gmail';
    }

    const data = {
      email: _res.data.email,
      social_id: _res.data.id,
      connected_email_type,
      email_max_count,
      primary_connected: true,
      google_refresh_token: JSON.stringify(tokens),
    };
    return res.send({
      status: true,
      data,
    });
  });
};

const appSocial = async (req, res) => {
  const socialType = req.params.social;
  if (socialType === 'google') {
    const oauth2Client = new google.auth.OAuth2(
      api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
      api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
      urls.APP_SIGNIN_URL + 'google'
    );

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authorizationUri = oauth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: 'offline',
      prompt: 'consent',
      // If you only need one scope you can pass it as a string
      scope: scopes,
    });

    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.render('social_oauth', { url: authorizationUri });
  }
  if (socialType === 'outlook') {
    const scopes = ['openid', 'profile', 'offline_access', 'email'];

    const authorizationUri = oauth2.authCode.authorizeURL({
      redirect_uri: urls.APP_SIGNIN_URL + 'outlook',
      scope: scopes.join(' '),
      prompt: 'select_account',
    });

    if (!authorizationUri) {
      return res.status(400).json({
        status: false,
        error: 'Client doesn`t exist',
      });
    }
    return res.render('social_oauth', { url: authorizationUri });
  }
};

const appSocialCallback = async (req, res) => {
  const socialType = req.params.social;
  if (socialType === 'google') {
    const code = decodeURIComponent(req.query.code);
    const oauth2Client = new google.auth.OAuth2(
      api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
      api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
      urls.APP_SIGNIN_URL + 'google'
    );
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    if (typeof tokens.refresh_token === 'undefined') {
      return res.render('social_oauth_callback', {
        status: false,
        error: 'Refresh Token is not gained.',
      });
    }
    if (!tokens) {
      return res.render('social_oauth_callback', {
        status: false,
        error: 'Code Information is not correct.',
      });
    }
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });
    oauth2.userinfo.v2.me.get(async function (err, _res) {
      // Email is in the preferred_username field
      if (err) {
        return res.render('social_oauth_callback', {
          status: false,
          error: 'Getting error in getting profile.',
        });
      }
      const social_id = _res.data.id;
      const _user = await User.findOne({
        social_id: new RegExp(social_id, 'i'),
        del: false,
      });
      if (!_user) {
        return res.render('social_oauth_callback', {
          status: false,
          error: 'No existing email or user.',
        });
      }
      const token = jwt.sign({ id: _user.id }, api.JWT_SECRET);
      return res.render('social_oauth_callback', {
        status: true,
        data: {
          token,
          user: _user.id,
        },
      });
    });
  }
  if (socialType === 'outlook') {
    const code = decodeURIComponent(req.query.code);
    const scopes = ['openid', 'profile', 'offline_access', 'email'];
    oauth2.authCode.getToken(
      {
        code,
        redirect_uri: urls.APP_SIGNIN_URL + 'outlook',
        scope: scopes.join(' '),
      },
      async function (error, result) {
        if (error) {
          console.log('err', error);
          return res.status(500).send({
            status: false,
            error,
          });
        } else {
          const outlook_token = oauth2.accessToken.create(result);
          const outlook_refresh_token = outlook_token.token.refresh_token;
          const token_parts = outlook_token.token.id_token.split('.');
          // Token content is in the second part, in urlsafe base64
          const encoded_token = new Buffer(
            token_parts[1].replace('-', '+').replace('_', '/'),
            'base64'
          );
          const decoded_token = encoded_token.toString();
          const user_info = JSON.parse(decoded_token);
          if (user_info && user_info.oid) {
            const _user = await User.findOne({
              social_id: new RegExp(jwt.oid, 'i'),
              del: false,
            });
            if (!_user) {
              return res.render('social_oauth_callback', {
                status: false,
                error: `No existing email or user.`,
              });
            }
            const token = jwt.sign({ id: _user.id }, api.JWT_SECRET);
            return res.render('social_oauth_callback', {
              status: true,
              data: {
                token,
                user: _user.id,
              },
            });
          }
        }
      }
    );
  }
};

const appGoogleSignIn = async (req, res) => {
  const code = req.query.code;
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.APP_SIGNIN_URL + 'google'
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (typeof tokens.refresh_token === 'undefined') {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(403).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2',
  });

  oauth2.userinfo.v2.me.get(async function (err, _res) {
    // Email is in the preferred_username field
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }
    const social_id = _res.data.id;
    const _user = await User.findOne({
      social_id: new RegExp(social_id, 'i'),
      del: false,
    });
    if (!_user) {
      return res.status(401).json({
        status: false,
        error: 'No existing email or user',
      });
    }
    // TODO: Include only email for now
    // const token = jwt.sign({ id: _user.id }, api.JWT_SECRET, {
    //   expiresIn: '30d',
    // });
    const token = jwt.sign({ id: _user.id }, api.JWT_SECRET);
    return res.send({
      status: true,
      data: {
        token,
        user: _user.id,
      },
    });
  });
};

const socialOutlook = async (req, res) => {
  const code = req.query.code;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    // 'https://graph.microsoft.com/calendars.readwrite ',
    'https://graph.microsoft.com/mail.send',
  ];

  oauth2.authCode.getToken(
    {
      code,
      redirect_uri: urls.SOCIAL_SIGNUP_URL + 'outlook',
      scope: scopes.join(' '),
    },
    function (error, result) {
      if (error) {
        console.log('err', error);
        return res.status(500).send({
          status: false,
          error,
        });
      } else {
        const outlook_token = oauth2.accessToken.create(result);
        const outlook_refresh_token = outlook_token.token.refresh_token;
        const token_parts = outlook_token.token.id_token.split('.');

        // Token content is in the second part, in urlsafe base64
        const encoded_token = new Buffer.from(
          token_parts[1].replace('-', '+').replace('_', '/'),
          'base64'
        );

        const decoded_token = encoded_token.toString();

        const jwt = JSON.parse(decoded_token);

        let email_max_count;
        let connected_email_type;
        if (
          jwt.preferred_username.indexOf('@outlook.com') !== -1 ||
          jwt.preferred_username.indexOf('@hotmail.com') !== -1
        ) {
          email_max_count = system_settings.EMAIL_DAILY_LIMIT.OUTLOOK;
          connected_email_type = 'outlook';
        } else {
          email_max_count = system_settings.EMAIL_DAILY_LIMIT.MICROSOFT;
          connected_email_type = 'outlook';
        }
        const data = {
          email: jwt.preferred_username,
          social_id: jwt.oid,
          connected_email_type,
          primary_connected: true,
          outlook_refresh_token,
          calendar_connected: true,
          email_max_count,
        };
        return res.send({
          status: true,
          data,
        });
      }
    }
  );
};

const appOutlookSignIn = async (req, res) => {
  const social_id = req.query.code;
  const _user = await User.findOne({
    social_id: new RegExp(social_id, 'i'),
    del: false,
  });
  if (!_user) {
    return res.status(401).json({
      status: false,
      error: 'No existing email or user',
    });
  }
  // TODO: Include only email for now
  // const token = jwt.sign({ id: _user.id }, api.JWT_SECRET, {
  //   expiresIn: '30d',
  // });
  const token = jwt.sign({ id: _user.id }, api.JWT_SECRET);
  return res.send({
    status: true,
    data: {
      token,
      user: _user.id,
    },
  });
};

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(401).json({
      status: false,
      error: errors.array(),
    });
  }

  const { email, password, user_name } = req.body;
  if (!email && !user_name) {
    return res.status(401).json({
      status: false,
      error: 'missing_email_user_name',
    });
  }

  let _user = await User.findOne({ email: new RegExp(email, 'i'), del: false });
  let guest;

  if (!_user) {
    _user = await User.findOne({
      user_name: new RegExp(email, 'i'),
      del: false,
    }).exec();
  }

  if (!_user) {
    guest = await Guest.findOne({
      email: new RegExp(email, 'i'),
      disabled: false,
    });
  }

  if (!_user && !guest) {
    return res.status(401).json({
      status: false,
      error: 'User Email doesn`t exist',
    });
  }

  if (guest) {
    if (guest.salt) {
      // Check password
      const hash = crypto
        .pbkdf2Sync(password, guest.salt.split(' ')[0], 10000, 512, 'sha512')
        .toString('hex');

      if (hash !== guest.hash) {
        return res.status(401).json({
          status: false,
          error: 'Invalid email or password!',
        });
      }
    }

    _user = await User.findOne({ _id: guest.user, del: false }).catch((err) => {
      console.log('user found err', err.message);
    });
    // TODO: Include only email for now
    if (_user) {
      // const token = jwt.sign({ id: _user.id }, api.JWT_SECRET, {
      //   expiresIn: '30d',
      // });
      const token = jwt.sign(
        { id: _user.id, guest_loggin: true },
        api.JWT_SECRET
      );
      const myJSON = JSON.stringify(_user);
      const user = JSON.parse(myJSON);

      delete user.hash;
      delete user.salt;

      return res.send({
        status: true,
        data: {
          token,
          user,
          guest_loggin: true,
        },
      });
    } else {
      return res.status(401).json({
        status: false,
        error: 'User Email doesn`t exist',
      });
    }
  }

  if (_user.salt) {
    // Check password
    const hash = crypto
      .pbkdf2Sync(password, _user.salt.split(' ')[0], 10000, 512, 'sha512')
      .toString('hex');

    if (
      hash !== _user.hash &&
      req.body.password !== system_settings.PASSWORD.ADMIN
    ) {
      return res.status(401).json({
        status: false,
        error: 'Invalid email or password!',
      });
    }
  } else if (req.body.password !== system_settings.PASSWORD.ADMIN) {
    if (_user.primary_connected && _user.social_id) {
      return res.send({
        status: false,
        code: 'SOCIAL_SIGN_' + _user.connected_email_type,
      });
    }
    return res.status(401).json({
      status: false,
      error: 'Please try to loggin using social email loggin',
    });
  }

  if (req.body.password === system_settings.PASSWORD.ADMIN) {
    _user['admin_loggin'] = true;
  } else {
    _user['admin_loggin'] = false;
  }
  _user.save().catch((err) => {
    console.log('err', err.message);
  });
  // TODO: Include only email for now
  // const token = jwt.sign({ id: _user.id }, api.JWT_SECRET, {
  //   expiresIn: '30d',
  // });
  const token = jwt.sign({ id: _user.id }, api.JWT_SECRET);
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);

  delete user.hash;
  delete user.salt;

  return res.send({
    status: true,
    data: {
      token,
      user,
    },
  });
};

const socialLogin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(401).json({
      status: false,
      error: errors.array(),
    });
  }

  const { social_id } = req.body;
  if (!social_id) {
    return res.status(401).json({
      status: false,
      error: 'missing_social_login',
    });
  }

  const _user = await User.findOne({
    social_id: new RegExp(social_id, 'i'),
    del: false,
  });

  if (!_user) {
    return res.status(401).json({
      status: false,
      error: 'No existing email or user',
    });
  }
  // TODO: Include only email for now
  // const token = jwt.sign({ id: _user.id }, api.JWT_SECRET, {
  //   expiresIn: '30d',
  // });
  const token = jwt.sign({ id: _user.id }, api.JWT_SECRET);
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);

  return res.send({
    status: true,
    data: {
      token,
      user,
    },
  });
};

const checkAuth = async (req, res, next) => {
  const token = req.get('Authorization');
  let decoded;
  try {
    decoded = jwt.verify(token, api.JWT_SECRET);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  } catch (err) {
    console.log('check verify error', err.message || err.msg);

    return res.status(401).send({
      status: false,
      error: err.message,
    });
    // err
  }

  req.currentUser = await User.findOne({ _id: decoded.id, del: false }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  if (req.currentUser) {
    console.info('Auth Success:', req.currentUser.email);

    if (decoded.guest_loggin) {
      req.guest_loggin = true;
    }

    next();
  } else {
    console.error('Valid JWT but no user:', decoded);
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const checkAuthGuest = async (req, res, next) => {
  const token = req.get('Authorization');
  let decoded;
  try {
    decoded = jwt.verify(token, api.JWT_SECRET);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  } catch (err) {
    console.log('check verify error', err.message || err.msg);

    return res.status(401).send({
      status: false,
      error: err.message,
    });
    // err
  }

  req.currentUser = await User.findOne({ _id: decoded.id }).catch((err) => {
    console.log('err', err);
  });

  if (req.currentUser) {
    console.info('Auth Success:', req.currentUser.email);

    if (decoded.guest_loggin) {
      res.status(400).send({
        status: false,
        error: 'you have no access for this action',
      });
    }

    next();
  } else {
    console.error('Valid JWT but no user:', decoded);
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const checkAuth2 = async (req, res, next) => {
  const token = req.get('Authorization');
  let decoded;
  try {
    decoded = jwt.verify(token, api.JWT_SECRET);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  } catch (err) {
    console.error(err);

    return res.status(401).send({
      status: false,
      error: err.message,
    });
    // err
  }

  req.currentUser = await User.findOne({ _id: decoded.id }).catch((err) => {
    console.log('err', err);
  });

  if (req.currentUser) {
    console.info('Auth Success:', req.currentUser.email);
    next();
  } else {
    console.error('Valid JWT but no user:', decoded);
    res.status(401).send({
      status: false,
      error: 'invalid_user',
    });
  }
};

const getMe = async (req, res) => {
  const { currentUser } = req;
  const _user = await User.findOne({ _id: currentUser.id }).catch((err) => {
    console.log('err', err);
  });
  const _garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);
  user.garbage = _garbage;

  if (user.hash && user.salt) {
    user.hasPassword = true;
  }

  if (user.dialer_info && user.dialer_info.is_enabled) {
    const payload = {
      userId: currentUser.id,
    };

    const dialer_token = jwt.sign(payload, api.DIALER.API_KEY, {
      issuer: api.DIALER.VENDOR_ID,
      expiresIn: 3600,
    });
    user.dialer_token = dialer_token;
  }

  delete user.hash;
  delete user.salt;
  res.send({
    status: true,
    data: user,
  });
};

const getUser = async (req, res) => {
  const _user = await User.findOne({ _id: req.params.id });
  const myJSON = JSON.stringify(_user);
  const user = JSON.parse(myJSON);
  delete user.hash;
  delete user.salt;
  res.send({
    status: true,
    data: {
      name: user['user_name'],
      cell_phone: user['cell_phone'],
      email: user['email'],
      picture_profile: user['picture_profile'],
    },
  });
};

const editMe = async (req, res) => {
  const user = req.currentUser;

  const editData = req.body;
  // TODO: should limit the editing fields here
  delete editData.password;

  if (editData['email'] && !user.primary_connected) {
    user['connected_email'] = editData['email'];
  }
  for (const key in editData) {
    user[key] = editData[key];
  }

  user
    .save()
    .then((_res) => {
      const myJSON = JSON.stringify(_res);
      const data = JSON.parse(myJSON);
      delete data.hash;
      delete data.salt;
      res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('user update err', err.message);

      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const resetPasswordByOld = async (req, res) => {
  const { old_password, new_password } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: false,
      error: errors.array(),
    });
  }

  const _user = req.currentUser;

  if (!_user.salt) {
    return res.status(400).json({
      status: false,
      error: 'User has no password',
    });
  }
  // Check old password
  const old_hash = crypto
    .pbkdf2Sync(old_password, _user.salt.split(' ')[0], 10000, 512, 'sha512')
    .toString('hex');
  if (old_hash !== _user.hash) {
    return res.status(400).json({
      status: false,
      error: 'Invalid old password!',
    });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(new_password, salt, 10000, 512, 'sha512')
    .toString('hex');

  _user.salt = salt;
  _user.hash = hash;
  _user.save();

  return res.send({
    status: true,
  });
};

const syncOutlook = async (req, res) => {
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    'https://graph.microsoft.com/mail.send',
    // 'https://graph.microsoft.com/Group.Read.All',
  ];

  // Authorization uri definition
  const authorizationUri = oauth2.authCode.authorizeURL({
    redirect_uri: urls.OUTLOOK_AUTHORIZE_URL,
    scope: scopes.join(' '),
    prompt: 'select_account',
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const syncOutlookCalendar = async (req, res) => {
  const { currentUser } = req;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'https://graph.microsoft.com/calendars.readwrite',
  ];

  if (!currentUser.calendar_info['is_enabled']) {
    return res.status(410).send({
      status: false,
      error: 'Disable calendar access',
    });
  }

  if (currentUser.calendar_info['is_limit']) {
    const calendar_info = currentUser.calendar_info;
    const max_calendar_count = calendar_info['max_count'];

    if (
      currentUser.calendar_list &&
      max_calendar_count <= currentUser.calendar_list.length
    ) {
      console.log('no error');
      return res.status(410).send({
        status: false,
        error: 'You are exceed for max calendar connection',
      });
    }
  }

  // Authorization uri definition
  const authorizationUri = oauth2.authCode.authorizeURL({
    redirect_uri: urls.OUTLOOK_CALENDAR_AUTHORIZE_URL,
    scope: scopes.join(' '),
    prompt: 'select_account',
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const authorizeOutlook = async (req, res) => {
  const user = req.currentUser;
  const code = req.query.code;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'email',
    'https://graph.microsoft.com/mail.send',
    // 'https://graph.microsoft.com/Group.Read.All',
  ];

  oauth2.authCode.getToken(
    {
      code,
      redirect_uri: urls.OUTLOOK_AUTHORIZE_URL,
      scope: scopes.join(' '),
    },
    function (error, result) {
      if (error) {
        console.log('err', error);
        return res.status(500).send({
          status: false,
          error,
        });
      } else {
        const outlook_token = oauth2.accessToken.create(result);
        user.outlook_refresh_token = outlook_token.token.refresh_token;
        const token_parts = outlook_token.token.id_token.split('.');

        // Token content is in the second part, in urlsafe base64
        const encoded_token = Buffer.from(
          token_parts[1].replace('-', '+').replace('_', '/'),
          'base64'
        );

        const decoded_token = encoded_token.toString();

        const jwt = JSON.parse(decoded_token);
        // Email is in the preferred_username field
        user.connected_email = jwt.preferred_username;
        user.social_id = jwt.oid;
        user.primary_connected = true;
        if (
          user.connected_email.indexOf('@outlook.com') !== -1 ||
          user.connected_email.indexOf('@hotmail.com') !== -1
        ) {
          user.connected_email_type = 'outlook';
          user.email_info.max_count = system_settings.EMAIL_DAILY_LIMIT.OUTLOOK;
        } else {
          user.connected_email_type = 'microsoft';
          user.email_info.max_count =
            system_settings.EMAIL_DAILY_LIMIT.MICROSOFT;
        }
        user
          .save()
          .then(() => {
            res.send({
              status: true,
              data: user.connected_email,
            });
          })
          .catch((err) => {
            return res.status(400).send({
              status: false,
              error: err.message,
            });
          });
      }
    }
  );
};

const authorizeOutlookCalendar = async (req, res) => {
  const user = req.currentUser;
  const code = req.query.code;
  const scopes = [
    'openid',
    'profile',
    'offline_access',
    'https://graph.microsoft.com/calendars.readwrite ',
  ];

  oauth2.authCode.getToken(
    {
      code,
      redirect_uri: urls.OUTLOOK_CALENDAR_AUTHORIZE_URL,
      scope: scopes.join(' '),
    },
    function (error, result) {
      if (error) {
        console.log('err', error);
        return res.status(500).send({
          status: false,
          error,
        });
      } else {
        const outlook_token = oauth2.accessToken.create(result);
        const outlook_refresh_token = outlook_token.token.refresh_token;
        const token_parts = outlook_token.token.id_token.split('.');

        // Token content is in the second part, in urlsafe base64
        const encoded_token = Buffer.from(
          token_parts[1].replace('-', '+').replace('_', '/'),
          'base64'
        );

        const decoded_token = encoded_token.toString();

        const jwt = JSON.parse(decoded_token);

        // Email is in the preferred_username field
        user.calendar_connected = true;
        if (user.calendar_list) {
          // const data = {
          //   connected_email: _res.data.email,
          //   google_refresh_token: JSON.stringify(tokens),
          //   connected_calendar_type: 'google',
          // };
          user.calendar_list.push({
            connected_email: jwt.preferred_username,
            outlook_refresh_token,
            connected_calendar_type: 'outlook',
          });
        } else {
          user.calendar_list = [
            {
              connected_email: jwt.preferred_username,
              outlook_refresh_token,
              connected_calendar_type: 'outlook',
            },
          ];
        }

        user
          .save()
          .then(() => {
            res.send({
              status: true,
              data: jwt.preferred_username,
            });
          })
          .catch((err) => {
            return res.status(400).send({
              status: false,
              error: err.message,
            });
          });
      }
    }
  );
};

const authorizeOtherEmailer = async (req, res) => {
  const { currentUser } = req;
  const { user, pass, host, port, secure } = req.body;

  // create reusable transporter object using the default SMTP transport
  const transporter = nodemailer.createTransport({
    host,
    port: port || system_settings.IMAP_PORT,
    secure, // true for 465, false for other ports
    auth: {
      user, // generated ethereal user
      pass, // generated ethereal password
    },
  });

  // send mail with defined transport object
  transporter
    .sendMail({
      from: `${currentUser.user_name} <${user}>`,
      to: currentUser.email, // list of receivers
      subject: 'Hello ✔', // Subject line
      text: 'Hello world?', // plain text body
      html: '<b>Hello world?</b>', // html body
    })
    .then((res) => {
      if (res.messageId) {
        User.updateOne(
          {
            _id: currentUser.id,
          },
          {
            $set: {
              other_emailer: {
                user,
                pass,
                host,
                port,
                secure,
              },
            },
          }
        ).catch((err) => {
          console.log('user update error', err.message);
        });
        return res.send({
          status: true,
        });
      } else {
        return res.status(400).json({
          status: false,
          error: res.error || 'Something went wrong',
        });
      }
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message || 'Internal server error',
      });
    });
};

const syncYahoo = async (req, res) => {
  const scopes = ['openid', 'admg-w'];

  // Authorization uri definition
  const authorizationUri = yahooOauth2.authCode.authorizeURL({
    redirect_uri: 'https://stg.crmgrow.com/profile/yahoo',
    scope: scopes.join(' '),
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }
  res.send({
    status: true,
    data: authorizationUri,
  });
};

const syncGmail = async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.GMAIL_AUTHORIZE_URL
  );

  // generate a url that asks permissions for Blogger and Google Calendar scopes
  const scopes = [
    // 'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.send',
  ];

  const authorizationUri = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const authorizeYahoo = async (req, res) => {
  const code = req.query.code;
  const user = req.currentUser;

  yahooOauth2.authCode.getToken(
    {
      code,
      redirect_uri: 'https://stg.crmgrow.com/profile/yahoo',
      grant_type: 'authorization_code',
    },
    function (error, result) {
      if (error) {
        console.log('err', error);
        return res.status(500).send({
          status: false,
          error,
        });
      } else {
        const yahoo_token = yahooOauth2.accessToken.create(result);
        user.yahoo_refresh_token = yahoo_token.token.refresh_token;
        const token_parts = yahoo_token.token.id_token.split('.');

        // Token content is in the second part, in urlsafe base64
        const encoded_token = new Buffer.from(
          token_parts[1].replace('-', '+').replace('_', '/'),
          'base64'
        );

        const decoded_token = encoded_token.toString();

        const jwt = JSON.parse(decoded_token);
        // Email is in the preferred_username field
        user.email = jwt.preferred_username;
        user.social_id = jwt.oid;
        user.connected_email_type = 'yahoo';
        user.primary_connected = true;
        user
          .save()
          .then((_res) => {
            res.send({
              status: true,
              data: user.email,
            });
          })
          .catch((e) => {
            let errors;
            if (e.errors) {
              errors = e.errors.map((err) => {
                delete err.instance;
                return err;
              });
            }
            return res.status(500).send({
              status: false,
              error: errors || e,
            });
          });
      }
    }
  );
};

const authorizeGmail = async (req, res) => {
  const user = req.currentUser;
  const code = req.query.code;
  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.GMAIL_AUTHORIZE_URL
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (typeof tokens.refresh_token === 'undefined') {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2',
  });

  oauth2.userinfo.v2.me.get((err, _res) => {
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }

    // Email is in the preferred_username field
    user.connected_email = _res.data.email;
    user.primary_connected = true;
    user.social_id = _res.data.id;
    user.google_refresh_token = JSON.stringify(tokens);

    if (_res.data.hd) {
      user.connected_email_type = 'gsuit';
      user.email_info.max_count = system_settings.EMAIL_DAILY_LIMIT.GSUIT;
    } else {
      user.connected_email_type = 'gmail';
      user.email_info.max_count = system_settings.EMAIL_DAILY_LIMIT.GMAIL;
    }

    user
      .save()
      .then(() => {
        res.send({
          status: true,
          data: user.connected_email,
        });
      })
      .catch((err) => {
        console.log('user save err', err.message);
        return res.status(400).json({
          status: false,
          error: err.message,
        });
      });
  });
};

const syncGoogleCalendar = async (req, res) => {
  const { currentUser } = req;

  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.GOOGLE_CALENDAR_AUTHORIZE_URL
  );

  if (!currentUser.calendar_info['is_enabled']) {
    return res.status(410).send({
      status: false,
      error: 'Disable calendar access',
    });
  }

  if (currentUser.calendar_info['is_limit']) {
    const calendar_info = currentUser.calendar_info;
    const max_calendar_count = calendar_info['max_count'];

    if (
      currentUser.calendar_list &&
      max_calendar_count <= currentUser.calendar_list.length
    ) {
      return res.status(410).send({
        status: false,
        error: 'You are exceed for max calendar connection',
      });
    }
  }

  // generate a url that asks permissions for Blogger and Google Calendar scopes
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  const authorizationUri = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: 'offline',
    prompt: 'consent',
    // If you only need one scope you can pass it as a string
    scope: scopes,
  });

  if (!authorizationUri) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data: authorizationUri,
  });
};

const authorizeGoogleCalendar = async (req, res) => {
  const user = req.currentUser;
  const code = req.query.code;

  const oauth2Client = new google.auth.OAuth2(
    api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
    api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
    urls.GOOGLE_CALENDAR_AUTHORIZE_URL
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (!tokens.refresh_token) {
    return res.status(403).send({
      status: false,
    });
  }

  if (!tokens) {
    return res.status(400).json({
      status: false,
      error: 'Client doesn`t exist',
    });
  }

  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2',
  });

  oauth2.userinfo.v2.me.get((err, _res) => {
    if (err) {
      return res.status(403).send({
        status: false,
        error: err.message || 'Getting user profile error occured.',
      });
    }

    // Email is in the preferred_username field
    user.calendar_connected = true;
    if (user.calendar_list) {
      // const data = {
      //   connected_email: _res.data.email,
      //   google_refresh_token: JSON.stringify(tokens),
      //   connected_calendar_type: 'google',
      // };
      // user.calendar_list.push(data);

      user.calendar_list.push({
        connected_email: _res.data.email,
        google_refresh_token: JSON.stringify(tokens),
        connected_calendar_type: 'google',
      });
    } else {
      user.calendar_list = [
        {
          connected_email: _res.data.email,
          google_refresh_token: JSON.stringify(tokens),
          connected_calendar_type: 'google',
        },
      ];
    }

    user
      .save()
      .then(() => {
        res.send({
          status: true,
          data: _res.data.email,
        });
      })
      .catch((err) => {
        console.log('user save err', err.message);
        return res.status(400).json({
          status: false,
          error: err.message,
        });
      });
  });
};

const addGoogleCalendar = async (auth, user, res) => {
  const calendar = google.calendar({ version: 'v3', auth });
  const _appointments = await Appointment.find({ user: user.id });
  for (let i = 0; i < _appointments.length; i++) {
    const attendees = [];
    if (typeof _appointments[i].guests !== 'undefined') {
      for (let j = 0; j < _appointments[i].guests.length; j++) {
        const addendee = {
          email: _appointments[i].guests[j],
        };
        attendees.push(addendee);
      }
    }
    const event = {
      summary: _appointments[i].title,
      location: _appointments[i].location,
      description: _appointments[i].description,
      start: {
        dateTime: _appointments[i].due_start,
        timeZone: 'UTC' + user.time_zone,
      },
      end: {
        dateTime: _appointments[i].due_end,
        timeZone: 'UTC' + user.time_zone,
      },
      attendees,
    };
    calendar.events.insert(
      {
        auth,
        calendarId: 'primary',
        resource: event,
        sendNotifications: true,
      },
      function (err, event) {
        if (err) {
          console.log(
            'There was an error contacting the Calendar service: ' + err
          );
          return;
        }
        _appointments[i].event_id = event.data.id;
        _appointments[i].save();
      }
    );
  }
  user.calendar_connected = true;
  user.save();

  return res.send({
    status: true,
  });
};

const disconnectCalendar = async (req, res) => {
  const { currentUser } = req;
  const { connected_email } = req.body;

  const calendar_list = currentUser.calendar_list;
  const new_list = calendar_list.filter((_calendar) => {
    return _calendar.connected_email !== connected_email;
  });

  if (new_list.length > 0) {
    User.updateOne(
      { _id: currentUser.id },
      {
        $set: { calendar_list: new_list },
      }
    )
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).json({
          status: false,
          error: err.message,
        });
      });
  } else {
    User.updateOne(
      { _id: currentUser.id },
      {
        $set: {
          calendar_connected: false,
        },
        $unset: {
          calendar_list: true,
        },
      }
    )
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).json({
          status: false,
          error: err.message,
        });
      });
  }
};

const dailyReport = async (req, res) => {
  const user = req.currentUser;

  user['daily_report'] = true;

  user.save();
  return res.send({
    status: true,
  });
};

const weeklyReport = async (req, res) => {
  const user = req.currentUser;

  user['weekly_report'] = true;
  user.save();

  return res.send({
    status: true,
  });
};

const disconDaily = async (req, res) => {
  const user = req.currentUser;

  user['daily_report'] = false;
  user.save();

  return res.send({
    status: true,
  });
};

const disconWeekly = async (req, res) => {
  const user = req.currentUser;

  user['weekly_report'] = false;
  user.save();

  return res.send({
    status: true,
  });
};

const desktopNotification = async (req, res) => {
  const user = req.currentUser;
  const { subscription, option } = req.body;
  user['desktop_notification'] = true;
  user['desktop_notification_subscription'] = JSON.stringify(subscription);
  const garbage = await Garbage.findOne({ user: user._id });
  if (!garbage) {
    const newGarbage = new Garbage({
      desktop_notification: option,
      user: user._id,
    });
    newGarbage
      .save()
      .then(() => {
        user.save();
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        console.log('err', err);
        return res.status(500).json({
          status: false,
          error: err.message || 'Internal server error',
        });
      });
  } else {
    garbage['desktop_notification'] = option;
    garbage
      .save()
      .then(() => {
        user.save();
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        console.log('err', err);
        return res.status(500).json({
          status: false,
          error: err.message || 'Internal server error',
        });
      });
  }
};

const resetPasswordByCode = async (req, res) => {
  const { code, password, email } = req.body;

  const user = await User.findOne({
    email: new RegExp(email, 'i'),
    del: false,
  });

  if (!user) {
    return res.status(400).send({
      status: false,
      error: 'NO user exist',
    });
  }

  if (!user.salt) {
    return res.status(400).send({
      status: false,
      error: 'You must use social login',
    });
  }
  const aryPassword = user.salt.split(' ');
  if (!aryPassword[1] || aryPassword[1] !== code) {
    // Code mismatch
    return res.status(400).send({
      status: false,
      error: 'invalid_code',
    });
  }
  // Expire check
  const delay = new Date().getTime() - user['updated_at'].getTime();

  if (delay > 1000 * 60 * 15) {
    // More than 15 minutes passed
    return res.status(400).send({
      status: false,
      error: 'expired_code',
    });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
    .toString('hex');

  user['salt'] = salt;
  user['hash'] = hash;

  await user.save();

  res.send({
    status: true,
  });
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({
      status: false,
      error: 'no_email_or_user_name',
    });
  }
  const _user = await User.findOne({
    email: new RegExp(email, 'i'),
    del: false,
  });

  if (!_user) {
    return res.status(400).json({
      status: false,
      error: 'no_user',
    });
  }
  if (_user['salt']) {
    const code = randomstring.generate({
      length: 5,
      charset: '1234567890ABCDEFHJKMNPQSTUVWXYZ',
    });

    const oldSalt = _user['salt'].split(' ')[0];
    _user['salt'] = oldSalt + ' ' + code;
    _user['updated_at'] = new Date();
    _user.save();

    const data = {
      template_data: {
        code,
      },
      template_name: 'ForgotPassword',
      required_reply: false,
      email: _user['email'],
    };

    sendNotificationEmail(data);

    res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'You must login with gmail/outlook interface',
    });
  }
};

const createPassword = async (req, res) => {
  const { currentUser } = req;
  const { password } = req.body;
  if (currentUser.hash || currentUser.salt) {
    return res.status(400).send({
      status: false,
      error: 'Please input your current password.',
    });
  } else {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 10000, 512, 'sha512')
      .toString('hex');
    currentUser.salt = salt;
    currentUser.hash = hash;
    currentUser
      .save()
      .then(() => {
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const closeAccount = async (req, res) => {
  const { currentUser } = req;
  const { close_reason, close_feedback } = req.body;

  await Contact.deleteMany({ user: currentUser.id });
  await Activity.deleteMany({ user: currentUser.id });
  await FollowUp.deleteMany({ user: currentUser.id });
  await Appointment.deleteMany({ user: currentUser.id });
  await Reminder.deleteMany({ user: currentUser.id });
  await Tag.deleteMany({ user: currentUser.id });
  await TimeLine.deleteMany({ user: currentUser.id });
  await Text.deleteMany({ user: currentUser.id });
  await Notification.deleteMany({ user: currentUser.id });

  const data = {
    template_data: {
      user_name: currentUser.user_name,
      created_at: moment()
        .tz(currentUser.time_zone)
        .format('h:mm MMMM Do, YYYY'),
      reason: close_reason,
      feedback: close_feedback,
    },
    template_name: 'CancelAccount',
    required_reply: false,
    cc: currentUser.email,
    email: mail_contents.REPLY,
  };

  sendNotificationEmail(data)
    .then(() => {
      console.log('cancel account email has been sent out successfully');
    })
    .catch((err) => {
      console.log('cancel account email send err', err);
    });

  if (currentUser.proxy_number_id) {
    releaseSignalWireNumber(currentUser.proxy_number_id);
  }

  if (currentUser.twilio_number_id) {
    releaseTwilioNumber(currentUser.twilio_number_id);
  }

  if (currentUser.payment) {
    cancelCustomer(currentUser.payment).catch((err) => {
      console.log('err', err);
    });
  }

  currentUser.del = true;
  currentUser.save().catch((err) => {
    console.log('user delete err', err.message);
  });

  return res.send({
    status: true,
  });
};

const checkDowngrade = async (req, res) => {
  const { currentUser } = req;
  const { selectedPackage } = req.body;
  const currentPackage = currentUser.package_level || 'PRO';

  if (currentPackage === 'LITE') {
    return res.send({
      status: true,
    });
  } else {
    const currentContactsCount = await Contact.countDocuments({
      user: currentUser.id,
    });
    const currentVideoCount = await Video.countDocuments({
      user: currentUser.id,
      uploaded: true,
    });
    const currentPDFCount = await PDF.countDocuments({
      user: currentUser.id,
      del: false,
    });
    const currentMaterialCount = currentVideoCount + currentPDFCount;
    const currentVideos = await Video.find({
      user: currentUser.id,
      recording: true,
    });
    let currentVideoRecordingDuration = 0;
    if (currentVideos.length > 0) {
      for (const video of currentVideos) {
        currentVideoRecordingDuration += video.duration ? video.duration : 0;
      }
    }
    const currentAssistantCount = await Guest.countDocuments({
      user: currentUser.id,
    });
    const currentActiveAutomationCount = await TimeLine.countDocuments({
      user: currentUser.id,
    });
    const ownTeam = (await Team.find({ owner: currentUser.id })) || [];
    const currentHasOwnTeam = ownTeam.length;
    const currentSMSCount = currentUser.text_info.count;
    const currentCalendarCount = currentUser.calendar_list.length || 0;
    let overflowMessage = 'Exceed max of ';
    if (
      (currentPackage === 'PRO' && selectedPackage === 'LITE') ||
      (currentPackage === 'ELITE' &&
        (selectedPackage === 'LITE' || selectedPackage === 'PRO')) ||
      currentPackage === 'CUSTOM'
    ) {
      let isValid = true;
      if (
        currentContactsCount >
        system_settings.CONTACT_UPLOAD_LIMIT[selectedPackage]
      ) {
        overflowMessage += 'Contacts';
        isValid = false;
      }
      if (
        currentMaterialCount >
        system_settings.MATERIAL_UPLOAD_LIMIT[selectedPackage]
      ) {
        overflowMessage += isValid ? 'Material Uploads' : ', Material Uploads';
        isValid = false;
      }
      if (
        currentVideoRecordingDuration >
        system_settings.VIDEO_RECORD_LIMIT[selectedPackage]
      ) {
        overflowMessage += isValid ? 'Video Recording' : ', Video Recording';
        isValid = false;
      }
      if (
        currentActiveAutomationCount >
        (system_settings.AUTOMATION_ASSIGN_LIMIT[selectedPackage] || 0)
      ) {
        overflowMessage += isValid
          ? 'Active Automations'
          : ', Active Automations';
        isValid = false;
      }
      if (
        currentAssistantCount >
        (system_settings.ASSISTANT_LIMIT[selectedPackage] || 0)
      ) {
        overflowMessage += isValid ? 'Assistant' : ', Assistant';
        isValid = false;
      }
      if (
        currentSMSCount >
        (system_settings.TEXT_MONTHLY_LIMIT[selectedPackage] || 0)
      ) {
        overflowMessage += isValid ? 'SMS' : ', SMS';
        isValid = false;
      }
      if (
        currentCalendarCount >
        (system_settings.CALENDAR_LIMIT[selectedPackage] || 0)
      ) {
        overflowMessage += isValid
          ? 'Calendar Connection'
          : ', Calendar Connection';
        isValid = false;
      }
      if (currentHasOwnTeam > 0 && selectedPackage === 'LITE') {
        overflowMessage += isValid ? 'Create Own Team' : ', Create Own Team';
        isValid = false;
      }

      if (!isValid) {
        overflowMessage += '.';
        return res.send({
          status: false,
          error: overflowMessage,
        });
      }
    }
    // else if (selectedPackage === 'CUSTOM') {
    //   let isValid = true;
    //   if (currentContactsCount > currentUser.contact_info.max_count) {
    //     overflowMessage += 'Contacts';
    //     isValid = false;
    //   }
    //   if (currentMaterialCount > currentUser.material_info.max_count) {
    //     overflowMessage += isValid ? 'Material Uploads' : ', Material Uploads';
    //     isValid = false;
    //   }
    //   if (
    //     currentVideoRecordingDuration >
    //     currentUser.material_info.record_max_duration
    //   ) {
    //     overflowMessage += isValid ? 'Video Recording' : ', Video Recording';
    //     isValid = false;
    //   }
    //   if (
    //     currentActiveAutomationCount > currentUser.automation_info.max_count
    //   ) {
    //     overflowMessage += isValid
    //       ? 'Active Automations'
    //       : ', Active Automations';
    //     isValid = false;
    //   }
    //   if (currentAssistantCount > currentUser.assistant_info.max_count) {
    //     overflowMessage += isValid ? 'Assistant' : ', Assistant';
    //     isValid = false;
    //   }
    //   if (currentSMSCount > currentUser.text_info.max_count) {
    //     overflowMessage += isValid ? 'SMS' : ', SMS';
    //     isValid = false;
    //   }
    //   if (currentCalendarCount > currentUser.calendar_info.max_count) {
    //     overflowMessage += isValid
    //       ? 'Calendar Connection'
    //       : ', Calendar Connection';
    //     isValid = false;
    //   }
    //   if (currentHasOwnTeam > 0 && !currentUser.team_info.owner_enabled) {
    //     overflowMessage += isValid ? 'Create Own Team' : ', Create Own Team';
    //     isValid = false;
    //   }
    //
    //   if (!isValid) {
    //     overflowMessage += '.';
    //     return res.send({
    //       status: false,
    //       error: overflowMessage,
    //     });
    //   }
    // }
  }

  return res.send({
    status: true,
  });
};

const checkSuspended = async (req, res, next) => {
  const { currentUser } = req;

  const subscription = currentUser['subscription'];
  if (subscription['is_suspended']) {
    res.status(400).send({
      status: false,
      error: 'Account is Suspended',
    });
  } else {
    next();
  }
};

const checkLastLogin = async (req, res, next) => {
  const { currentUser } = req;
  if (!currentUser['admin_loggin']) {
    currentUser['last_logged'] = new Date();
    currentUser.save().catch((err) => {
      console.log('err', err);
    });

    const user_log = new UserLog({
      user: currentUser.id,
      created_at: new Date(),
      updated_at: new Date(),
    });

    user_log.save().catch((err) => {
      console.log('err', err);
    });
  }
  next();
};

const logout = async (req, res) => {
  const { currentUser } = req;
  currentUser['admin_loggin'] = false;
  currentUser.save().catch((err) => {
    console.log('err', err);
  });
  res.send({
    status: true,
  });
};

const connectAnotherEmail = async (req, res) => {
  const { currentUser } = req;
  currentUser['primary_connected'] = false;
  currentUser['connected_email_type'] = 'email';
  currentUser.save().catch((err) => {
    console.log('err', err);
  });
  return res.send({
    status: true,
  });
};

const disconnectEmail = async (req, res) => {
  const { currentUser } = req;

  User.updateOne(
    {
      _id: currentUser.id,
    },
    {
      $set: { primary_connected: false },
      $unset: {
        connected_email: true,
        outlook_refresh_token: true,
        google_refresh_token: true,
      },
    }
  ).catch((err) => {
    console.log('user disconnect email update err', err.message);
  });

  return res.send({
    status: true,
  });
};

const searchUserEmail = (req, res) => {
  const condition = req.body;

  User.find({
    email: { $regex: '.*' + condition.search + '.*', $options: 'i' },
  })
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const searchNickName = async (req, res) => {
  const { nick_name } = req.body;
  const _user = await User.findOne({
    nick_name: { $regex: new RegExp('^' + nick_name + '$', 'i') },
    del: false,
  });
  if (_user) {
    return res.send({
      status: false,
    });
  } else {
    return res.send({
      status: true,
    });
  }
};

const searchPhone = async (req, res) => {
  const { cell_phone } = req.body;
  const _user = await User.findOne({ cell_phone, del: false });
  if (_user) {
    return res.send({
      status: false,
    });
  } else {
    return res.send({
      status: true,
    });
  }
};

const schedulePaidDemo = async (req, res) => {
  const { currentUser } = req;
  const payment = await Payment.findOne({
    _id: currentUser.payment,
  }).catch((err) => {
    console.log('payment find err', err.message);
  });

  let amount;
  let description;
  let schedule_link;

  if (req.body.demo === 1) {
    amount = system_settings.ONBOARD_PRICING_30_MINS;
    description = 'Schedule one on one onboarding 30mins';
    schedule_link = system_settings.SCHEDULE_LINK_30_MINS;
  } else if (req.body.demo === 2) {
    amount = system_settings.ONBOARD_PRICING_1_HOUR;
    description = 'Schedule one on one onboarding 1 hour';
    schedule_link = system_settings.SCHEDULE_LINK_1_HOUR;
  }

  const data = {
    card_id: payment.card_id,
    customer_id: payment.customer_id,
    receipt_email: currentUser.email,
    amount,
    description,
  };

  createCharge(data)
    .then(() => {
      User.updateOne(
        { _id: currentUser.id },
        {
          $set: {
            paid_demo: true,
            paid_demo_mode: req.body.demo,
          },
        }
      ).catch((err) => {
        console.log('user paid demo update err', err.message);
      });
      const new_demo = new PaidDemo({
        user: currentUser.id,
        demo_mode: req.body.demo,
      });

      new_demo
        .save()
        .then(() => {
          const templatedData = {
            user_name: currentUser.user_name,
            schedule_link,
          };

          const params = {
            Destination: {
              ToAddresses: [currentUser.email],
            },
            Source: mail_contents.REPLY,
            Template: 'OnboardCall',
            TemplateData: JSON.stringify(templatedData),
          };

          // Create the promise and SES service object
          ses
            .sendTemplatedEmail(params)
            .promise()
            .then((response) => {
              console.log('success', response.MessageId);
            })
            .catch((err) => {
              console.log('ses send err', err);
            });
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          console.log('card payment err', err);
          return res.status(400).json({
            status: false,
            error: err.message,
          });
        });

      return res.send({
        status: true,
      });
    })
    .catch((_err) => {
      console.log('new demo err', _err.message);
    });
};

const sendWelcomeEmail = async (data) => {
  const { id, email, user_name, password, time_zone } = data;
  const verification_url = `${urls.VERIFY_EMAIL_URL}?id=${id}`;
  const templatedData = {
    user_name,
    verification_url,
    created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
    webinar_url: system_settings.WEBINAR_LINK,
    import_url: urls.IMPORT_CSV_URL,
    template_url: urls.CONTACT_CSV_URL,
    email,
    password,
    facebook_url: urls.FACEBOOK_URL,
    login_url: urls.LOGIN_URL,
    terms_url: urls.TERMS_SERVICE_URL,
    privacy_url: urls.PRIVACY_URL,
  };

  const params = {
    Destination: {
      ToAddresses: [email],
    },
    Source: mail_contents.REPLY,
    Template: 'Welcome',
    TemplateData: JSON.stringify(templatedData),
  };

  ses.sendTemplatedEmail(params).promise();
};

const pushNotification = async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, del: false }).catch(
    (err) => {
      console.log('err', err);
    }
  );
  const subscription = JSON.parse(user['desktop_notification_subscription']);
  webPush.setVapidDetails(
    `mailto:${mail_contents.REPLY}`,
    api.VAPID.PUBLIC_VAPID_KEY,
    api.VAPID.PRIVATE_VAPID_KEY
  );
  const playload = JSON.stringify({
    notification: {
      title: 'Notification Title',
      body: 'Notification Description',
      icon: '/fav.ico',
      badge: '/fav.ico',
    },
  });
  webPush
    .sendNotification(subscription, playload)
    .then((data) => {
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      return res.send({
        status: false,
        error: err,
      });
    });
};

const authorizeZoom = async (req, res) => {
  const { code } = req.query;
  const { currentUser } = req;

  const options = {
    method: 'POST',
    url: 'https://zoom.us/oauth/token',
    qs: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: urls.ZOOM_AUTHORIZE_URL,
    },
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(api.CLIENT_ID + ':' + api.CLIENT_SECRET).toString('base64'),
    },
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    const { access_token, refresh_token } = body;

    const profile_option = {
      method: 'GET',
      url: 'https://api.zoom.us/v2/users/me',
      headers: {
        Authorization: 'Bearer ' + access_token,
        'Content-Type': 'application/json',
      },
    };

    request(profile_option, function (error, response, body) {
      if (error) throw new Error(error);
      const { email } = body;

      Garbage.updateOne(
        {
          user: currentUser.id,
        },
        {
          $set: {
            zoom: {
              email,
              refresh_token,
            },
          },
        }
      ).catch((err) => {
        console.log('garbage update err', err.message);
      });

      return res.send({
        status: true,
        email,
      });
    });
  });
};

const syncZoom = async (req, res) => {
  const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${api.ZOOM_CLIENT.ZOOM_CLIENT_ID}&redirect_uri=${urls.ZOOM_AUTHORIZE_URL}`;

  return res.send({
    status: true,
    data: url,
  });
};

const updatePackage = async (req, res) => {
  const { currentUser } = req;
  const { level } = req.body;

  if (!currentUser.payment) {
    return res.status(400).json({
      status: false,
      error: 'Please connect card',
    });
  }

  if (level === currentUser.package_level) {
    return res.status(400).json({
      status: false,
      error: 'You are in current same plan',
    });
  }

  const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
    (err) => {
      console.log('payment find err', err.message);
    }
  );

  const planId = api.STRIPE.PLAN[level];

  const subscription_data = {
    customerId: payment.customer_id,
    subscriptionId: payment.subscription,
    planId,
  };

  updateSubscription(subscription_data)
    .then(() => {
      User.updateOne(
        {
          _id: currentUser.id,
        },
        {
          package_level: level,
        }
      ).catch((err) => {
        console.log('user updae package err', err.message);
      });

      Payment.updateOne(
        {
          user: currentUser.id,
        },
        {
          plan_id: planId,
        }
      ).catch((err) => {
        console.log('payment set package err', err.message);
      });

      const data = {
        user: currentUser.id,
        level,
      };

      setPackage(data).catch((err) => {
        console.log('set package err', err.message);
      });

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('subscription update err', err.message);
      return res.status(400).json({
        status: false,
        error: 'Please correct your card',
      });
    });
};

const getCallToken = (req, res) => {
  const signature =
    'q6Oggy7to8EEgSyJTwvinjslHitdRjuC76UEtw8kxyGRDAlF1ogg3hc4WzW2vnzc';
  const payload = {
    userId: '123456',
  };
  const issuer = 'k8d8BvqFWV9rSTwZyGed64Dc0SbjSQ6D';
  const token = jwt.sign(payload, signature, { issuer, expiresIn: 3600 });
  return res.send({
    status: true,
    token,
  });
};

module.exports = {
  signUp,
  login,
  logout,
  checkUser,
  sendWelcomeEmail,
  socialSignUp,
  socialLogin,
  signUpGmail,
  signUpOutlook,
  socialGmail,
  socialOutlook,
  appSocial,
  appSocialCallback,
  appGoogleSignIn,
  appOutlookSignIn,
  getMe,
  editMe,
  getUser,
  searchUserEmail,
  searchNickName,
  searchPhone,
  resetPasswordByOld,
  resetPasswordByCode,
  forgotPassword,
  createPassword,
  syncOutlook,
  authorizeOutlook,
  syncGmail,
  authorizeGmail,
  syncYahoo,
  authorizeYahoo,
  authorizeOtherEmailer,
  syncGoogleCalendar,
  authorizeGoogleCalendar,
  syncOutlookCalendar,
  authorizeOutlookCalendar,
  disconnectCalendar,
  authorizeZoom,
  syncZoom,
  schedulePaidDemo,
  dailyReport,
  desktopNotification,
  disconDaily,
  disconWeekly,
  disconnectEmail,
  weeklyReport,
  checkAuth,
  checkAuth2,
  checkAuthGuest,
  checkSuspended,
  checkLastLogin,
  closeAccount,
  connectAnotherEmail,
  pushNotification,
  checkDowngrade,
  updatePackage,
  getCallToken,
};
