const moment = require('moment');
const Campaign = require('../models/campaign');
const CampaignJob = require('../models/campaign_job');
const MailList = require('../models/mail_list');

const system_settings = require('../config/system_settings');

const get = async (req, res) => {
  const data = await Campaign.findOne({ _id: req.params.id });
  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Campaign doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const getAll = async (req, res) => {
  const { currentUser } = req;

  const data = await Campaign.find({ user: currentUser.id }).catch((err) => {
    return res.status(500).json({
      status: false,
      error: err.message,
    });
  });
  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Campaign doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  const mail_list = await MailList.findOne({
    _id: req.body.mail_list,
  });

  const new_campaign = new Campaign({
    ...req.body,
    contacts: mail_list.contacts,
    user: currentUser.id,
  });

  new_campaign
    .save()
    .then((campaign) => {
      let daily_limit = 150;

      /**
       * Email Campaign daily limit startup count
       */

      const contacts = mail_list.contacts;

      if (currentUser.smtp_connected) {
        daily_limit = system_settings.CAMPAIGN_MAIL_START.SMTP;
      } else {
        switch (currentUser.connected_email_type) {
          case 'gmail':
            daily_limit = system_settings.CAMPAIGN_MAIL_START.GMAIl;
            break;
          case 'gsuit':
            daily_limit = system_settings.CAMPAIGN_MAIL_START.GSUIT;
            break;
          case 'outlook':
            daily_limit = system_settings.CAMPAIGN_MAIL_START.OUTLOOK;
            break;
          case 'microsoft':
            daily_limit = system_settings.CAMPAIGN_MAIL_START.MICROSOFT;
            break;
        }
      }

      daily_limit =
        contacts.length > daily_limit ? daily_limit : contacts.length;

      let day_delay = 0;
      while (contacts.length > 0) {
        let minute_delay = 0;
        const due_date = moment(req.body.due_start).add(day_delay, 'days');
        day_delay += 1;
        for (let i = 0; i < daily_limit; i += 15) {
          const due_date_time = moment(due_date).add(minute_delay, 'minutes');
          minute_delay += 1;
          const campaign_job = new CampaignJob({
            user: currentUser.id,
            contacts: contacts.slice(0, 15),
            status: 'active',
            campaign: campaign.id,
            due_date: due_date_time,
          });
          campaign_job.save().catch((err) => {
            console.log('campaign job save err', err.message);
          });
          contacts.splice(0, 15);
        }
      }

      return res.send({
        status: true,
        data: campaign,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      return res.status(400).json({
        status: false,
        error: err.message || 'Internal server error',
      });
    });
};

module.exports = {
  getAll,
  get,
  create,
};
