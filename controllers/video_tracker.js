const { validationResult } = require('express-validator/check');
const sgMail = require('@sendgrid/mail');
const webpush = require('web-push');
const User = require('../models/user');
const Contact = require('../models/contact');
const VideoTracker = require('../models/video_tracker');
const Video = require('../models/video');
const Activity = require('../models/activity');
const urls = require('../constants/urls');
const mail_contents = require('../constants/mail_contents');
const api = require('../config/api');

const get = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.params;
  const data = await VideoTracker.find({
    user: currentUser.id,
    contact,
  });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Video log doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const create = async (data) => {
  const video_tracker = new VideoTracker({
    ...data,
    updated_at: new Date(),
    created_at: new Date(),
  });
  const video = await video_tracker.save();
  return video;
};

const createbyDesktop = async (req, res) => {
  const query = { ...req.query };
  const video_tracker = new VideoTracker({
    ...query,
    updated_at: new Date(),
    created_at: new Date(),
  });
  const currentUser = await User.findOne({ _id: query.user });
  const contact = await Contact.findOne({ _id: query.contact });
  const video = await Video.findOne({ _id: query.video });

  const d = query.duration / 1000;
  let h = Math.floor(d / 3600);
  let m = Math.floor((d % 3600) / 60);
  let s = Math.floor((d % 3600) % 60);

  if (h < 10) {
    h = `0${h}`;
  }
  if (m < 10) {
    m = `0${m}`;
  }
  if (s < 10) {
    s = `0${s}`;
  }
  const timeWatched = `${h}:${m}:${s}`;

  const tD = Math.floor(video.duration / 1000);
  let tH = Math.floor(tD / 3600);
  let tM = Math.floor((tD % 3600) / 60);
  let tS = Math.floor((tD % 3600) % 60);

  if (tH < 10) {
    tH = `0${tH}`;
  }
  if (tM < 10) {
    tM = `0${tM}`;
  }
  if (tS < 10) {
    tS = `0${tS}`;
  }

  const timeTotal = `${tH}:${tM}:${tS}`;

  // send desktop notification
  if (currentUser.desktop_notification === true) {
    webpush.setVapidDetails(
      'mailto:support@teamgrow.co',
      api.VAPID.PUBLIC_VAPID_KEY,
      api.VAPID.PRIVATE_VAPID_KEY
    );

    const subscription = JSON.parse(
      currentUser.desktop_notification_subscription
    );
    const title = `${contact.first_name} watched video -${video.title}`;
    const body = `Watched ${timeWatched} of ${timeTotal} at ${query.time_start}`;
    const playload = JSON.stringify({
      notification: { title, body, icon: '/fav.ico' },
    });
    webpush
      .sendNotification(subscription, playload)
      .catch((err) => console.error(err));
  }

  // send email notification
  sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

  const msg = {
    to: currentUser.email,
    from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
    subject: mail_contents.NOTIFICATION_SEND_MATERIAL.SUBJECT,
    templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
    dynamic_template_data: {
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone_number: contact.cell_phone,
      email: contact.email,
      activity: `${contact.first_name} watched video - <b>${video.title}</b>`,
      duration: `Watched <b>${timeWatched} of ${timeTotal} </b>at ${query.time_start}`,
      detailed_activity: `<a href='${urls.CONTACT_PAGE_URL}${contact.id}' style='text-decoration: none;'>View Contact</a>`,
    },
  };

  sgMail.send(msg).then();

  video_tracker.save().then((_video_tracker) => {
    const activity = new Activity({
      content: `${contact.first_name} watched video`,
      contacts: _video_tracker.contact,
      user: currentUser.id,
      type: 'video_trackers',
      video_trackers: _video_tracker.id,
      created_at: new Date(),
      updated_at: new Date(),
    });

    activity.save().then((_activity) => {
      const myJSON = JSON.stringify(_video_tracker);
      const data = JSON.parse(myJSON);
      data.activity = _activity;
    });
  });
};
const disconnect = async (video_tracker_id) => {
  const query = await VideoTracker.findOne({ _id: video_tracker_id });
  const currentUser = await User.findOne({ _id: query.user });
  const contact = await Contact.findOne({ _id: query.contact });
  const video = await Video.findOne({ _id: query.video });

  const d = query.duration / 1000;
  let h = Math.floor(d / 3600);
  let m = Math.floor((d % 3600) / 60);
  let s = Math.floor((d % 3600) % 60);

  if (h < 10) {
    h = `0${h}`;
  }
  if (m < 10) {
    m = `0${m}`;
  }
  if (s < 10) {
    s = `0${s}`;
  }
  const timeWatched = `${h}:${m}:${s}`;

  const tD = Math.floor(video.duration / 1000);
  let tH = Math.floor(tD / 3600);
  let tM = Math.floor((tD % 3600) / 60);
  let tS = Math.floor((tD % 3600) % 60);

  if (tH < 10) {
    tH = `0${tH}`;
  }
  if (tM < 10) {
    tM = `0${tM}`;
  }
  if (tS < 10) {
    tS = `0${tS}`;
  }

  const timeTotal = `${tH}:${tM}:${tS}`;

  // send desktop notification
  if (currentUser.desktop_notification === true) {
    webpush.setVapidDetails(
      'mailto:support@crmgrow.com',
      api.VAPID.PUBLIC_VAPID_KEY,
      api.VAPID.PRIVATE_VAPID_KEY
    );

    const subscription = JSON.parse(
      currentUser.desktop_notification_subscription
    );
    const title = `${contact.first_name} watched video -${video.title}`;
    const body = `Watched ${timeWatched} of ${timeTotal} at ${query.created_at}`;
    const playload = JSON.stringify({
      notification: { title, body, icon: '/fav.ico' },
    });
    webpush
      .sendNotification(subscription, playload)
      .catch((err) => console.error(err));
  }

  // send email notification
  sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);

  const msg = {
    to: currentUser.email,
    from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
    subject: mail_contents.NOTIFICATION_SEND_MATERIAL.SUBJECT,
    templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
    dynamic_template_data: {
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone_number: contact.cell_phone,
      email: contact.email,
      activity: `${contact.first_name} watched video - <b>${video.title}</b>`,
      duration: `Watched <b>${timeWatched} of ${timeTotal} </b>at ${query.created_at}`,
      detailed_activity: `<a href='${urls.CONTACT_PAGE_URL}${contact.id}' style='text-decoration: none;'>View Contact</a>`,
    },
  };

  sgMail.send(msg).then();

  const activity = new Activity({
    content: `${contact.first_name} watched video`,
    contacts: query.contact,
    user: currentUser.id,
    type: 'video_trackers',
    video_trackers: query.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  activity
    .save()
    .then((_activity) => {
      Contact.updateOne(
        { _id: query.contact },
        {
          $set: { last_activity: _activity.id },
        }
      ).catch((err) => {
        console.log('err', err);
      });
    })
    .catch((err) => {
      console.log('err', err);
    });
};

const update = async (duration, video_tracker_id) => {
  const video_tracker = await VideoTracker.findOne({ _id: video_tracker_id });
  video_tracker.duration = duration;
  video_tracker.updated_at = new Date();
  await video_tracker.save();
};

const setup = (io) => {
  console.info('Setup Socket.io:');
  io.sockets.on('connection', (socket) => {
    socket.emit('connected');
    socket.on('init', (data) => {
      create(data).then((_video_tracker) => {
        console.log('connection', _video_tracker._id);
        socket.video_tracker = _video_tracker;
      });
    });

    socket.on('update', (duration) => {
      const { video_tracker } = socket;
      console.log('update', video_tracker._id);
      update(duration, video_tracker._id);
    });

    socket.on('disconnecting', () => {
      const { video_tracker } = socket;
      console.log('video_tracker is canceling', video_tracker._id);
      disconnect(video_tracker);
    });
    // auth(socket)
  });
};

module.exports = {
  get,
  createbyDesktop,
  setup,
};
