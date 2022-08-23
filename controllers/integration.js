const User = require('../models/user');
const Garbage = require('../models/garbage');
const request = require('request-promise');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const api = require('../config/api');
const { createSubscription } = require('./payment');
const system_settings = require('../config/system_settings');
const Payment = require('../models/payment');

const checkAuthCalendly = async (req, res) => {
  const { token } = req.body;
  const { currentUser } = req;
  request({
    method: 'GET',
    uri: `https://calendly.com/api/v1/echo`,
    headers: {
      'Content-Type': 'application/json',
      'X-TOKEN': token,
    },
    json: true,
  })
    .then((response) => {
      const calendly = {
        token,
        email: response.email,
      };

      Garbage.updateOne({ user: currentUser.id }, { $set: { calendly } }).catch(
        (err) => {
          console.log('garbage update error', err.message);
        }
      );

      return res.send({
        status: true,
        data: {
          calendly,
        },
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      return res.status(400).json({
        status: false,
        error: 'UnAuthorized',
      });
    });
};

const getCalendly = async (req, res) => {
  const { currentUser } = req;
  const garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      console.log('garbage found err');
    }
  );

  const { calendly } = garbage;

  if (calendly && calendly.token) {
    request({
      method: 'GET',
      uri: `https://calendly.com/api/v1/users/me/event_types`,
      headers: {
        'Content-Type': 'application/json',
        'X-TOKEN': calendly.token,
      },
      json: true,
    })
      .then((response) => {
        return res.send({
          status: true,
          data: response.data,
        });
      })
      .catch((err) => {
        return res.status(400).json({
          status: false,
          error: 'UnAuthorized',
        });
      });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Please connect Calendly first',
    });
  }
};

const setEventCalendly = async (req, res) => {
  const { currentUser } = req;
  Garbage.updateOne(
    {
      user: currentUser.id,
    },
    {
      $set: {
        'calendly.id': req.body.id,
        'calendly.link': req.body.link + '?embed_type=Inline',
      },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('garbage update err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const connectSMTP = async (req, res) => {
  const { currentUser } = req;
  const { host, port, user, pass, secure } = req.body;

  const smtpTransporter = nodemailer.createTransport({
    port,
    host,
    secure,
    auth: {
      user,
      pass,
    },
    debug: true,
  });

  // verify connection configuration
  smtpTransporter.verify(function (error, success) {
    if (error) {
      console.log(error);
      return res.status(400).json({
        status: false,
        error,
      });
    } else {
      console.log('Server is ready to take our messages');
      Garbage.updateOne(
        {
          user: currentUser.id,
        },
        {
          $set: { smtp: { ...req.body } },
        }
      ).catch((err) => {
        console.log('garbage update err', err.message);
      });

      User.updateOne(
        { _id: currentUser.id },
        {
          $set: {
            smtp_connected: true,
          },
        }
      ).catch((err) => {
        console.log('smtp update err', err.message);
      });

      return res.send({
        status: true,
      });
    }
  });
};

const disconnectCalendly = async (req, res) => {
  const { currentUser } = req;
  Garbage.updateOne(
    {
      user: currentUser.id,
    },
    {
      $unset: { calendly: true },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('garbage update err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const addDialer = async (req, res) => {
  const { currentUser } = req;
  let amount;
  let description;
  let schedule_link;

  const payment = await Payment.findOne({
    _id: currentUser.payment,
  }).catch((err) => {
    console.log('payment find err', err.message);
  });

  if (req.body.demo === 1) {
    amount = system_settings.ONBOARD_PRICING_30_MINS;
    description = 'Schedule one on one onboarding 30mins';
    schedule_link = system_settings.SCHEDULE_LINK_30_MINS;
  } else if (req.body.demo === 2) {
    amount = system_settings.ONBOARD_PRICING_1_HOUR;
    description = 'Schedule one on one onboarding 1 hour';
    schedule_link = system_settings.SCHEDULE_LINK_1_HOUR;
  } else if (req.body.demo === 3) {
    amount = system_settings.ONBOARD_PRICING_1_HOUR;
    description = 'Schedule one on one onboarding 1 hour';
    schedule_link = system_settings.SCHEDULE_LINK_1_HOUR;
  }

  const data = {
    customer_id: payment.customer_id,
    receipt_email: currentUser.email,
    amount,
    description,
  };

  createSubscription(data).then(() => {
    const body = {
      id: currentUser.id,
      email: currentUser.email,
      firstName: currentUser.user_name.split(' ')[0],
      lastName: currentUser.user_name.split(' ')[1] || '',
      subscriptions: {
        multi: true,
        sms: true,
      },
      test: true,
    };

    const options = {
      method: 'POST',
      url: 'https://app.stormapp.com/api/customers',
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        user: api.DIALER.VENDOR_ID,
        password: api.DIALER.API_KEY,
      },
      body,
      json: true,
    };

    request(options, function (error, response, data) {
      if (error) throw new Error(error);
      const payload = {
        userId: currentUser.id,
      };

      const token = jwt.sign(payload, api.DIALER.API_KEY, {
        issuer: api.DIALER.VENDOR_ID,
        expiresIn: 3600,
      });

      return res.send({
        status: true,
        data: token,
      });
    });
  });
};

const getDialerToken = async (req, res) => {
  const { currentUser } = req;

  if (currentUser.dialer_info && currentUser.dialer_info.is_enabled) {
    const payload = {
      userId: currentUser.id,
    };

    const token = jwt.sign(payload, api.DIALER.API_KEY, {
      issuer: api.DIALER.VENDOR_ID,
      expiresIn: 3600,
    });

    return res.send({
      status: true,
      data: token,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Dialer is not enabled in your account',
    });
  }
};

module.exports = {
  checkAuthCalendly,
  setEventCalendly,
  getCalendly,
  getDialerToken,
  disconnectCalendly,
  connectSMTP,
  addDialer,
};
