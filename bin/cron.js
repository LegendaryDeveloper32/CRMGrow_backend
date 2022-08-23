const mongoose = require('mongoose');
const sgMail = require('@sendgrid/mail');
const moment = require('moment-timezone');
const CronJob = require('cron').CronJob;
const fs = require('fs');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');
const phone = require('phone');
const webpush = require('web-push');
const child_process = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);
const { ENV_PATH } = require('../config/path');

require('dotenv').config({ path: ENV_PATH });

const User = require('../models/user');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const FollowUp = require('../models/follow_up');
const Reminder = require('../models/reminder');
const Appointment = require('../models/appointment');
const Video = require('../models/video');
const Note = require('../models/note');
const Notification = require('../models/notification');
const TimeLine = require('../models/time_line');
const Garbage = require('../models/garbage');
const CampaignJob = require('../models/campaign_job');
const EmailTemplate = require('../models/email_template');
const Payment = require('../models/payment');
const Text = require('../models/text');
const Task = require('../models/task');
const TimeLineCtrl = require('../controllers/time_line');

const api = require('../config/api');
const system_settings = require('../config/system_settings');
const urls = require('../constants/urls');
const notifications = require('../constants/notification');
const mail_contents = require('../constants/mail_contents');
const { VIDEO_PATH, TEMP_PATH } = require('../config/path');
const { sendNotificationEmail } = require('../helpers/email');
const { RestClient } = require('@signalwire/node');

const client = new RestClient(api.SIGNALWIRE.PROJECT_ID, api.SIGNALWIRE.TOKEN, {
  signalwireSpaceUrl: api.SIGNALWIRE.WORKSPACE_DOMAIN,
});

const EmailHelper = require('../helpers/email');
const TextHelper = require('../helpers/text');
const FileHelper = require('../helpers/file');
const ActivityHelper = require('../helpers/activity');

const { DB_PORT } = require('../config/database');

mongoose.set('useCreateIndex', true);
mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const s3 = new AWS.S3({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_S3_REGION,
});

const ses = new AWS.SES({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const daily_report = new CronJob(
  '0 21 * * 1-6',
  async () => {
    await User.find({ daily_report: true })
      .then(async (users) => {
        sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(20, 59, 59, 999);
        for (let i = 0; i < users.length; i++) {
          const currentUser = users[i];
          const activity = await Activity.find({
            user: currentUser.id,
            created_at: { $gte: start, $lt: end },
          }).catch((err) => {
            console.log('err: ', err);
          });

          const now = moment();
          const today = now.format('MMMM, dddd Do YYYY');

          const contacts = [];
          for (let j = 0; j < activity.length; j++) {
            const contact = await Contact.findOne({
              _id: activity[j].contacts,
            }).catch((err) => {
              console.log('err: ', err);
            });
            if (typeof contact.cell_phone === 'undefined')
              contact.cell_phone = '';
            const content =
              " <tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              activity[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.CONTACT_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/contact.png'/></a></td></tr>";
            contacts.push(content);
          }

          const _follow_up = await FollowUp.find({
            user: currentUser.id,
            status: 0,
            due_date: { $lt: end },
          }).catch((err) => {
            console.log('err: ', err);
          });
          const overdue = [];

          for (let j = 0; j < _follow_up.length; j++) {
            const contact = await Contact.findOne({
              _id: _follow_up[j].contact,
            }).catch((err) => {
              console.log('err: ', err);
            });
            if (typeof contact.cell_phone === 'undefined')
              contact.cell_phone = '';
            const _overdue =
              "<tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              _follow_up[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.FOLLOWUP_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/followup.png'/></a></td></tr>";
            overdue.push(_overdue);
          }

          if (contacts.length > 0 || overdue.length > 0) {
            const msg = {
              to: currentUser.email,
              from: mail_contents.DAILY_REPORT.MAIL,
              subject: mail_contents.DAILY_REPORT.SUBJECT,
              templateId: api.SENDGRID.SENDGRID_DAILY_REPORT_TEMPLATE,
              dynamic_template_data: {
                contacts,
                overdue,
                day: today,
              },
            };
            sgMail
              .send(msg)
              .then((res) => {
                console.log('mailres.errorcode', res[0].statusCode);
                if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                  console.log('Successful send to ' + msg.to);
                } else {
                  console.log('email sending err', msg.to + res[0].statusCode);
                }
              })
              .catch((err) => {
                console.log('err: ', err);
              });
          }
        }
      })
      .catch((err) => {
        console.log('err', err);
      });
  },
  function () {
    console.log('Daily Report Job finished.');
  },
  false,
  'US/Central'
);

const weekly_report = new CronJob({
  // Run at 21:00 Central time, only on friday
  cronTime: '00 21 * * Sun',
  onTick: async () => {
    sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
    await User.find({ weekly_report: true, del: false })
      .then(async (users) => {
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(today.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(20, 59, 59, 999);
        for (let i = 0; i < users.length; i++) {
          const currentUser = users[i];
          const activity = await Activity.find({
            user: currentUser.id,
            created_at: { $gte: monday, $lt: end },
          })
            .sort({ _id: -1 })
            .limit(15)
            .catch((err) => {
              console.log('err: ', err);
            });
          const now = moment();
          const today = now.format('MMMM, dddd Do YYYY');

          const contacts = [];
          for (let j = 0; j < activity.length; j++) {
            const contact = await Contact.findOne({
              _id: activity[j].contacts,
            }).catch((err) => {
              console.log('err: ', err);
            });
            if (typeof contact.cell_phone === 'undefined')
              contact.cell_phone = '';
            const content =
              "<tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              activity[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.CONTACT_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/contact.png'/></a></td></tr>";
            contacts.push(content);
          }

          const _follow_up = await FollowUp.find({
            user: currentUser.id,
            status: 0,
            due_date: { $lt: end },
          }).catch((err) => {
            console.log('err: ', err);
          });
          const overdue = [];

          for (let j = 0; j < _follow_up.length; j++) {
            const contact = await Contact.findOne({
              _id: _follow_up[j].contact,
            }).catch((err) => {
              console.log('err: ', err);
            });
            if (typeof contact.cell_phone === 'undefined')
              contact.cell_phone = '';
            const _overdue =
              "<tr><td><h3 style='display: inline'>" +
              contact.first_name +
              contact.last_name +
              "</h3><p style='margin: 0px'>" +
              contact.email +
              ' ' +
              contact.cell_phone +
              '</p>' +
              "<p style='margin: 0px'>" +
              _follow_up[j].content +
              '</p></td>' +
              "<td><a href='" +
              urls.FOLLOWUP_PAGE_URL +
              contact.id +
              "' style='text-decoration: none'><img src='" +
              urls.DOMAIN_URL +
              "assets/images/contact.png'/></a></td></tr>";
            overdue.push(_overdue);
          }

          if (contacts.length > 0 || overdue.length > 0) {
            const msg = {
              to: currentUser.email,
              from: mail_contents.DAILY_REPORT.MAIL,
              subject: mail_contents.DAILY_REPORT.SUBJECT,
              templateId: api.SENDGRID.SENDGRID_DAILY_REPORT_TEMPLATE,
              dynamic_template_data: {
                contacts,
                overdue,
                day: today,
              },
            };
            sgMail
              .send(msg)
              .then((res) => {
                console.log('mailres.errorcode', res[0].statusCode);
                if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                  console.log('Successful send to ' + msg.to);
                } else {
                  console.log(res[0].statusCode);
                }
              })
              .catch((err) => {
                console.log('err: ', err);
              });
          }
        }
      })
      .catch((err) => {
        console.log('err', err);
      });
  },
  start: false,
  timeZone: 'US/Central',
});

const reminder_job = new CronJob(
  '*/10 * * * 0-6',
  async () => {
    const due_date = new Date();
    due_date.setSeconds(0);
    due_date.setMilliseconds(0);

    const reminder_array = await FollowUp.find({
      remind_at: { $lte: due_date },
      status: 0,
    }).catch((err) => {
      console.log('followup find err', err.message);
    });

    for (let i = 0; i < reminder_array.length; i++) {
      const follow_up = reminder_array[i];
      const user = await User.findOne({
        _id: follow_up.user,
        del: false,
      }).catch((err) => {
        console.log('err: ', err);
      });

      if (!user) {
        continue;
      }

      const contact = await Contact.findOne({
        _id: follow_up.contact,
      }).catch((err) => {
        console.log('err: ', err.message);
      });

      if (!contact) {
        continue;
      }

      const garbage = await Garbage.findOne({ user: user.id }).catch((err) => {
        console.log('err: ', err.message);
      });

      const email_notification = garbage['email_notification'];

      const time_zone = user.time_zone_info
        ? JSON.parse(user.time_zone_info).tz_name
        : system_settings.TIME_ZONE;

      const due_date = moment(follow_up.due_date)
        .tz(time_zone)
        .format('h:mm a');

      if (email_notification['follow_up']) {
        const type = follow_up.type || 'task';

        const data = {
          template_data: {
            user_name: user.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            contact_url: urls.CONTACT_PAGE_URL + contact.id,
            contact_name: `${contact.first_name} ${contact.last_name}`,
            follow_up_type: type,
            follow_up_description: follow_up.content,
            follow_up_type_url: urls.FOLLOWUP_TYPE_URL[type],
            due_start: due_date,
          },
          template_name: 'TaskReminder',
          required_reply: false,
          email: user.email,
        };

        console.log('data*****', data);
        sendNotificationEmail(data);
      }

      const text_notification = garbage['text_notification'];
      if (text_notification['follow_up']) {
        const e164Phone = phone(user.cell_phone)[0];
        const fromNumber = api.SIGNALWIRE.DEFAULT_NUMBER;

        console.info(`Send SMS: ${fromNumber} -> ${user.cell_phone} :`);
        if (!e164Phone) {
          const error = {
            error: 'Invalid Phone Number',
          };
          throw error; // Invalid phone number
        }

        const title =
          `Follow up task due today at ${due_date} with contact name:` +
          '\n' +
          '\n' +
          contact.first_name +
          contact.last_name +
          '\n' +
          contact.email +
          '\n' +
          contact.cell_phone +
          '\n' +
          '\n';
        const body = follow_up.content + '\n';
        const contact_link = urls.CONTACT_PAGE_URL + contact.id;

        client.messages
          .create({
            from: fromNumber,
            to: e164Phone,
            body:
              title +
              body +
              '\n' +
              contact_link +
              '\n\n' +
              TextHelper.generateUnsubscribeLink(),
            // body: title + body,
          })
          .then(() => {
            console.log(`Reminder at: ${due_date}`);
          })
          .catch((err) => console.error('send sms err: ', err));
      }
      const desktop_notification = garbage['desktop_notification'];
      if (desktop_notification['follow_up']) {
        webpush.setVapidDetails(
          'mailto:support@crmgrow.com',
          api.VAPID.PUBLIC_VAPID_KEY,
          api.VAPID.PRIVATE_VAPID_KEY
        );

        const subscription = JSON.parse(user.desktop_notification_subscription);
        const title = `CRMGrow follow up reminder`;
        const body =
          `Follow up task due today at ${due_date} with contact name:` +
          '\n' +
          contact.first_name +
          contact.last_name +
          '\n' +
          contact.email +
          '\n' +
          contact.cell_phone +
          '\n' +
          follow_up.content;
        const playload = JSON.stringify({
          notification: {
            title,
            body,
            icon: '/fav.ico',
            badge: '/fav.ico',
          },
        });
        webpush
          .sendNotification(subscription, playload)
          .catch((err) => console.error(err));
      }

      FollowUp.updateOne(
        {
          _id: follow_up.id,
        },
        {
          status: 2,
        }
      ).catch((err) => {
        console.log('follow up update err', err.message);
      });

      /** 
      if (follow_up.set_recurrence) {
        switch (follow_up.recurrence_mode) {
          case 'DAILY': {
            const today = moment(follow_up.due_date);
            const tomorrow = today.add(1, 'days');

            FollowUp.updateOne(
              {
                _id: follow_up.id,
              },
              {
                due_date: tomorrow,
              }
            ).catch((err) => {
              console.log('follow up err', err.message);
            });

            // const new_reminder = new Reminder({
            //   contact: contact.id,
            //   due_date: tomorrow,
            //   type: 'follow_up',
            //   user: follow_up.user,
            //   follow_up: follow_up.id,
            // });

            // new_reminder.save().catch((err) => {
            //   console.log('reminder save err', err.message);
            // });
            break;
          }
          case 'WEEKLY': {
            const today = moment(follow_up.due_date);
            const week = today.add(7, 'days');
            FollowUp.updateOne(
              {
                _id: follow_up.id,
              },
              {
                due_date: week,
              }
            ).catch((err) => {
              console.log('follow up err', err.message);
            });

            const new_reminder = new Reminder({
              contact: contact.id,
              due_date: week,
              type: 'follow_up',
              user: follow_up.user,
              follow_up: follow_up.id,
            });

            new_reminder.save().catch((err) => {
              console.log('reminder save err', err.message);
            });
            break;
          }
          case 'MONTHLY': {
            const today = moment(follow_up.due_date);
            const month = today.add(1, 'months');
            FollowUp.updateOne(
              {
                _id: follow_up.id,
              },
              {
                due_date: month,
              }
            ).catch((err) => {
              console.log('follow up err', err.message);
            });

            const new_reminder = new Reminder({
              contact: contact.id,
              due_date: month,
              type: 'follow_up',
              user: follow_up.user,
              follow_up: follow_up.id,
            });

            new_reminder.save().catch((err) => {
              console.log('reminder save err', err.message);
            });
            break;
          }
        }
      }
      */
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const signup_job = new CronJob(
  '0,30 * * * 0-6',
  async () => {
    sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

    const subscribers = await User.find({
      welcome_email: false,
      del: false,
    }).catch((err) => {
      console.log('err', err);
    });

    if (subscribers) {
      for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];
        const created_at = new Date(subscriber['created_at']).getTime();
        const now = new Date().getTime();
        const offset = now - created_at;
        if (offset >= 30 * 60 * 1000 && offset < 60 * 60 * 1000) {
          // const msg = {
          //   to: subscriber.email,
          //   from: mail_contents.WELCOME_SIGNUP.MAIL,
          //   templateId: api.SENDGRID.SENDGRID_SIGNUP_FLOW_REACH,
          //   dynamic_template_data: {
          //     first_name: subscriber.user_name,
          //   },
          // };
          // sgMail
          //   .send(msg)
          //   .then((res) => {
          //     console.log('mailres.errorcode', res[0].statusCode);
          //     if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
          //       console.log('Successful send to ' + msg.to);
          //     } else {
          //       console.log('email sending err', msg.to + res[0].statusCode);
          //     }
          //   })
          //   .catch((err) => {
          //     console.log('err', err);
          //   });

          const templatedData = {
            user_name: subscriber.user_name,
            created_at: moment().format('h:mm MMMM Do, YYYY'),
            webinar_link: system_settings.WEBINAR_LINK,
          };

          const params = {
            Destination: {
              ToAddresses: [subscriber.email],
            },
            Source: mail_contents.REPLY,
            Template: 'WebinarInvitation',
            TemplateData: JSON.stringify(templatedData),
          };

          // Create the promise and SES service object

          ses.sendTemplatedEmail(params).promise();

          const notification = new Notification({
            user: subscribers[i].id,
            criteria: 'webniar',
            content: notifications.webinar.content,
            description: notifications.webinar.description,
          });
          notification.save().catch((err) => {
            console.log('notification save err', err.message);
          });
        }
        if (offset >= 24 * 60 * 60 * 1000 && offset < 24.5 * 60 * 60 * 1000) {
          const msg = {
            to: subscriber.email,
            from: mail_contents.WELCOME_SIGNUP.MAIL,
            templateId: api.SENDGRID.SENDGRID_SIGNUP_FLOW_THIRD,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              video_link: `<a href="${urls.INTRO_VIDEO_URL}">Click this link - Download Video</a>`,
              recruiting_material: `<a href="${urls.MATERIAL_VIEW_PAGE}">Material Page</a>`,
            },
          };
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
        }
        if (offset >= 48 * 60 * 60 * 1000 && offset < 48.5 * 60 * 60 * 1000) {
          const msg = {
            to: subscriber.email,
            from: mail_contents.WELCOME_SIGNUP.MAIL,
            templateId: api.SENDGRID.SENDGRID_SIGNUP_FLOW_FORTH,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              login_link: `<a href="${urls.LOGIN_URL}">Click here to login into your account</a>`,
            },
          };
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
                subscriber['welcome_email'] = true;
                subscriber.save().catch((err) => {
                  console.log('err', err);
                });
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
        }
      }
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const payment_check = new CronJob(
  '0 21 */3 * *',
  async () => {
    const subscribers = await User.find({
      'subscription.is_failed': true,
      del: false,
    }).catch((err) => {
      console.log('err', err.messsage);
    });

    if (subscribers && subscribers.length > 0) {
      for (let i = 0; i < subscribers.length; i++) {
        const user = subscribers[i];

        const time_zone = user.time_zone_info
          ? JSON.parse(user.time_zone_info).tz_name
          : system_settings.TIME_ZONE;

        const payment = await Payment.findOne({ _id: user.payment }).catch(
          (err) => {
            console.log('payment find err', err.message);
          }
        );

        const data = {
          template_data: {
            user_name: user.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            amount: payment.bill_amount || 29,
            last_4_cc: payment.last4 || 'Unknown',
          },
          template_name: 'PaymentFailed',
          required_reply: true,
          email: user.email,
        };

        sendNotificationEmail(data);
      }
    }
  },
  function () {
    console.log('Payment Check Job finished.');
  },
  false,
  'US/Central'
);

const logger_check = new CronJob(
  '0 21 */3 * *',
  async () => {
    const logger_notification = await Notification.findOne({
      type: 'urgent',
      criteria: 'long_out',
    }).catch((err) => {
      console.log('err', err);
    });
    if (logger_notification) {
      let startdate = moment();
      startdate = startdate.subtract(30, 'days');
      const users = await User.find({
        last_logged: { $lt: startdate },
        del: false,
      }).catch((err) => {
        console.log('err', err);
      });
      if (users) {
        for (let i = 0; i < users.length; i++) {
          const subscriber = users[i];

          const msg = {
            to: users.email,
            from: mail_contents.SUPPORT_CRMGROW.MAIL,
            templateId: api.SENDGRID.SENDGRID_SYSTEM_NOTIFICATION,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              content: logger_notification['content'],
            },
          };
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
        }
      }
    }
  },
  function () {
    console.log('Logger check Job finished.');
  },
  false,
  'US/Central'
);

const notification_check = new CronJob(
  '0 21 * * *',
  async () => {
    sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

    const notifications = await Notification.find({
      type: 'static',
      sent: false,
    }).catch((err) => {
      console.log('err', err);
    });
    if (notifications) {
      const subscribers = await User.find({ del: false }).catch((err) => {
        console.log('err', err);
      });
      for (let i = 0; i < notifications.length; i++) {
        const notification = notification[i];

        for (let j = 0; j < subscribers.length; j++) {
          const subscriber = subscribers[j];
          const msg = {
            to: subscriber.email,
            from: mail_contents.SUPPORT_CRMGROW.MAIL,
            templateId: api.SENDGRID.SENDGRID_SYSTEM_NOTIFICATION,
            dynamic_template_data: {
              first_name: subscriber.user_name,
              content: notification.content,
            },
          };
          sgMail
            .send(msg)
            .then((res) => {
              console.log('mailres.errorcode', res[0].statusCode);
              if (res[0].statusCode >= 200 && res[0].statusCode < 400) {
                console.log('Successful send to ' + msg.to);
                notification['sent'] = true;
              } else {
                console.log('email sending err', msg.to + res[0].statusCode);
              }
            })
            .catch((err) => {
              console.log('err', err);
            });
        }
      }
    }

    let startdate = moment();
    startdate = startdate.subtract(7, 'days');
    const old_notifications = await Notification.find({
      type: 'static',
      created_at: { $lte: startdate },
    }).catch((err) => {
      console.log('err', err);
    });
    for (let i = 0; i < old_notifications.length; i++) {
      const old_notification = old_notifications[i];
      old_notification['del'] = true;
      old_notification.save().catch((err) => {
        console.log('err', err);
      });
    }
  },
  function () {
    console.log('Notification Check Job finished.');
  },
  false,
  'US/Central'
);

const convert_video_job = new CronJob(
  '0 1 * * *',
  async () => {
    const record_videos = await Video.find({
      recording: true,
      converted: 'none',
      del: false,
    }).catch((err) => {
      console.log('record videos convert err', err.message);
    });
    for (let i = 0; i < record_videos.length; i++) {
      const video = record_videos[i];
      const file_path = video.path;
      if (file_path) {
        if (fs.existsSync(file_path)) {
          const new_file = uuidv1() + '.mov';
          const new_path = TEMP_PATH + new_file;
          const args = [
            '-i',
            file_path,
            '-max_muxing_queue_size',
            '1024',
            '-vf',
            'pad=ceil(iw/2)*2:ceil(ih/2)*2',
            new_path,
          ];
          const ffmpegConvert = await child_process.spawn(ffmpegPath, args);
          ffmpegConvert.on('close', function () {
            console.log('converted end', file_path);
            const new_url = urls.VIDEO_URL + new_file;
            video['url'] = new_url;
            video['recording'] = false;
            video['path'] = new_path;
            video['converted'] = 'completed';
            video
              .save()
              .then(() => {
                fs.unlinkSync(file_path);
              })
              .catch((err) => {
                console.log('err', err.message);
              });
          });
        }
      }
    }

    const uploaded_videos = await Video.find({
      recording: false,
      converted: 'none',
      del: false,
      type: { $nin: ['youtube', 'vimeo'] },
    }).catch((err) => {
      console.log('uploaded videos convert err', err.message);
    });
    for (let i = 0; i < uploaded_videos.length; i++) {
      const video = uploaded_videos[i];
      const file_path = video.path;
      if (file_path) {
        if (fs.existsSync(file_path)) {
          const new_file = uuidv1() + '.mp4';
          const new_path = TEMP_PATH + new_file;
          const args = [
            '-i',
            file_path,
            '-c:v',
            'libx264',
            '-b:v',
            '1.5M',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            new_path,
          ];

          const ffmpegConvert = await child_process.spawn(ffmpegPath, args);
          ffmpegConvert.on('close', function () {
            console.log('converted end', file_path);
            if (fs.existsSync(new_path)) {
              const new_url = urls.VIDEO_URL + new_file;
              video['url'] = new_url;
              video['converted'] = 'completed';
              video['path'] = new_path;
              video
                .save()
                .then(() => {
                  fs.unlinkSync(file_path);
                })
                .catch((err) => {
                  console.log('err', err.message);
                });
            }
          });
        }
      }
    }
  },
  function () {
    console.log('Video Convert Job Finished.');
  },
  false,
  'US/Central'
);

const upload_video_job = new CronJob(
  '0 4 * * *',
  async () => {
    const videos = await Video.find({
      uploaded: false,
      del: false,
      type: { $nin: ['youtube', 'vimeo'] },
    }).catch((err) => {
      console.log('err', err.message);
    });

    if (videos) {
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const file_path = video.path;
        const old_path = video.old_path;
        if (file_path) {
          const file_name = video.path.slice(37);

          if (fs.existsSync(file_path)) {
            try {
              fs.readFile(file_path, (err, data) => {
                if (err) {
                  FileHelper.readFile(file_path)
                    .then(function (data1) {
                      console.log('File read was successful by stream', data1);
                      const today = new Date();
                      const year = today.getYear();
                      const month = today.getMonth();
                      const params = {
                        Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
                        Key: 'video' + year + '/' + month + '/' + file_name,
                        Body: data1,
                        ACL: 'public-read',
                      };
                      s3.upload(params, async (s3Err, upload) => {
                        if (s3Err) throw s3Err;
                        console.log(
                          `File uploaded successfully at ${upload.Location}`
                        );
                        video['url'] = upload.Location;
                        video['uploaded'] = true;
                        video
                          .save()
                          .then(() => {
                            fs.unlinkSync(file_path);
                          })
                          .catch((err) => {
                            console.log('err', err);
                          });
                      });
                    })
                    .catch(function (err) {
                      console.log('File read by stream error', err);
                    });
                } else {
                  console.log('File read was successful', data);
                  const today = new Date();
                  const year = today.getYear();
                  const month = today.getMonth();
                  const params = {
                    Bucket: api.AWS.AWS_S3_BUCKET_NAME, // pass your bucket name
                    Key: 'video' + year + '/' + month + '/' + file_name,
                    Body: data,
                    ACL: 'public-read',
                  };
                  s3.upload(params, async (s3Err, upload) => {
                    if (s3Err) throw s3Err;
                    console.log(
                      `File uploaded successfully at ${upload.Location}`
                    );
                    video['url'] = upload.Location;
                    video['uploaded'] = true;
                    video
                      .save()
                      .then(() => {
                        fs.unlinkSync(file_path);
                      })
                      .catch((err) => {
                        console.log('err', err.message);
                      });
                  });
                }
              });
            } catch (err) {
              console.log('err', err.message);
              // read file
            }
          }
          if (old_path && fs.existsSync(old_path)) {
            fs.unlinkSync(old_path);
          }
        }
      }
    }
  },
  function () {
    console.log('Convert Job finished.');
  },
  false,
  'US/Central'
);

const timesheet_check = new CronJob(
  '* * * * *',
  async () => {
    const due_date = new Date();
    // due_date.setSeconds(0)
    // due_date.setMilliseconds(000)
    const timelines = await TimeLine.find({
      status: 'active',
      due_date: { $lte: due_date },
    });

    if (timelines) {
      for (let i = 0; i < timelines.length; i++) {
        const timeline = timelines[i];
        const action = timeline['action'];
        let data;
        if (!action) {
          continue;
        }
        switch (action.type) {
          case 'follow_up': {
            let follow_due_date;
            if (action.due_date) {
              follow_due_date = action.due_date;
            } else {
              const now = moment();
              // let tens = parseInt(now.minutes() / 10)
              // now.set({ minute: tens*10, second: 0, millisecond: 0 })
              now.set({ second: 0, millisecond: 0 });
              follow_due_date = now.add(action.due_duration, 'hours');
              follow_due_date.set({ second: 0, millisecond: 0 });
            }
            const garbage = await Garbage.findOne({
              user: timeline.user,
            }).catch((err) => {
              console.log('err', err);
            });
            let reminder_before = 30;
            if (garbage) {
              reminder_before = garbage.reminder_before;
            }
            const startdate = moment(follow_due_date);
            const remind_at = startdate.subtract(reminder_before, 'mins');

            const followUp = new FollowUp({
              content: action.content,
              contact: timeline.contact,
              user: timeline.user,
              type: timeline.task_type,
              due_date: follow_due_date,
              remind_at,
            });

            followUp
              .save()
              .then(async (_followup) => {
                let detail_content = 'added task';
                detail_content = ActivityHelper.automationLog(detail_content);
                const activity = new Activity({
                  content: detail_content,
                  contacts: _followup.contact,
                  user: timeline.user,
                  type: 'follow_ups',
                  follow_ups: _followup.id,
                  created_at: new Date(),
                  updated_at: new Date(),
                });

                activity
                  .save()
                  .then((_activity) => {
                    timeline['status'] = 'completed';
                    timeline['updated_at'] = new Date();
                    timeline.save().catch((err) => {
                      console.log('err', err);
                    });
                    Contact.updateOne(
                      { _id: _followup.contact },
                      { $set: { last_activity: _activity.id } }
                    ).catch((err) => {
                      console.log('contact update err', err.message);
                    });
                  })
                  .catch((err) => {
                    console.log('follow error', err.message);
                  });

                TimeLine.updateMany(
                  {
                    contact: timeline.contact,
                    'action.ref_id': timeline.ref,
                  },
                  {
                    $set: { 'action.follow_up': _followup.id },
                  }
                )
                  .then(() => {
                    console.log('follow up updated');
                  })
                  .catch((err) => {
                    console.log('follow error', err.message);
                  });
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err.message);
                });
                console.log('follow error', err.message);
              });
            break;
          }
          case 'note': {
            const note = new Note({
              content: action.content,
              contact: timeline.contact,
              user: timeline.user,
              updated_at: new Date(),
              created_at: new Date(),
            });

            note
              .save()
              .then((_note) => {
                let detail_content = 'added note';
                detail_content = ActivityHelper.automationLog(detail_content);

                const activity = new Activity({
                  content: detail_content,
                  contacts: _note.contact,
                  user: timeline.user,
                  type: 'notes',
                  notes: _note.id,
                });

                activity.save().then((_activity) => {
                  Contact.updateOne(
                    { _id: _note.contact },
                    {
                      $set: { last_activity: _activity.id },
                    }
                  ).catch((err) => {
                    console.log('err', err);
                  });
                  timeline['status'] = 'completed';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                });
              })
              .catch((err) => {
                console.log('err', err);
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          }
          case 'email':
            data = {
              user: timeline.user,
              subject: action.subject,
              content: action.content,
              contacts: [timeline.contact],
            };
            EmailHelper.sendEmail(data)
              .then((res) => {
                if (res[0] && res[0].status === true) {
                  timeline['status'] = 'completed';
                  timeline['error_message'] = res[0].error;
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                  const activity_data = {
                    activity: res[0].activity,
                    contact: timeline.contact,
                    parent_ref: timeline.ref,
                  };
                  TimeLineCtrl.setEmailTrackTimeline(activity_data);
                } else {
                  timeline['status'] = 'error';
                  timeline['error_message'] = res[0].error;
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                }
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          case 'send_text_video':
            data = {
              user: timeline.user,
              video_ids: [action.video],
              content: action.content,
              contacts: [timeline.contact],
            };
            TextHelper.sendText(data)
              .then((res) => {
                if (res[0] && res[0].status === true) {
                  timeline['status'] = 'completed';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                } else {
                  timeline['status'] = 'error';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                }
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          case 'send_email_video':
            data = {
              user: timeline.user,
              content: action.content,
              subject: action.subject,
              video_ids: [action.video],
              contacts: [timeline.contact],
            };
            EmailHelper.sendEmail(data)
              .then((res) => {
                if (res[0] && res[0].status === true) {
                  timeline['status'] = 'completed';
                  timeline['updated_at'] = new Date();
                  timeline['error_message'] = res[0].error;
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                } else {
                  timeline['status'] = 'error';
                  timeline['updated_at'] = new Date();
                  timeline['error_message'] = res[0].error;
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                }
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          case 'send_text_pdf':
            data = {
              user: timeline.user,
              content: action.content,
              pdf_ids: [action.pdf],
              contacts: [timeline.contact],
            };
            TextHelper.sendText(data)
              .then((res) => {
                if (res[0] && res[0].status === true) {
                  timeline['status'] = 'completed';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                } else {
                  timeline['status'] = 'error';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                }
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          case 'send_email_pdf':
            data = {
              user: timeline.user,
              content: action.content,
              subject: action.subject,
              pdf_ids: [action.pdf],
              contacts: [timeline.contact],
            };
            EmailHelper.sendEmail(data)
              .then((res) => {
                if (res[0] && res[0].status === true) {
                  timeline['status'] = 'completed';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                } else {
                  timeline['status'] = 'error';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                }
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          case 'send_text_image':
            data = {
              user: timeline.user,
              content: action.content,
              image_ids: [action.image],
              contacts: [timeline.contact],
            };
            TextHelper.sendText(data)
              .then((res) => {
                if (res[0] && res[0].status === true) {
                  timeline['status'] = 'completed';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                } else {
                  timeline['status'] = 'error';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                }
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          case 'send_email_image':
            data = {
              user: timeline.user,
              content: action.content,
              image_ids: [action.image],
              subject: action.subject,
              contacts: [timeline.contact],
            };
            EmailHelper.sendText(data)
              .then((res) => {
                if (res[0] && res[0].status === true) {
                  timeline['status'] = 'completed';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                } else {
                  timeline['status'] = 'error';
                  timeline['updated_at'] = new Date();
                  timeline.save().catch((err) => {
                    console.log('err', err);
                  });
                }
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          case 'update_contact': {
            switch (action.command) {
              case 'update_label':
                Contact.updateOne(
                  {
                    _id: timeline.contact,
                  },
                  {
                    $set: { label: mongoose.Types.ObjectId(action.content) },
                  }
                ).catch((err) => {
                  console.log('err', err.message);
                });
                break;
              case 'push_tag': {
                const tags = action.content.map((tag) => tag.value);
                Contact.updateOne(
                  {
                    _id: timeline.contact,
                  },
                  {
                    $push: { tags: { $each: tags } },
                  }
                ).catch((err) => {
                  console.log('err', err.message);
                });
                break;
              }
              case 'pull_tag': {
                const tags = action.content.map((tag) => tag.value);
                Contact.updateOne(
                  {
                    _id: timeline.contact,
                  },
                  {
                    $pull: { tags: { $in: tags } },
                  }
                ).catch((err) => {
                  console.log('err', err.message);
                });
                break;
              }
            }
            timeline['status'] = 'completed';
            timeline['updated_at'] = new Date();
            timeline.save().catch((err) => {
              console.log('time line err', err.message);
            });
            break;
          }
          case 'update_follow_up': {
            switch (action.command) {
              case 'update_follow_up': {
                let follow_due_date;
                let content;
                let update_data;
                if (action.due_date) {
                  follow_due_date = action.due_date;
                }
                if (action.due_duration) {
                  const now = moment();
                  now.set({ second: 0, millisecond: 0 });
                  follow_due_date = now.add(action.due_duration, 'hours');
                  follow_due_date.set({ second: 0, millisecond: 0 });
                }
                if (follow_due_date) {
                  update_data = {
                    follow_due_date,
                  };
                }
                if (action.content) {
                  content = action.content;
                  update_data = { ...update_data, content };
                }

                if (follow_due_date) {
                  const garbage = await Garbage.findOne({
                    user: timeline.user,
                  }).catch((err) => {
                    console.log('err', err.message);
                  });
                  let reminder_before = 30;
                  if (garbage) {
                    reminder_before = garbage.reminder_before;
                  }
                  const startdate = moment(follow_due_date);
                  const remind_at = startdate.subtract(reminder_before, 'mins');

                  update_data = {
                    ...update_data,
                    remind_at,
                    status: 0,
                  };
                }

                FollowUp.updateOne(
                  {
                    _id: action.follow_up,
                  },
                  update_data
                )
                  .then(() => {
                    let detail_content = 'updated task';
                    detail_content =
                      ActivityHelper.automationLog(detail_content);
                    const activity = new Activity({
                      content: detail_content,
                      contacts: timeline.contact,
                      user: timeline.user,
                      type: 'follow_ups',
                      follow_ups: action.follow_up,
                    });

                    activity
                      .save()
                      .then((_activity) => {
                        Contact.updateOne(
                          { _id: timeline.contact },
                          { $set: { last_activity: _activity.id } }
                        ).catch((err) => {
                          console.log('contact update err', err.message);
                        });
                      })
                      .catch((err) => {
                        console.log('follow error', err.message);
                      });
                  })
                  .catch((err) => {
                    console.log('update task cron err', err.message);
                  });
                break;
              }
              case 'complete_follow_up': {
                FollowUp.updateOne(
                  {
                    _id: action.follow_up,
                  },
                  {
                    status: 1,
                  }
                )
                  .then(() => {
                    let detail_content = 'completed task';
                    detail_content =
                      ActivityHelper.automationLog(detail_content);
                    const activity = new Activity({
                      content: detail_content,
                      contacts: timeline.contact,
                      user: timeline.user,
                      type: 'follow_ups',
                      follow_ups: action.follow_up,
                    });

                    activity
                      .save()
                      .then((_activity) => {
                        Contact.updateOne(
                          { _id: timeline.contact },
                          { $set: { last_activity: _activity.id } }
                        ).catch((err) => {
                          console.log('contact update err', err.message);
                        });
                      })
                      .catch((err) => {
                        console.log('follow error', err.message);
                      });
                  })
                  .catch((err) => {
                    console.log('update task cron err', err.message);
                  });
                break;
              }
            }
            timeline['status'] = 'completed';
            timeline['updated_at'] = new Date();
            timeline.save().catch((err) => {
              console.log('time line err', err.message);
            });
            break;
          }
        }

        if (timeline.ref) {
          const next_data = {
            contact: timeline.contact,
            ref: timeline.ref,
          };
          TimeLineCtrl.activeNext(next_data);
        } else if (timeline.status === 'completed') {
          TimeLine.deleteOne({
            _id: timeline.id,
          }).catch((err) => {
            console.log('timeline remove err', err.message);
          });
        }
        if (timeline.condition && timeline.condition.answer === false) {
          const pair_timeline = await TimeLine.findOne({
            parent_ref: timeline.parent_ref,
            contact: timeline.contact,
            'condition.answer': true,
          });
          if (pair_timeline) {
            TimeLineCtrl.disableNext(pair_timeline.id);
          }
        }
      }
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const task_check = new CronJob(
  '* * * * *',
  async () => {
    const due_date = new Date();
    const tasks = await Task.find({
      status: 'active',
      due_date: { $lte: due_date },
    });

    if (tasks) {
      for (let i = 0; i < tasks.length; i++) {
        const timeline = tasks[i];
        const action = timeline['action'];
        let data;
        if (!action) {
          continue;
        }
        switch (timeline.type) {
          case 'send_email': {
            data = {
              ...action,
              user: timeline.user,
              contacts: timeline.contacts,
            };

            EmailHelper.sendEmail(data)
              .then(async (res) => {
                // Getting task exec status
                const errors = [];
                const succeedContactIds = [];
                res.forEach((_res) => {
                  if (!_res.status) {
                    errors.push({
                      contact: _res.contact,
                      error: _res.error,
                    });
                  } else {
                    succeedContactIds.push(_res.contact._id);
                  }
                });
                // Update tasks
                EmailHelper.updateUserCount(
                  timeline.user,
                  res.length - errors.length
                ).catch((err) => {
                  console.log('Update user email count failed.', err);
                });
                // Checking the same process tasks, if same doesn't exist, remove all tasks
                const anotherProcessTasks = await Task.find({
                  process: timeline.process,
                  status: 'active',
                  _id: { $nin: [timeline._id] },
                });
                if (anotherProcessTasks && anotherProcessTasks.length) {
                  timeline['status'] = 'completed';
                  if (timeline.exec_result && timeline.exec_result.failed) {
                    timeline.exec_result.failed = [
                      ...timeline.exec_result.failed,
                      ...errors,
                    ];
                  } else if (timeline.exec_result) {
                    timeline.exec_result.failed = errors;
                  } else {
                    timeline.exec_result = {
                      failed: errors,
                    };
                  }
                  if (timeline.exec_result && timeline.exec_result.succeed) {
                    timeline.exec_result.succeed = [
                      ...timeline.exec_result.succeed,
                      ...succeedContactIds,
                    ];
                  } else if (timeline.exec_result) {
                    timeline.exec_result.succeed = succeedContactIds;
                  } else {
                    timeline.exec_result = {
                      succeed: succeedContactIds,
                    };
                  }
                  timeline.save();
                  // notification update or create
                  if (errors.length) {
                    const newNotification = new Notification({
                      user: timeline.user,
                      criteria: 'bulk_email',
                      status: 'pending',
                      process: timeline.process,
                      deliver_status: {
                        contacts: action.contacts,
                        failed: errors,
                        succeed: succeedContactIds,
                      },
                      detail: action,
                    });
                    newNotification.save();
                  }
                } else {
                  Task.find({
                    process: timeline.process,
                  })
                    .then((_tasks) => {
                      let contacts = [];
                      let failed = errors;
                      let succeed = succeedContactIds;
                      _tasks.forEach((_task) => {
                        contacts = [...contacts, ..._task.contacts];
                        if (
                          timeline.exec_result &&
                          timeline.exec_result.failed &&
                          timeline.exec_result.failed.length
                        ) {
                          failed = [...failed, ...timeline.exec_result.failed];
                        }
                        if (
                          timeline.exec_result &&
                          timeline.exec_result.succeed &&
                          timeline.exec_result.succeed.length
                        ) {
                          succeed = [
                            ...succeed,
                            ...timeline.exec_result.succeed,
                          ];
                        }
                      });
                      // Remove all same tasks
                      Task.deleteMany({ process: timeline.process }).catch(
                        (err) => {
                          console.log('Delete tasks error: ', err);
                        }
                      );
                      Notification.deleteMany({ process: timeline.process })
                        .then(() => {
                          const newNotification = new Notification({
                            user: timeline.user,
                            criteria: 'bulk_email',
                            status: 'completed',
                            process: timeline.process,
                            deliver_status: {
                              contacts,
                              failed,
                              succeed,
                            },
                            detail: action,
                          });
                          newNotification.save().catch((err) => {
                            console.log(
                              'completed notification saving failed',
                              err
                            );
                          });
                        })
                        .catch((err) => {
                          console.log('Delete tasks error: ', err);
                        });
                    })
                    .catch((err) => {
                      console.log('completed tasks process failed', err);
                    });
                }
              })
              .catch((err) => {
                console.log('resolve error', err);
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err);
                });
              });
            break;
          }
          case 'bulk_sms': {
            const { message_sid, service, activities, activity, text, tasks } =
              timeline.action;
            TextHelper.getStatus(message_sid, service)
              .then(async (res) => {
                if (res.status === 'delivered') {
                  TextHelper.handleDeliveredText(
                    timeline.contact,
                    activities,
                    activity,
                    text
                  );

                  timeline.status = 'delivered';
                  await timeline.save().catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                } else if (res.status === 'sent') {
                  const beginning_time = moment(timeline.due_date).add(
                    3,
                    'minutes'
                  );
                  const now = moment();
                  if (beginning_time.isBefore(now)) {
                    TextHelper.handleFailedText(
                      activities,
                      activity,
                      text,
                      3,
                      tasks || []
                    );

                    const notification = new Notification({
                      user: timeline.user,
                      contact: timeline.contact,
                      message_sid,
                      activities,
                      criteria: 'bulk_sms',
                      status: 'sent',
                      description:
                        res.errorMessage ||
                        'Could`t get delivery result from carrier',
                      content: 'Failed texting material',
                    });

                    notification.save().catch((err) => {
                      console.log('notification save err', err.message);
                    });

                    timeline.status = 'sent';
                    timeline.exec_result = {
                      description:
                        res.errorMessage ||
                        'Could`t get delivery result from carrier',
                      content: 'Failed texting material',
                      status: 'sent',
                    };
                    await timeline.save().catch((err) => {
                      console.log('timeline remove err', err.message);
                    });
                  }
                } else if (
                  res.status === 'undelivered' ||
                  res.status === 'failed'
                ) {
                  TextHelper.handleFailedText(
                    activities,
                    activity,
                    text,
                    4,
                    tasks || []
                  );

                  const notification = new Notification({
                    user: timeline.user,
                    contact: timeline.contact,
                    message_sid,
                    activities,
                    criteria: 'bulk_sms',
                    status: 'sent',
                    description: res.errorMessage,
                    content: 'Failed texting material',
                  });

                  notification.save().catch((err) => {
                    console.log('notification save err', err.message);
                  });

                  timeline.status = 'failed';
                  timeline.exec_result = {
                    description:
                      res.errorMessage ||
                      'Could`t get delivery result from carrier',
                    content: 'Failed texting material',
                    status: 'failed',
                  };
                  await timeline.save().catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                }

                Task.find({
                  process: timeline.process,
                  status: 'active',
                })
                  .then((_tasks) => {
                    if (!_tasks.length) {
                      Task.find({
                        process: timeline.process,
                      })
                        .then((_allTasks) => {
                          const succeed = [];
                          const failed = [];
                          _allTasks.forEach((e) => {
                            if (e.status === 'delivered') {
                              succeed.push(e.contacts[0]);
                            }
                            if (e.status === 'failed' || e.status === 'sent') {
                              failed.push({
                                contact: e.contacts[0],
                                exec_result: e.exec_result,
                              });
                            }
                          });
                          Notification.deleteMany({
                            process: timeline.process,
                          })
                            .then(() => {
                              const notification = new Notification({
                                user: timeline.user,
                                process: timeline.process,
                                criteria: 'bulk_sms',
                                status: 'completed',
                                deliver_status: {
                                  succeed,
                                  failed,
                                },
                              });
                              notification.save().catch((err) => {
                                console.log(
                                  'Bulk texting complete notification creating is failed',
                                  err
                                );
                              });
                            })
                            .catch((err) => {
                              console.log(
                                'remove the previous notification remove',
                                err
                              );
                            });
                          Task.deleteMany({
                            process: timeline.process,
                          }).catch((err) => {
                            console.log(
                              'Bulk texting tasks removing is failed',
                              err
                            );
                          });
                        })
                        .catch((err) => {
                          console.log('Same tasks are completed', err);
                        });
                    }
                  })
                  .catch((err) => {
                    console.log('Same process are failed.', err);
                  });
              })
              .catch((err) => {
                console.log('Getting SMS Status is failed', err);
              });
            break;
          }
          case 'auto_follow_up1':
          case 'auto_follow_up2': {
            let follow_due_date;
            if (action.due_date) {
              follow_due_date = action.due_date;
            } else {
              const now = moment();
              now.set({ second: 0, millisecond: 0 });
              follow_due_date = now.add(action.due_duration, 'hours');
              follow_due_date.set({ second: 0, millisecond: 0 });
            }

            const garbage = await Garbage.findOne({
              user: timeline.user,
            }).catch((err) => {
              console.log('err', err);
            });
            let reminder_before = 30;
            if (garbage) {
              reminder_before = garbage.reminder_before;
            }
            const startdate = moment(follow_due_date);
            const remind_at = startdate.subtract(reminder_before, 'mins');

            const followUp = new FollowUp({
              content: action.content,
              contact: timeline.contact,
              user: timeline.user,
              type: action.task_type,
              due_date: follow_due_date,
              remind_at,
            });

            followUp
              .save()
              .then(async (_followup) => {
                let detail_content = 'added task';
                detail_content = ActivityHelper.automationLog(detail_content);
                const activity = new Activity({
                  content: detail_content,
                  contacts: _followup.contact,
                  user: timeline.user,
                  type: 'follow_ups',
                  follow_ups: _followup.id,
                });

                activity
                  .save()
                  .then((_activity) => {
                    timeline['status'] = 'completed';
                    timeline['updated_at'] = new Date();
                    timeline.save().catch((err) => {
                      console.log('err', err);
                    });
                    Contact.updateOne(
                      { _id: _followup.contact },
                      { $set: { last_activity: _activity.id } }
                    ).catch((err) => {
                      console.log('contact update err', err.message);
                    });
                  })
                  .catch((err) => {
                    console.log('follow error', err.message);
                  });

                TimeLine.updateMany(
                  {
                    contact: timeline.contact,
                    'action.ref_id': timeline.ref,
                  },
                  {
                    $set: { 'action.follow_up': _followup.id },
                  }
                )
                  .then(() => {
                    console.log('follow up updated');
                  })
                  .catch((err) => {
                    console.log('follow error', err.message);
                  });
              })
              .catch((err) => {
                timeline['status'] = 'error';
                timeline['updated_at'] = new Date();
                timeline.save().catch((err) => {
                  console.log('err', err.message);
                });
                console.log('follow error', err.message);
              });
            break;
          }
          case 'resend_email_video1':
            data = {
              user: timeline.user,
              content: action.content,
              subject: action.subject,
              activity: action.activity,
              video: action.video,
              contact: timeline.contacts[0],
            };

            console.log('data', data);

            EmailHelper.resendVideo(data)
              .then((res) => {
                if (res.status) {
                  console.log('Resend Video is successed.');
                  Task.deleteOne({
                    _id: timeline.id,
                  }).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                } else {
                  console.log('Resend video is failed', res);
                  Task.updateOne(
                    {
                      _id: timeline.id,
                    },
                    {
                      $set: {
                        exec_result: res,
                        status: 'failed',
                      },
                    }
                  ).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                }
              })
              .catch((err) => {
                console.log('email resend video err', err.message);
              });
            break;
          case 'resend_text_video1':
            data = {
              user: timeline.user,
              content: action.content,
              activity: action.activity,
              video: action.video,
              contact: timeline.contacts[0],
            };
            TextHelper.resendVideo(data)
              .then((res) => {
                console.log(res);
                if (res.status) {
                  console.log('resend text video(watch case) is successed');
                  Task.deleteOne({
                    _id: timeline.id,
                  }).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                  TextHelper.updateUserTextCount(timeline.user, 1).catch(
                    (err) => {
                      console.log('update user text info is failed.', err);
                    }
                  );
                } else {
                  console.log('resend text video(unwatched case) is failed');
                  Task.updateOne(
                    {
                      _id: timeline.id,
                    },
                    {
                      $set: {
                        exec_result: res,
                        status: 'failed',
                      },
                    }
                  ).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                }
              })
              .catch((err) => {
                console.log('text resend video err', err.message);
              });
            break;
          case 'resend_email_video2':
            data = {
              user: timeline.user,
              content: action.content,
              subject: action.subject,
              activity: action.activity,
              video: action.video,
              contact: timeline.contacts[0],
            };

            EmailHelper.resendVideo(data)
              .then((res) => {
                if (res.status) {
                  console.log('resend video(unwatched case) is successed');
                  Task.deleteOne({
                    _id: timeline.id,
                  }).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                } else {
                  console.log('resend video(unwatched case) is failed');
                  Task.updateOne(
                    {
                      _id: timeline.id,
                    },
                    {
                      $set: {
                        exec_result: res,
                        status: 'failed',
                      },
                    }
                  ).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                }
              })
              .catch((err) => {
                console.log('email resend video err', err.message);
              });
            break;
          case 'resend_text_video2':
            data = {
              user: timeline.user,
              content: action.content,
              activity: action.activity,
              video: action.video,
              contact: timeline.contacts[0],
            };
            TextHelper.resendVideo(data)
              .then((res) => {
                if (res.status) {
                  console.log('resend text video(unwatched case) is successed');
                  Task.deleteOne({
                    _id: timeline.id,
                  }).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                  TextHelper.updateUserTextCount(timeline.user, 1).catch(
                    (err) => {
                      console.log('update user text info is failed.', err);
                    }
                  );
                } else {
                  console.log('resend text video(unwatched case) is failed');
                  Task.updateOne(
                    {
                      _id: timeline.id,
                    },
                    {
                      $set: {
                        exec_result: res,
                        status: 'failed',
                      },
                    }
                  ).catch((err) => {
                    console.log('timeline remove err', err.message);
                  });
                }
              })
              .catch((err) => {
                console.log('text resend video err', err.message);
              });
            break;
        }
      }
    }
  },
  function () {
    console.log('Task check Job finished.');
  },
  false,
  'US/Central'
);

const reset_daily_limit = new CronJob(
  '0 3 * * *',
  async () => {
    const users = await User.find({ del: false }).catch((err) => {
      console.log('users found err', err.message);
    });

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      user['email_info']['count'] = 0;
      user.save().catch((err) => {
        console.log('users save err', err.message);
      });
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const reset_monthly_limit = new CronJob(
  '0 3 1 * *',
  async () => {
    User.updateMany(
      { del: false },
      {
        $set: {
          'text_info.count': 0,
        },
      }
    ).catch((err) => {
      console.log('users found err', err.message);
    });
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

const campaign_job = new CronJob(
  '0 * * * *',
  async () => {
    const due_date = new Date();
    const campaign_jobs = await CampaignJob.find({
      status: 'active',
      due_date: { $lte: due_date },
    }).populate({
      path: 'campaign',
      select: {
        email_template: 1,
        video: 1,
        pdf: 1,
        image: 1,
      },
    });

    if (campaign_jobs && campaign_jobs.length > 0) {
      for (let i = 0; i < campaign_jobs.length; i++) {
        const campaign_job = campaign_jobs[i];
        const campaign = campaign_job.email_template;
        const email_template = await EmailTemplate.findOne({
          _id: campaign.email_template,
        });

        const { user, contacts } = campaign_job;
        const data = {
          user,
          content: email_template.content,
          subject: email_template.subject,
          contacts,
          video_ids: campaign.videos,
          pdf_ids: campaign.pdfs,
          image_ids: campaign.images,
        };

        EmailHelper.sendEmail(data)
          .then((res) => {})
          .catch((err) => {
            console.log('err', err.message);
          });
      }
    }
  },
  function () {
    console.log('Reminder Job finished.');
  },
  false,
  'US/Central'
);

// signup_job.start();
reminder_job.start();
// weekly_report.start();
// upload_video_job.start();
// convert_video_job.start();
payment_check.start();
// campaign_job.start();
// logger_check.start()
// notification_check.start();
task_check.start();
timesheet_check.start();
reset_daily_limit.start();
reset_monthly_limit.start();
