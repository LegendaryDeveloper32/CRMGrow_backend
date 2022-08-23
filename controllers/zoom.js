const request = require('request-promise');
const { ZOOM: MESSAGE } = require('../constants/message');
const { createMeeting, refreshToken } = require('../helpers/zoom');
const User = require('../models/user');
const Garbage = require('../models/garbage');
const { requestBase64 } = require('base64-img');

const create = async (req, res) => {
  const { currentUser } = req;
  if (!currentUser.zoom) {
    return res.status(400).json({
      status: false,
      error: MESSAGE['NO_ACCOUNT'],
    });
  }

  const { old_refresh_token } = currentUser.zoom;

  const auth_client = await refreshToken(old_refresh_token).catch((err) => {
    console.log('zoom refresh token err', err.message);
  });

  const { refresh_token, access_token } = auth_client;

  if (!access_token) {
    return res.staus(410).json({
      status: false,
      error: MESSAGE['TOKEN_EXPIRED'],
    });
  }

  Garbage.updateOne(
    {
      user: currentUser.id,
    },
    {
      $set: {
        'zoom.refresh_token': refresh_token,
      },
    }
  ).catch((err) => {
    console.log('garbage zoom update err', err.message);
  });

  const options = {
    method: 'POST',
    url: 'https://api.zoom.us/v2/users/me/meetings',
    headers: {
      /** The credential below is a sample base64 encoded credential. Replace it with "Authorization: 'Basic ' + Buffer.from(your_app_client_id + ':' + your_app_client_secret).toString('base64')"
       * */
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
    // body: {
    //   topic: 'This is new test',
    //   start_time: new Date(),
    //   type: 2,
    //   agenda: 'This is a meeting with a Super',
    //   duration: 30,
    // },
    body: req.body,
    json: true,
  };

  request(options)
    .then((response) => {
      console.log('response', response);

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('zoom meeting create err', err.message);
    });
};

const update = async (req, res) => {
  const { currentUser } = req;
  if (!currentUser.zoom) {
    return res.status(400).json({
      status: false,
      error: MESSAGE['NO_ACCOUNT'],
    });
  }

  const { old_refresh_token } = currentUser.zoom;

  const auth_client = await refreshToken(old_refresh_token).catch((err) => {
    console.log('zoom refresh token err', err);
  });

  const { refresh_token, access_token } = auth_client;

  if (!access_token) {
    return res.staus(410).json({
      status: false,
      error: MESSAGE['TOKEN_EXPIRED'],
    });
  }

  Garbage.updateOne(
    {
      user: currentUser.id,
    },
    {
      $set: {
        'zoom.refresh_token': refresh_token,
      },
    }
  ).catch((err) => {
    console.log('garbage zoom update err', err.message);
  });

  const options = {
    method: 'PUT',
    url: 'https://api.zoom.us/v2/users/me/meetings',
    headers: {
      /** The credential below is a sample base64 encoded credential. Replace it with "Authorization: 'Basic ' + Buffer.from(your_app_client_id + ':' + your_app_client_secret).toString('base64')"
       * */
      Authorization: 'Bearer ' + access_token,
      'Content-Type': 'application/json',
    },
    body: req.body,
    json: true,
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    console.log(body);
  });
};

module.exports = {
  create,
  update,
};
