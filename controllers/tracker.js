const sgMail = require('@sendgrid/mail');
const webpush = require('web-push');
const phone = require('phone');
const moment = require('moment-timezone');
const User = require('../models/user');
const Contact = require('../models/contact');
const PDFTracker = require('../models/pdf_tracker');
const PDF = require('../models/pdf');
const VideoTracker = require('../models/video_tracker');
const Video = require('../models/video');
const Image = require('../models/image');
const ImageTracker = require('../models/image_tracker');
const Activity = require('../models/activity');
const TimeLine = require('../models/time_line');
const Garbage = require('../models/garbage');
const FollowUp = require('../models/follow_up');
const Reminder = require('../models/reminder');
const EmailTemplate = require('../models/email_template');
const Task = require('../models/task');
const ActivityHelper = require('../helpers/activity');
const TimeLineCtrl = require('./time_line');
const urls = require('../constants/urls');
const mail_contents = require('../constants/mail_contents');
const system_settings = require('../config/system_settings');
const api = require('../config/api');

const accountSid = api.TWILIO.TWILIO_SID;
const authToken = api.TWILIO.TWILIO_AUTH_TOKEN;
const twilio = require('twilio')(accountSid, authToken);
const { RestClient } = require('@signalwire/node');
const { generateUnsubscribeLink } = require('../helpers/text');
const { sendNotificationEmail } = require('../helpers/email');
const Notification = require('../models/notification');

const client = new RestClient(api.SIGNALWIRE.PROJECT_ID, api.SIGNALWIRE.TOKEN, {
  signalwireSpaceUrl: api.SIGNALWIRE.WORKSPACE_DOMAIN,
});

const createPDF = async (data) => {
  const pdf_tracker = new PDFTracker({
    ...data,
    updated_at: new Date(),
    created_at: new Date(),
  });
  const pdf = await pdf_tracker.save();
  return pdf;
};

const disconnectPDF = async (pdf_tracker_id) => {
  const query = await PDFTracker.findOne({ _id: pdf_tracker_id });
  const currentUser = await User.findOne({ _id: query['user'] });
  const contact = await Contact.findOne({ _id: query['contact'] });
  const pdf = await PDF.findOne({ _id: query['pdf'] });
  const garbage = await Garbage.findOne({ user: query['user'] });
  const time_zone = currentUser.time_zone_info
    ? JSON.parse(currentUser.time_zone_info).tz_name
    : system_settings.TIME_ZONE;

  const d = query['duration'] / 1000;
  var h = Math.floor(d / 3600);
  var m = Math.floor((d % 3600) / 60);
  var s = Math.floor((d % 3600) % 60);

  if (h < 10) {
    h = '0' + h;
  }
  if (m < 10) {
    m = '0' + m;
  }
  if (s < 10) {
    s = '0' + s;
  }
  const timeWatched = h + ':' + m + ':' + s;

  const desktop_notification = garbage['desktop_notification'];
  // send desktop notification
  if (desktop_notification['material'] === true) {
    webpush.setVapidDetails(
      'mailto:support@crmgrow.com',
      api.VAPID.PUBLIC_VAPID_KEY,
      api.VAPID.PRIVATE_VAPID_KEY
    );

    const subscription = JSON.parse(
      currentUser.desktop_notification_subscription
    );
    const title =
      contact.first_name +
      ' ' +
      contact.last_name +
      ' - ' +
      contact.email +
      ' reviewed pdf -' +
      pdf.title;
    const created_at =
      moment(query['created_at']).tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment(query['created_at']).tz(time_zone).format('h:mm a');

    const body = 'Watched ' + timeWatched + ' on ' + created_at;
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

  const text_notification = garbage['text_notification'];

  // send text notification
  if (text_notification['material'] === true) {
    const e164Phone = phone(currentUser.cell_phone)[0];

    if (!e164Phone) {
      const error = {
        error: 'Invalid Phone Number',
      };

      throw error; // Invalid phone number
    } else {
      // let fromNumber = currentUser['proxy_number'];
      // if (!fromNumber) {
      //   fromNumber = api.SIGNALWIRE.DEFAULT_NUMBER;
      // }
      const fromNumber = api.SIGNALWIRE.SYSTEM_NUMBER;
      const title =
        contact.first_name +
        ' ' +
        contact.last_name +
        '\n' +
        contact.email +
        '\n' +
        contact.cell_phone +
        '\n' +
        '\n' +
        ' Reviewed pdf: ' +
        pdf.title +
        '\n';
      const created_at =
        moment(query['created_at']).tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment(query['created_at']).tz(time_zone).format('h:mm a');
      const body = 'Watched ' + timeWatched + ' on ' + created_at + '\n ';
      const contact_link = urls.CONTACT_PAGE_URL + contact.id;

      client.messages
        .create({
          from: fromNumber,
          to: e164Phone,
          body:
            title +
            '\n' +
            body +
            '\n' +
            contact_link +
            '\n\n' +
            generateUnsubscribeLink(),
          // body: title + '\n' + body,
        })
        .catch((err) => console.error(err));
    }
  }

  const email_notification = garbage['email_notification'];

  if (email_notification['material']) {
    sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

    const created_at = moment(query['created_at'])
      .tz(time_zone)
      .format('h:mm:ss a');
    const msg = {
      to: currentUser.email,
      from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
      templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
      dynamic_template_data: {
        subject: `${mail_contents.NOTIFICATION_REVIEWED_PDF.SUBJECT}- ${contact.first_name} ${contact.last_name} - ${created_at}`,
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone_number: `<a href="tel:${contact.cell_phone}">${contact.cell_phone}</a>`,
        email: `<a href="mailto:${contact.email}">${contact.email}</a>`,
        activity:
          contact.first_name + ' reviewed pdf - <b>' + pdf.title + '</b>',
        duration: 'Viewed <b>' + timeWatched + ' </b>at ' + created_at,
        detailed_activity:
          "<a href='" +
          urls.CONTACT_PAGE_URL +
          contact.id +
          "'><img src='" +
          urls.DOMAIN_URL +
          "assets/images/contact.png'/></a>",
      },
    };

    sgMail
      .send(msg)
      .then()
      .catch((err) => {
        console.log('send message err: ', err);
      });
  }

  const timelines = await TimeLine.find({
    contact: contact.id,
    status: 'checking',
    watched_pdf: query['pdf'],
    'condition.case': 'watched_pdf',
    'condition.answer': true,
  }).catch((err) => {
    console.log('err', err);
  });

  // if (timelines.length > 0) {
  //   for (let i = 0; i < timelines.length; i++) {
  //     try {
  //       const timeline = timelines[i];
  //       TimeLineCtrl.runTimeline(timeline.id);
  //       timeline['status'] = 'completed';
  //       timeline.save().catch((err) => {
  //         console.log('err', err);
  //       });
  //       const data = {
  //         contact: contact.id,
  //         ref: timeline.ref,
  //       };
  //       if (timeline.ref) {
  //         TimeLineCtrl.activeNext(data);
  //       }
  //     } catch (err) {
  //       console.log('err', err);
  //     }
  //   }
  // }

  if (timelines.length > 0) {
    for (let i = 0; i < timelines.length; i++) {
      try {
        const timeline = timelines[i];
        TimeLineCtrl.activeTimeline(timeline.id);
      } catch (err) {
        console.log('err', err.message);
      }
    }
  }

  const unwatched_timelines = await TimeLine.find({
    contact: contact.id,
    status: 'active',
    watched_pdf: query['pdf'],
    'condition.case': 'watched_pdf',
    'condition.answer': false,
  }).catch((err) => {
    console.log('err', err);
  });

  if (unwatched_timelines.length > 0) {
    for (let i = 0; i < unwatched_timelines.length; i++) {
      const timeline = unwatched_timelines[i];
      TimeLineCtrl.disableNext(timeline.id);
    }
  }

  if (
    (garbage.auto_follow_up2 && garbage.auto_follow_up2['enabled']) ||
    (garbage.auto_resend2 && garbage.auto_resend2['enabled'])
  ) {
    Task.deleteMany({
      contact: contact.id,
      status: 'active',
      watched_pdf: query['pdf'],
      'condition.case': 'watched_pdf',
      'condition.answer': false,
    }).catch((err) => {
      console.log('unwatched pdf task remove err', err.message);
    });
  }

  const activity = new Activity({
    content: 'reviewed pdf',
    contacts: query.contact,
    user: currentUser.id,
    type: 'pdf_trackers',
    pdf_trackers: query.id,
    pdfs: pdf.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  activity
    .save()
    .then(async (_activity) => {
      Contact.updateOne(
        { _id: query.contact },
        {
          $set: { last_activity: _activity.id },
        }
      ).catch((err) => {
        console.log('err', err.message);
      });

      await Notification.deleteMany({ pdf_tracker: query.id });
      const newNotification = new Notification({
        criteria: 'material_track',
        user: currentUser._id,
        contact: query.contact,
        action: {
          object: 'pdf',
          pdf: [pdf.id],
        },
        pdf_tracker: query.id,
      });
      newNotification.save().catch((err) => {
        console.log('PDF Watch Notification creating is failed.', err);
      });
    })
    .catch((err) => {
      console.log('err', err.message);
    });
};

const updatePDF = async (duration, pdf_tracker_id) => {
  const pdf_tracker = await PDFTracker.findOne({ _id: pdf_tracker_id });
  pdf_tracker['duration'] = duration;
  pdf_tracker['updated_at'] = new Date();
  pdf_tracker.save();
};

const createVideo = async (data) => {
  const video_tracker = new VideoTracker({
    ...data,
    updated_at: new Date(),
    created_at: new Date(),
  });
  const video = await video_tracker.save();
  return video;
};

const disconnectVideo = async (video_tracker_id, isEnd = false) => {
  const query = await VideoTracker.findOne({ _id: video_tracker_id });
  const currentUser = await User.findOne({ _id: query['user'], del: false });
  const contact = await Contact.findOne({ _id: query['contact'] });
  const video = await Video.findOne({ _id: query['video'] });
  const garbage = await Garbage.findOne({ user: query['user'] });
  const time_zone = currentUser.time_zone_info
    ? JSON.parse(currentUser.time_zone_info).tz_name
    : system_settings.TIME_ZONE;
  let full_watched;

  if (currentUser && contact) {
    const activity = new Activity({
      content: 'watched video',
      contacts: query.contact,
      user: currentUser.id,
      type: 'video_trackers',
      video_trackers: query.id,
      videos: video.id,
    });

    if (query.material_last) {
      if (query.material_last * 1000 > video.duration - 10000) {
        full_watched = true;
      }
      Activity.updateOne(
        {
          _id: query.activity,
        },
        {
          material_last: query.material_last,
          full_watched,
        },
        {
          timestamps: false,
        }
      ).catch((err) => {
        console.log('activty material last update err', err.message);
      });
    }

    await Activity.deleteMany({ video_trackers: query.id });

    activity
      .save()
      .then(async (_activity) => {
        Contact.updateOne(
          { _id: query.contact },
          { $set: { last_activity: _activity.id } }
        ).catch((err) => {
          console.log('err', err.message);
        });

        await Notification.deleteMany({ video_tracker: query.id });
        const notificationAction = {
          object: 'video',
          video: [video.id],
        };
        if (isEnd) {
          notificationAction.isEnd = true;
        }
        const newNotification = new Notification({
          criteria: 'material_track',
          user: currentUser._id,
          contact: query.contact,
          action: notificationAction,
          video_tracker: query.id,
        });
        newNotification.save().catch((err) => {
          console.log('Video Watch Notification creating is failed.', err);
        });
      })
      .catch((err) => {
        console.log('err', err.message);
      });

    const timelines = await TimeLine.find({
      contact: contact.id,
      status: 'checking',
      watched_video: query['video'],
      'condition.case': 'watched_video',
      'condition.answer': true,
    }).catch((err) => {
      console.log('err', err.message);
    });

    if (timelines.length > 0) {
      for (let i = 0; i < timelines.length; i++) {
        try {
          const timeline = timelines[i];
          TimeLineCtrl.activeTimeline(timeline.id);
        } catch (err) {
          console.log('err', err.message);
        }
      }
    }

    const unwatched_timelines = await TimeLine.find({
      contact: contact.id,
      status: 'active',
      watched_video: query['video'],
      'condition.case': 'watched_video',
      'condition.answer': false,
    }).catch((err) => {
      console.log('err', err);
    });

    if (unwatched_timelines.length > 0) {
      for (let i = 0; i < unwatched_timelines.length; i++) {
        const timeline = unwatched_timelines[i];
        TimeLineCtrl.disableNext(timeline.id);
      }
    }

    if (
      (garbage.auto_follow_up2 && garbage.auto_follow_up2['enabled']) ||
      (garbage.auto_resend2 && garbage.auto_resend2['enabled'])
    ) {
      Task.deleteMany({
        contacts: contact.id,
        status: 'active',
        watched_video: query['video'],
        'condition.case': 'watched_video',
        'condition.answer': false,
      })
        .then(() => {
          console.log('task bulk remove');
        })
        .catch((err) => {
          console.log('unwatched case task remove err', err.message);
        });
    }

    const d = query['duration'] / 1000;
    var h = Math.floor(d / 3600);
    var m = Math.floor((d % 3600) / 60);
    var s = Math.floor((d % 3600) % 60);

    if (h < 10) {
      h = '0' + h;
    }
    if (m < 10) {
      m = '0' + m;
    }
    if (s < 10) {
      s = '0' + s;
    }
    const timeWatched = h + ':' + m + ':' + s;

    const tD = Math.floor(video.duration / 1000);
    var tH = Math.floor(tD / 3600);
    var tM = Math.floor((tD % 3600) / 60);
    var tS = Math.floor((tD % 3600) % 60);

    if (tH < 10) {
      tH = '0' + tH;
    }
    if (tM < 10) {
      tM = '0' + tM;
    }
    if (tS < 10) {
      tS = '0' + tS;
    }

    let timeTotal = '';

    if (tH === '00') {
      timeTotal = tM + ':' + tS;
    } else {
      timeTotal = tH + ':' + tM + ':' + tS;
    }

    const desktop_notification = garbage.desktop_notification;
    // send desktop notification
    if (desktop_notification['material'] === true) {
      webpush.setVapidDetails(
        'mailto:support@crmgrow.com',
        api.VAPID.PUBLIC_VAPID_KEY,
        api.VAPID.PRIVATE_VAPID_KEY
      );

      const subscription = JSON.parse(
        currentUser.desktop_notification_subscription
      );
      const title =
        contact.first_name +
        ' ' +
        contact.last_name +
        ' - ' +
        contact.email +
        ' watched video -' +
        video.title;
      const created_at =
        moment(query['created_at']).tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment(query['created_at']).tz(time_zone).format('h:mm a');

      const body =
        'Watched ' + timeWatched + ' of ' + timeTotal + ' on ' + created_at;
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

    const text_notification = garbage.text_notification;
    // send text notification
    if (text_notification['material'] === true && currentUser.cell_phone) {
      const e164Phone = phone(currentUser.cell_phone)[0];

      if (!e164Phone) {
        const error = {
          error: 'Invalid Phone Number',
        };
        throw error; // Invalid phone number
      } else {
        // let fromNumber = currentUser['proxy_number'];
        // if (!fromNumber) {
        //   fromNumber = api.SIGNALWIRE.DEFAULT_NUMBER;
        // }
        const fromNumber = api.SIGNALWIRE.SYSTEM_NUMBER;

        const title =
          contact.first_name +
          ' ' +
          contact.last_name +
          '\n' +
          contact.email +
          '\n' +
          contact.cell_phone +
          '\n' +
          '\n' +
          ' Watched video: ' +
          video.title +
          '\n';
        const created_at =
          moment(query['created_at']).tz(time_zone).format('MM/DD/YYYY') +
          ' at ' +
          moment(query['created_at']).tz(time_zone).format('h:mm a');
        const body =
          'watched ' + timeWatched + ' of ' + timeTotal + ' on ' + created_at;
        const contact_link = urls.CONTACT_PAGE_URL + contact.id;

        client.messages
          .create({
            from: fromNumber,
            to: e164Phone,
            body:
              title +
              '\n' +
              body +
              '\n' +
              contact_link +
              '\n\n' +
              generateUnsubscribeLink(),
            // body: title + '\n' + body,
          })
          .catch((err) => console.error(err));
      }
    }

    const email_notification = garbage.email_notification;
    // send email notification

    if (email_notification['material']) {
      /**
       * sendgrid
       */
      /**
      sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
      const created_at = moment(query['created_at'])
        .tz(time_zone)
        .format('h:mm: a');

      const msg = {
        to: currentUser.email,
        from: mail_contents.NOTIFICATION_WATCHED_VIDEO.MAIL,
        templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
        dynamic_template_data: {
          subject: `${mail_contents.NOTIFICATION_WATCHED_VIDEO.SUBJECT} ${contact.first_name} ${contact.last_name} - ${created_at}`,
          first_name: contact.first_name,
          last_name: contact.last_name,
          phone_number: `<a href="tel:${contact.cell_phone}">${contact.cell_phone}</a>`,
          email: `<a href="mailto:${contact.email}">${contact.email}</a>`,
          activity:
            contact.first_name + ' watched video - <b>' + video.title + '</b>',
          duration:
            'Watched <b>' +
            timeWatched +
            ' of ' +
            timeTotal +
            ' </b>at ' +
            created_at,
          detailed_activity:
            "<a href='" +
            urls.CONTACT_PAGE_URL +
            contact.id +
            "'><img src='" +
            urls.DOMAIN_URL +
            "assets/images/contact.png'/></a>",
        },
      };

      sgMail.send(msg).catch((err) => console.error(err));
       */

      const created_at = moment(query['created_at'])
        .tz(time_zone)
        .format('h:mmA');

      const data = {
        template_data: {
          user_name: currentUser.user_name,
          created_at,
          contact_url: urls.CONTACT_PAGE_URL + contact.id,
          contact_name: contact.first_name + contact.last_name,
          material_title: video.title,
          material_url: `${urls.MATERIAL_USER_VIEW_VIDEO_URL}?video=${video.id}&user=${currentUser.id}`,
          thumbnail_url: video.thumbnail,
          duration: timeWatched,
          end_at: Math.trunc(query.end),
          start_at: Math.trunc(query.start),
        },
        template_name: 'VideoWatched',
        required_reply: false,
        email: currentUser.email,
      };

      sendNotificationEmail(data);
    }

    const auto_follow_up = garbage.auto_follow_up;
    if (auto_follow_up['enabled']) {
      const now = moment();
      now.set({ second: 0, millisecond: 0 });
      const follow_due_date = now.add(auto_follow_up.period, 'hours');
      let follow_up = null;
      if (contact.auto_follow_up) {
        follow_up = await FollowUp.findOne({ _id: contact.auto_follow_up });
      }

      let reminder_before = 30;
      if (garbage) {
        reminder_before = garbage.reminder_before;
      }

      const startdate = moment(follow_due_date);
      const remind_at = startdate.subtract(reminder_before, 'mins');

      if (follow_up) {
        FollowUp.updateOne(
          {
            _id: contact.auto_follow_up,
          },
          {
            $set: { due_date: follow_due_date, remind_at },
          }
        ).catch((err) => {
          console.log('follow error', err.message);
        });

        let detail_content = 'updated task';
        detail_content = ActivityHelper.autoSettingLog(detail_content);

        const activity = new Activity({
          content: detail_content,
          contacts: contact.id,
          user: currentUser.id,
          type: 'follow_ups',
          follow_ups: contact.auto_follow_up,
        });

        activity.save().catch((err) => {
          console.log('follow save error', err.message);
        });
      } else {
        const follow_up = new FollowUp({
          user: currentUser.id,
          contact: contact.id,
          content: auto_follow_up['content'],
          due_date: follow_due_date,
          remind_at,
        });

        follow_up
          .save()
          .then(async (_followup) => {
            Contact.updateOne(
              {
                _id: contact.id,
              },
              {
                $set: {
                  auto_follow_up: _followup.id,
                },
              }
            ).catch((err) => {
              console.log('contact update error', err.message);
            });

            let detail_content = 'added task';
            detail_content = ActivityHelper.autoSettingLog(detail_content);

            const activity = new Activity({
              content: detail_content,
              contacts: contact.id,
              user: currentUser.id,
              type: 'follow_ups',
              follow_ups: _followup.id,
            });

            activity.save().catch((err) => {
              console.log('follow error', err.message);
            });
          })
          .catch((err) => {
            console.log('follow error', err.message);
          });
      }
    }

    const auto_resend = garbage.auto_resend;
    if (auto_resend['enabled']) {
      if (query.material_last * 1000 < video.duration - 10000) {
        const _activity = await Activity.findOne({ _id: query.activity }).catch(
          (err) => {
            console.log('activity found err', err.message);
          }
        );
        console.log('tracking checking activity', _activity);
        if (_activity && !_activity.full_watched) {
          let time_line;
          const now = moment();
          const due_date = now.add(auto_resend.period, 'hours');
          due_date.set({ second: 0, millisecond: 0 });

          if (_activity.emails) {
            time_line = await Task.findOne({
              type: 'resend_email_video1',
              'action.activity': _activity.id,
              status: 'active',
            });
            if (time_line) {
              time_line.due_date = due_date;
            } else {
              const canned_message = await EmailTemplate.findOne({
                _id: auto_resend.email_canned_message,
              });
              time_line = new Task({
                user: currentUser.id,
                contacts: contact.id,
                type: 'resend_email_video1',
                action: {
                  activity: _activity.id,
                  content: canned_message.content,
                  subject: canned_message.subject,
                  video: video.id,
                },
                status: 'active',
                due_date,
              });
            }
          } else if (_activity.texts) {
            time_line = await Task.findOne({
              type: 'resend_text_video1',
              'action.activity': _activity.id,
              status: 'active',
            });
            if (time_line) {
              time_line.due_date = due_date;
            } else {
              const canned_message = await EmailTemplate.findOne({
                _id: auto_resend.sms_canned_message,
              });
              time_line = new Task({
                user: currentUser.id,
                contacts: contact.id,
                type: 'resend_text_video1',
                action: {
                  activity: _activity.id,
                  content: canned_message.content,
                  video: video.id,
                },
                status: 'active',
                due_date,
              });
            }
          }

          time_line.save().catch((err) => {
            console.log('time line save err', err);
          });
        }
      }
    }
  }
};

const updateVideo = async (
  video_tracker_id,
  duration,
  material_last,
  start,
  end,
  gap
) => {
  const gapData = {};
  if (gap && gap.length) {
    gapData['gap'] = gap;
  }
  await VideoTracker.updateOne(
    { _id: video_tracker_id },
    {
      $set: {
        duration,
        material_last,
        start,
        end,
        ...gapData,
      },
    }
  );
};

const createImage = async (data) => {
  const image_tracker = new ImageTracker({
    ...data,
    updated_at: new Date(),
    created_at: new Date(),
  });
  const image = await image_tracker.save();
  return image;
};

const disconnectImage = async (image_tracker_id) => {
  const query = await ImageTracker.findOne({ _id: image_tracker_id });
  const currentUser = await User.findOne({ _id: query['user'] });
  const contact = await Contact.findOne({ _id: query['contact'] });
  const image = await Image.findOne({ _id: query['image'] });
  const garbage = await Garbage.findOne({ user: query['user'] });
  const time_zone = currentUser.time_zone_info
    ? JSON.parse(currentUser.time_zone_info).tz_name
    : system_settings.TIME_ZONE;

  const activity = new Activity({
    content: 'reviewed image',
    contacts: query.contact,
    user: currentUser.id,
    type: 'image_trackers',
    image_trackers: query.id,
    images: image.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  activity
    .save()
    .then(async (_activity) => {
      Contact.updateOne(
        { _id: query.contact },
        {
          $set: { last_activity: _activity.id },
        }
      ).catch((err) => {
        console.log('err', err);
      });
      await Notification.deleteMany({ image_tracker: query.id });
      const newNotification = new Notification({
        criteria: 'material_track',
        user: currentUser._id,
        contact: query.contact,
        action: {
          object: 'image',
          image: [image.id],
        },
        image_tracker: query.id,
      });
      newNotification.save().catch((err) => {
        console.log('Image Watch Notification creating is failed.', err);
      });
    })
    .catch((err) => {
      console.log('err', err);
    });

  const timelines = await TimeLine.find({
    contact: contact.id,
    status: 'checking',
    watched_image: query['image'],
    'condition.case': 'watched_image',
    'condition.answer': true,
  }).catch((err) => {
    console.log('err', err);
  });

  // if (timelines.length > 0) {
  //   for (let i = 0; i < timelines.length; i++) {
  //     try {
  //       const timeline = timelines[i];
  //       TimeLineCtrl.runTimeline(timeline.id);
  //       timeline['status'] = 'completed';
  //       timeline.save().catch((err) => {
  //         console.log('err', err);
  //       });
  //       const data = {
  //         contact: contact.id,
  //         ref: timeline.ref,
  //       };
  //       if (timeline.ref) {
  //         TimeLineCtrl.activeNext(data);
  //       }
  //     } catch (err) {
  //       console.log('err', err);
  //     }
  //   }
  // }

  if (timelines.length > 0) {
    for (let i = 0; i < timelines.length; i++) {
      try {
        const timeline = timelines[i];
        TimeLineCtrl.activeTimeline(timeline.id);
      } catch (err) {
        console.log('err', err.message);
      }
    }
  }
  const unwatched_timelines = await TimeLine.find({
    contact: contact.id,
    status: 'active',
    watched_image: query['image'],
    'condition.case': 'watched_image',
    'condition.answer': false,
  }).catch((err) => {
    console.log('err', err);
  });

  if (unwatched_timelines.length > 0) {
    for (let i = 0; i < unwatched_timelines.length; i++) {
      const timeline = unwatched_timelines[i];
      TimeLineCtrl.disableNext(timeline.id);
    }
  }

  Task.deleteMany({
    contact: contact.id,
    status: 'active',
    watched_image: query['image'],
    'condition.case': 'watched_image',
    'condition.answer': false,
  }).catch((err) => {
    console.log('unwatched task remove err', err.message);
  });

  const d = query['duration'] / 1000;
  var h = Math.floor(d / 3600);
  var m = Math.floor((d % 3600) / 60);
  var s = Math.floor((d % 3600) % 60);

  if (h < 10) {
    h = '0' + h;
  }
  if (m < 10) {
    m = '0' + m;
  }
  if (s < 10) {
    s = '0' + s;
  }
  const timeWatched = h + ':' + m + ':' + s;

  const desktop_notification = garbage['desktop_notification'];
  // send desktop notification
  if (desktop_notification['material'] === true) {
    webpush.setVapidDetails(
      'mailto:support@crmgrow.com',
      api.VAPID.PUBLIC_VAPID_KEY,
      api.VAPID.PRIVATE_VAPID_KEY
    );

    const subscription = JSON.parse(
      currentUser.desktop_notification_subscription
    );
    const title =
      contact.first_name +
      ' ' +
      contact.last_name +
      ' - ' +
      contact.email +
      ' reviewed image -' +
      image.title;
    const created_at =
      moment(query['created_at']).tz(time_zone).format('MM/DD/YYYY') +
      ' at ' +
      moment(query['created_at']).tz(time_zone).format('h:mm a');
    const body = 'Watched ' + timeWatched + ' on ' + created_at;
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

  const text_notification = garbage['text_notification'];
  // send text notification
  if (text_notification['material'] === true) {
    const e164Phone = phone(currentUser.cell_phone)[0];

    if (!e164Phone) {
      const error = {
        error: 'Invalid Phone Number',
      };

      throw error; // Invalid phone number
    } else {
      // let fromNumber = currentUser['proxy_number'];
      // if (!fromNumber) {
      //   fromNumber = api.SIGNALWIRE.DEFAULT_NUMBER;
      // }
      const fromNumber = api.SIGNALWIRE.SYSTEM_NUMBER;

      const title =
        contact.first_name +
        ' ' +
        contact.last_name +
        '\n' +
        contact.email +
        '\n' +
        contact.cell_phone +
        '\n' +
        '\n' +
        ' Reviewed image: ' +
        image.title +
        '\n';
      const created_at =
        moment(query['created_at']).tz(time_zone).format('MM/DD/YYYY') +
        ' at ' +
        moment(query['created_at']).tz(time_zone).format('h:mm a');
      const body = 'Watched ' + timeWatched + ' on ' + created_at + '\n ';
      const contact_link = urls.CONTACT_PAGE_URL + contact.id;

      client.messages
        .create({
          from: fromNumber,
          to: e164Phone,
          body:
            title +
            '\n' +
            body +
            '\n' +
            contact_link +
            '\n\n' +
            generateUnsubscribeLink(),
          // body: title + '\n' + body,
        })
        .catch((err) => console.error(err));
    }
  }

  const email_notification = garbage['email_notification'];
  // send email notification
  if (email_notification['material']) {
    sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

    const created_at = moment(query['created_at'])
      .tz(time_zone)
      .format('h:mm:ss a');
    const msg = {
      to: currentUser.email,
      from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
      templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
      dynamic_template_data: {
        subject: `${mail_contents.NOTIFICATION_REVIEWED_IMAGE.SUBJECT}- ${contact.first_name} ${contact.last_name} - ${created_at}`,
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone_number: `<a href="tel:${contact.cell_phone}">${contact.cell_phone}</a>`,
        email: `<a href="mailto:${contact.email}">${contact.email}</a>`,
        activity:
          contact.first_name + ' reviewed image - <b>' + image.title + '</b>',
        duration: 'Watched <b>' + timeWatched + ' </b>at ' + created_at,
        detailed_activity:
          "<a href='" +
          urls.CONTACT_PAGE_URL +
          contact.id +
          "'><img src='" +
          urls.DOMAIN_URL +
          "assets/images/contact.png'/></a>",
      },
    };

    sgMail
      .send(msg)
      .then()
      .catch((err) => {
        console.log('send message err: ', err);
      });
  }
};

const updateImage = async (duration, image_tracker_id) => {
  const image_tracker = await ImageTracker.findOne({ _id: image_tracker_id });
  image_tracker['duration'] = duration;
  image_tracker['updated_at'] = new Date();
  image_tracker.save();
};

const setup = (io) => {
  console.info('Setup Socket.io:');
  io.sockets.on('connection', (socket) => {
    socket.emit('connected');
    socket.on('init_pdf', (data) => {
      createPDF(data).then((_pdf_tracker) => {
        socket.type = 'pdf';
        socket.pdf_tracker = _pdf_tracker;
      });
    });

    socket.on('update_pdf', (duration) => {
      const pdf_tracker = socket.pdf_tracker;
      if (typeof pdf_tracker !== 'undefined') {
        updatePDF(duration, pdf_tracker._id).catch((err) => {
          console.log('err', err);
        });
      }
    });

    socket.on('init_video', (data) => {
      createVideo(data).then((_video_tracker) => {
        socket.type = 'video';
        socket.video_tracker = _video_tracker;
        socket.emit('inited_video', { _id: _video_tracker._id });
      });
    });

    socket.on('update_video', (data) => {
      const video_tracker = socket.video_tracker;
      if (typeof video_tracker !== 'undefined') {
        const { duration, material_last, start, end, gap } = data;
        updateVideo(video_tracker._id, duration, material_last, start, end, gap)
          .then(() => {})
          .catch((err) => {
            console.log('err', err);
          });
      } else {
        const { duration, material_last, tracker_id, start, end, gap } = data;
        updateVideo(tracker_id, duration, material_last, start, end, gap)
          .then(() => {
            VideoTracker.findOne({ _id: tracker_id }).then((tracker) => {
              socket.type = 'video';
              socket.video_tracker = tracker;
            });
          })
          .catch((err) => {
            console.log('err', err);
          });
      }
    });

    socket.on('init_image', (data) => {
      createImage(data).then((_image_tracker) => {
        socket.type = 'image';
        socket.image_tracker = _image_tracker;
      });
    });

    socket.on('update_image', (duration) => {
      const image_tracker = socket.image_tracker;
      if (typeof image_tracker !== 'undefined') {
        updateImage(duration, image_tracker._id)
          .then(() => {})
          .catch((err) => {
            console.log('err', err);
          });
      }
    });

    socket.on('disconnect', () => {
      if (socket.type === 'pdf') {
        console.log('PDF_disconnecting');
        const pdf_tracker = socket.pdf_tracker;
        if (!socket.pdf_tracker.viewed) {
          console.log('PDF disconnected');
          disconnectPDF(pdf_tracker._id);
        }
      } else if (socket.type === 'video') {
        const video_tracker = socket.video_tracker;
        console.log('video_disconnecting', JSON.stringify(video_tracker));
        if (!socket.video_tracker.viewed) {
          console.log('disconnected');
          disconnectVideo(video_tracker._id);
        }
      } else if (socket.type === 'image') {
        console.log('image_disconnecting');
        const image_tracker = socket.image_tracker;
        if (!socket.image_tracker.viewed) {
          console.log('disconnected');
          console.log('image_tracker', image_tracker);
          disconnectImage(image_tracker._id);
        }
      }
    });

    socket.on('close', (data) => {
      if (socket.type === 'pdf') {
        const pdf_tracker = socket.pdf_tracker;
        socket.pdf_tracker.viewed = true;
        disconnectPDF(pdf_tracker._id);
      } else if (socket.type === 'video') {
        console.log('close', JSON.stringify(data));
        const video_tracker = socket.video_tracker;
        if (data.mode === 'end_reached') {
          disconnectVideo(video_tracker._id, true);
          return;
        }
        if (data.mode === 'full_watched') {
          socket.video_tracker.viewed = true;
        }
        disconnectVideo(video_tracker._id);
      } else if (socket.type === 'image') {
        const image_tracker = socket.image_tracker;
        socket.image_tracker.viewed = true;
        disconnectImage(image_tracker._id);
      }
    });
    // auth(socket)
  });
};

module.exports = {
  setup,
};
