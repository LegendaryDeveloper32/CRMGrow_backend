const { validationResult } = require('express-validator/check');
const PhoneLog = require('../models/phone_log');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const ActivityHelper = require('../helpers/activity');

const get = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.params;
  const data = await PhoneLog.find({ user: currentUser.id, contact });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Phone log doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  let detail_content = 'added phone log';
  if (req.guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content);
  }

  const phone_log = new PhoneLog({
    ...req.body,
    user: currentUser.id,
    updated_at: new Date(),
    created_at: new Date(),
  });

  phone_log
    .save()
    .then((_phone_log) => {
      const activity = new Activity({
        content: detail_content,
        contacts: _phone_log.contact,
        user: currentUser.id,
        type: 'phone_logs',
        phone_logs: _phone_log.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      activity.save().then((_activity) => {
        Contact.updateOne(
          { _id: _phone_log.contact },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
        const myJSON = JSON.stringify(_phone_log);
        const data = JSON.parse(myJSON);
        data.activity = _activity;
        res.send({
          status: true,
          data,
        });
      });
    })
    .catch((e) => {
      let errors;
      if (e.errors) {
        console.log('e.errors', e.errors);
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
};

module.exports = {
  get,
  create,
};
