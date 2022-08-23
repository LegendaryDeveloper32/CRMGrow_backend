const api = require('../config/api');
const affiliateHelper = require('../helpers/affiliate');
const request = require('request-promise');
const User = require('../models/user');

const get = async (req, res) => {
  const { currentUser } = req;
  if (currentUser.affiliate && currentUser.affiliate.id) {
    const auth = Buffer.from(api.REWARDFUL_API_KEY + ':').toString('base64');
    request({
      method: 'GET',
      uri: `https://api.getrewardful.com/v1/affiliates/${currentUser.affiliate.id}`,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      json: true,
    })
      .then((response) => {
        return res.send({
          status: true,
          data: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          error: err.details,
        });
      });
  } else {
    res.send({
      status: true,
      data: {},
    });
  }
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  if (currentUser.affiliate && currentUser.affiliate.id) {
    const auth = Buffer.from(api.REWARDFUL_API_KEY + ':').toString('base64');
    request({
      method: 'GET',
      uri: `https://api.getrewardful.com/v1/referrals?affiliate_id=${currentUser.affiliate.id}&limit=100&conversion_state[]=lead&conversion_state[]=conversion`,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      json: true,
    })
      .then((response) => {
        const visitors = response.data;
        const customers = [];
        for (let i = 0; i < visitors.length; i++) {
          const visitor = visitors[i];
          if (visitor.customer) {
            customers.push(visitor.customer);
          }
        }
        return res.send({
          status: true,
          data: response.data,
          pagination: response.pagination,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          error: err.details[0],
        });
      });
  } else {
    res.status(400).json({
      status: false,
      error: `Can't find affilate id`,
    });
  }
}

const getAllByMLM = async (req, res) => {
  const { currentUser } = req;
  if (currentUser.affiliate && currentUser.affiliate.id) {
    const affiliate_id = currentUser.affiliate.id;
    const referrals = await affiliateHelper.getReferrals(affiliate_id, 1);
    const charge = await affiliateHelper.charge(referrals);
    res.status(200).json({
      status: true,
      data: referrals,
    });
  } else {
    res.status(400).json({
      status: false,
      error: `Can't find affilate id`,
    });
  }
};

const getCharge = async (req, res) => {
  const { currentUser } = req;
  const users = await User.find({
    $and: [
      { del: false },
      { is_trial: false },
      { 'subscription.is_failed': false },
      { 'subscription.is_suspended': false },
    ],
  });
  for (let i = 0; i < users.length; i++) {
    var user = JSON.parse(JSON.stringify(users[i]));
    const referrals = await affiliateHelper.getReferrals(user.affiliate.id, 1);
    const charge = await affiliateHelper.charge(referrals);
    user.charge = charge;
  }
  res.send({
    status: true,
    data: users,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;
  const { paypal } = req.body;
  const auth = Buffer.from(api.REWARDFUL_API_KEY + ':').toString('base64');
  request({
    method: 'POST',
    uri: 'https://api.getrewardful.com/v1/affiliates',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: {
      first_name: currentUser.user_name.split(' ')[0],
      last_name:
        currentUser.user_name.split(' ')[1] ||
        currentUser.user_name.split(' ')[0],
      email: currentUser.email,
      paypal,
    },
    json: true,
  })
    .then((response) => {
      const affiliate = {
        id: response.id,
        link: response.links[0].url,
        paypal,
      };

      currentUser.affiliate = affiliate;
      currentUser.save();

      res.send({
        status: true,
        data: response,
      });
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({
        status: false,
        error: err.error.details[0],
      });
    });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const { paypal } = req.body;
  if (currentUser.affiliate && currentUser.affiliate.id) {
    const auth = Buffer.from(api.REWARDFUL_API_KEY + ':').toString('base64');
    request({
      method: 'PUT',
      uri: `https://api.getrewardful.com/v1/affiliates/${currentUser.affiliate.id}`,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: {
        first_name: currentUser.user_name.split(' ')[0],
        last_name: currentUser.user_name.split(' ')[1] || ' ',
        email: currentUser.email,
        paypal_email: paypal,
      },
      json: true,
    })
      .then((response) => {
        const affiliate = {
          id: response.id,
          link: response.links[0].url,
          paypal,
        };

        currentUser.affiliate = affiliate;
        currentUser.save();

        res.send({
          status: true,
          data: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          error: err.error.details[0],
        });
      });
  } else {
    res.status(400).json({
      status: false,
      error: `Can't find affilate id`,
    });
  }
};

module.exports = {
  get,
  getAll,
  create,
  update,
  getAllByMLM,
  getCharge,
};
