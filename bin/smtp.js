const access_key = 'AKIAQGFHZOADCLJVVX6F';
const secret_key = 'BCjJF7Q5sBJeFUj5heINuNlerPMgqZCSKjOteYI5A5NN';

var nodemailer = require('nodemailer');
const { ENV_PATH } = require('../config/path');
require('dotenv').config({ path: ENV_PATH });

var mailOptions = {
  from: 'support@crmgrow.com',
  to: 'super@crmgrow.com',
  text: 'This is some text',
  html: '<b>This is some HTML</b>',
};

const sesHostName = 'email-smtp.us-west-2.amazonaws.com';
const hostName = 'mx0.thehandyteam.co';
const user = 'user7zRv8Tbt4w68';
const password = 'smtp77e30c03a7b0';
const port = 465;
const ssl = 'None';

// Send e-mail using SMTP
mailOptions.subject = 'Nodemailer SMTP transporter';

const smtpConnect = () => {
  var smtpTransporter = nodemailer.createTransport({
    port,
    host: sesHostName,
    secure: true,
    auth: {
      user: access_key,
      pass: secret_key,
    },
    debug: true,
  });

  smtpTransporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log('Message sent: ' + info.response);
    }
  });
};

smtpConnect();
