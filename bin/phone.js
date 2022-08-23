const mongoose = require('mongoose');
const User = require('../models/user');
const { ENV_PATH } = require('../config/path');
require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../config/database');
const { sendNewMessage } = require('node-outlook/mail-api');
const api = require('../config/api');
const TextHelper = require('../helpers/text');

const accountSid = api.TWILIO.TWILIO_SID;
const authToken = api.TWILIO.TWILIO_AUTH_TOKEN;

const twilio = require('twilio')(accountSid, authToken);
const phone = require('phone');

/**
mongoose.set('useCreateIndex', true);
mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));
 */

// Fetch or read data from
// const migrate = async() => {
//   const users = await User.find({del: true}).catch(err=>{
//     console.log('err', err)
//   })
//   for(let i=0; i<users.length; i++){
//     const user = users[i]
//     if(user.proxy_number){
//       console.log(user.proxy_number)
//     }
//   }
// }

const migrate = async () => {
  const users = await User.find({
    del: true,
    'proxy_phone.is_released': false,
  }).catch((err) => {
    console.log('err', err);
  });
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user.proxy_number) {
      const number = user.proxy_number;
      user['proxy_phone']['is_released'] = true;
      user
        .save()
        .then(() => {
          console.log(number);
        })
        .catch((err) => {
          console.err('err', err.message);
        });
    }
  }
};

const twilioNumber = async () => {
  const users = await User.find({
    del: false,
  }).catch((err) => {
    console.log('err', err);
  });

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user.proxy_number) {
      const number = user.proxy_number;
      user['twilio_number'] = number;
      user
        .save()
        .then(() => {
          console.log(number);
        })
        .catch((err) => {
          console.err('err', err.message);
        });
    }
  }
};

const sendSMS = () => {
  // const fromNumber = '+16474916957';
  const fromNumber = '+447578103293';
  const e164Phone = '+13124938446';
  twilio.messages
    .create({
      from: fromNumber,
      body: 'This is new testing for twilio',
      to: e164Phone,
    })
    .then((res) => {
      console.log('message send response', res);
    })
    .catch((err) => {
      console.log('message send err', err);
    });
};

// twilioNumber();
// sendSMS();

const validatePhone = (data) => {
  const validate = phone(data);
  console.log('validate', validate);
};

const receivedStatus = async () => {
  // const message_sid = '37153dcc-8ab2-4915-aad0-8e576d6a33d5';
  const message_sid = 'SM864bf86d09e74616a052b87a52a481c6';

  TextHelper.getStatus(message_sid, 'twilio').then((res) => {
    console.log('res', res);
  });
};

// +44 1494 506206
// +44 7911 123456
// validatePhone('7758158669');
sendSMS();
// receivedStatus();
