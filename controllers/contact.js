/* eslint-disable eqeqeq */
const mongoose = require('mongoose');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const csv = require('csv-parser');
const webpush = require('web-push');
const phone = require('phone');
const moment = require('moment');
const Verifier = require('email-verifier');
const AWS = require('aws-sdk');

const Contact = require('../models/contact');
const Activity = require('../models/activity');
const FollowUp = require('../models/follow_up');
const Appointment = require('../models/appointment');
const Email = require('../models/email');
const Note = require('../models/note');
const User = require('../models/user');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const TimeLine = require('../models/time_line');
const Automation = require('../models/automation');
const EmailTracker = require('../models/email_tracker');
const Reminder = require('../models/reminder');
const Garbage = require('../models/garbage');
const Image = require('../models/image');
const Text = require('../models/text');
const ImageTracker = require('../models/image_tracker');
const PDFTracker = require('../models/pdf_tracker');
const VideoTracker = require('../models/video_tracker');
const PhoneLog = require('../models/phone_log');
const Deal = require('../models/deal');
const DealStage = require('../models/deal_stage');
const Team = require('../models/team');
const Label = require('../models/label');
const Notification = require('../models/notification');
const LabelHelper = require('../helpers/label');
const ActivityHelper = require('../helpers/activity');
const urls = require('../constants/urls');
const api = require('../config/api');
const system_settings = require('../config/system_settings');
const mail_contents = require('../constants/mail_contents');
const { getAvatarName, validateEmail } = require('../helpers/utility');
const { contacts } = require('node-outlook');
const { FlowPage } = require('twilio/lib/rest/studio/v1/flow');

const accountSid = api.TWILIO.TWILIO_SID;
const authToken = api.TWILIO.TWILIO_AUTH_TOKEN;

const twilio = require('twilio')(accountSid, authToken);

const ses = new AWS.SES({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const getAll = async (req, res) => {
  const { currentUser } = req;
  const data = await Contact.find({ user: currentUser.id });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Contact doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const getAllByLastActivity = async (req, res) => {
  const { currentUser } = req;
  const data = await Contact.find({ user: currentUser.id })
    .populate('last_activity')
    .sort({ first_name: 1 })
    .catch((err) => {
      console.log('err', err);
    });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Contact doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const getByLastActivity = async (req, res) => {
  const { currentUser } = req;
  let { field, dir } = req.body;
  dir = dir ? 1 : -1;
  const count = req.body.count || 50;
  if (field === 'updated_at') {
    field = 'last_activity';
    dir *= -1;
  } else {
    field = 'first_name';
  }

  let contacts;
  if (typeof req.params.id === 'undefined') {
    contacts = await Contact.find({
      $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
    })
      .populate('last_activity')
      .collation({ locale: 'en' })
      .sort({ [field]: dir })
      .limit(count);
  } else {
    const id = parseInt(req.params.id);
    contacts = await Contact.find({
      $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
    })
      .populate('last_activity')
      .collation({ locale: 'en' })
      .sort({ [field]: dir })
      .skip(id)
      .limit(count);
  }

  if (!contacts) {
    return res.status(400).json({
      status: false,
      error: 'Contacts doesn`t exist',
    });
  }

  const total = await Contact.countDocuments({
    $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
  });

  return res.send({
    status: true,
    data: {
      contacts,
      count: total,
    },
  });
};

const getDetail = async (req, res) => {
  const { currentUser } = req;
  const { count } = req.body;
  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  }
  const contactId = req.params.id;

  const _contact = await Contact.findOne({
    _id: contactId,
    $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
  }).catch((err) => {
    console.log('contact found err', err.message);
  });

  if (_contact) {
    // TimeLines
    const _timelines = await TimeLine.find({
      user: currentUser.id,
      contact: req.params.id,
      automation: { $ne: null },
    })
      .sort({ due_date: 1 })
      .catch((err) => {
        console.log('err', err);
      });
    let automation = {};
    if (_timelines.length) {
      automation = await Automation.findOne({
        _id: _timelines[0]['automation'],
      })
        .select({ title: 1 })
        .catch((err) => {
          console.log('err', err);
        });
    }

    // Contact Activity List
    let _activity_list;

    if (count) {
      _activity_list = await Activity.find({
        contacts: req.params.id,
        status: { $ne: 'pending' },
      })
        .sort({ updated_at: -1 })
        .limit(count)
        .populate([
          { path: 'video_trackers', select: '-_id -user -contact' },
          { path: 'image_trackers', select: '-_id -user -contact' },
          { path: 'pdf_trackers', select: '-_id -user -contact' },
          { path: 'email_trackers', select: '-_id -user -contact' },
          { path: 'text_trackers', select: '-_id -user -contact' },
        ]);
    } else {
      _activity_list = await Activity.find({
        contacts: req.params.id,
        status: { $ne: 'pending' },
      })
        .sort({ updated_at: 1 })
        .populate([
          { path: 'video_trackers', select: '-_id -user -contact' },
          { path: 'image_trackers', select: '-_id -user -contact' },
          { path: 'pdf_trackers', select: '-_id -user -contact' },
          { path: 'email_trackers', select: '-_id -user -contact' },
          { path: 'text_trackers', select: '-_id -user -contact' },
        ]);
    }

    // Contact Relative Details
    const videoIds = [];
    const imageIds = [];
    const pdfIds = [];
    const materials = [];
    let notes = [];
    let emails = [];
    let texts = [];
    let appointments = [];
    let tasks = [];
    let deals = [];
    let users = [];

    _activity_list.forEach((e) => {
      if (e['type'] === 'videos') {
        if (e['videos'] instanceof Array) {
          Array.prototype.push.apply(videoIds, e['videos']);
        } else {
          videoIds.push(e['videos']);
        }
      }
      if (e['type'] === 'images') {
        if (e['images'] instanceof Array) {
          Array.prototype.push.apply(imageIds, e['images']);
        } else {
          imageIds.push(e['images']);
        }
      }
      if (e['type'] === 'pdfs') {
        if (e['pdfs'] instanceof Array) {
          Array.prototype.push.apply(pdfIds, e['pdfs']);
        } else {
          pdfIds.push(e['pdfs']);
        }
      }
    });
    const videos = await Video.find({ _id: { $in: videoIds } });
    const pdfs = await PDF.find({ _id: { $in: pdfIds } });
    const images = await Image.find({ _id: { $in: imageIds } });
    Array.prototype.push.apply(materials, videos);
    Array.prototype.push.apply(materials, pdfs);
    Array.prototype.push.apply(materials, images);

    if (count) {
      const loadedIds = [];
      const noteIds = [];
      const emailIds = [];
      const textIds = [];
      const apptIds = [];
      const taskIds = [];
      const dealIds = [];
      const userIds = [];

      for (let i = 0; i < _activity_list.length; i++) {
        if (
          [
            'notes',
            'emails',
            'texts',
            'appointments',
            'follow_ups',
            'deals',
            'users',
          ].indexOf(_activity_list[i].type) !== -1
        ) {
          let detail_id = _activity_list[i][_activity_list[i].type];
          if (detail_id instanceof Array) {
            detail_id = detail_id[0];
          }
          if (loadedIds.indexOf(detail_id) === -1) {
            switch (_activity_list[i].type) {
              case 'notes':
                noteIds.push(detail_id);
                break;
              case 'emails':
                emailIds.push(detail_id);
                break;
              case 'texts':
                textIds.push(detail_id);
                break;
              case 'appointments':
                apptIds.push(detail_id);
                break;
              case 'follow_ups':
                taskIds.push(detail_id);
                break;
              case 'deals':
                dealIds.push(detail_id);
                break;
              case 'users':
                userIds.push(detail_id);
                break;
            }
          }
        }
      }
      notes = await Note.find({ _id: { $in: noteIds } });
      emails = await Email.find({ _id: { $in: emailIds } });
      texts = await Text.find({ _id: { $in: textIds } });
      appointments = await Appointment.find({ _id: { $in: apptIds } });
      tasks = await FollowUp.find({ _id: { $in: taskIds } });
      deals = await Deal.find({ _id: { $in: dealIds } });
      users = await User.find({ _id: { $in: userIds } }).select(
        '_id user_name email cell_phone picture_profile'
      );
    } else {
      notes = await Note.find({ contact: contactId });
      emails = await Email.find({ contacts: contactId });
      texts = await Text.find({ contacts: contactId });
      appointments = await Appointment.find({ contacts: contactId });
      tasks = await FollowUp.find({ contact: contactId });
      deals = await Deal.find({ contacts: contactId });
      users = await User.find({
        _id: { $in: _contact.shared_members || [] },
      }).select('_id user_name email cell_phone picture_profile');
    }

    const myJSON = JSON.stringify(_contact);
    const contact = JSON.parse(myJSON);
    const data = await Object.assign(
      contact,
      { activity: _activity_list },
      { time_lines: _timelines },
      { automation },
      {
        details: {
          materials,
          notes,
          emails,
          texts,
          appointments,
          tasks,
          deals,
          users,
        },
      }
    );

    return res.send({
      status: true,
      data,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }
};

const get = async (req, res) => {
  const { currentUser } = req;
  let { dir } = req.body;
  const { key, index, count } = req.body;

  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  }

  if (key === 'last_activity') {
    dir *= -1;
  }
  let next_contact;
  let prev_contact;

  const _contact = await Contact.findOne({
    _id: req.params.id,
    $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
  }).catch((err) => {
    console.log('contact found err', err.message);
  });

  if (_contact) {
    if (key === 'first_name') {
      next_contact = await Contact.find({
        user: currentUser.id,
      })
        .sort({ [key]: dir })
        .skip(index + 1)
        .limit(1);
      if (index - 1 >= 0) {
        prev_contact = await Contact.find({
          user: currentUser.id,
        })
          .sort({ [key]: dir })
          .skip(index - 1)
          .limit(1);
      }
    } else {
      if (dir === 1) {
        next_contact = await Contact.find({
          [key]: { $gte: _contact[key] },
          user: currentUser.id,
          _id: { $ne: req.params.id },
        })
          .sort({ [key]: 1 })
          .limit(1);
        prev_contact = await Contact.find({
          [key]: { $lte: _contact[key] },
          user: currentUser.id,
          _id: { $ne: req.params.id },
        })
          .sort({ [key]: -1 })
          .limit(1);
      } else {
        next_contact = await Contact.find({
          [key]: { $lte: _contact[key] },
          user: currentUser.id,
          _id: { $ne: req.params.id },
        })
          .sort({ [key]: -1 })
          .limit(1);
        prev_contact = await Contact.find({
          [key]: { $gte: _contact[key] },
          user: currentUser.id,
          _id: { $ne: req.params.id },
        })
          .sort({ [key]: 1 })
          .limit(1);
      }
    }

    let next = null;
    let prev = null;
    if (next_contact && next_contact[0]) {
      next = next_contact[0].id;
    }
    if (prev_contact && prev_contact[0]) {
      prev = prev_contact[0].id;
    }

    // const _follow_up = await FollowUp.find({
    //   user: currentUser.id,
    //   contact: req.params.id,
    //   status: { $ne: -1 },
    // }).sort({ due_date: 1 });

    // const _appointment = await Appointment.find({
    //   user: currentUser.id,
    //   contact: req.params.id,
    //   status: { $ne: -1 },
    // }).sort({ due_date: 1 });

    const _timelines = await TimeLine.find({
      user: currentUser.id,
      contact: req.params.id,
      automation: { $ne: null },
    })
      .sort({ due_date: 1 })
      .catch((err) => {
        console.log('err', err);
      });
    let automation = {};
    if (_timelines.length) {
      automation = await Automation.findOne({
        _id: _timelines[0]['automation'],
      })
        .select({ title: 1 })
        .catch((err) => {
          console.log('err', err);
        });
    }

    let _activity_list;

    if (count) {
      _activity_list = await Activity.find({
        contacts: req.params.id,
        status: { $ne: 'pending' },
      })
        .sort({ updated_at: -1 })
        .limit(count);
    } else {
      _activity_list = await Activity.find({
        contacts: req.params.id,
        status: { $ne: 'pending' },
      }).sort({ updated_at: 1 });
    }

    const _activity_detail_list = [];

    for (let i = 0; i < _activity_list.length; i++) {
      const _activity_detail = await Activity.aggregate([
        {
          $lookup: {
            from: _activity_list[i].type,
            localField: _activity_list[i].type,
            foreignField: '_id',
            as: 'activity_detail',
          },
        },
        {
          $match: { _id: _activity_list[i]._id },
        },
      ]);

      _activity_detail_list.push(_activity_detail[0]);
    }

    const myJSON = JSON.stringify(_contact);
    const contact = JSON.parse(myJSON);
    const data = await Object.assign(
      contact,
      // { follow_up: _follow_up },
      // { appointment: _appointment },
      { activity: _activity_detail_list },
      { next },
      { prev },
      { time_lines: _timelines },
      { automation }
    );

    return res.send({
      status: true,
      data,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }
};

const create = async (req, res) => {
  const { currentUser } = req;

  let max_upload_count = 0;
  let count = 0;

  const contact_info = currentUser.contact_info;
  if (contact_info['is_limit']) {
    count = await Contact.countDocuments({ user: currentUser.id });
    max_upload_count =
      contact_info.max_count || system_settings.CONTACT_UPLOAD_LIMIT.PRO;
  }

  if (contact_info['is_limit'] && max_upload_count <= count) {
    return res.status(410).send({
      status: false,
      error: 'Exceed upload max contacts',
    });
  }

  if (req.body.cell_phone) {
    req.body.cell_phone = phone(req.body.cell_phone)[0];
  } else {
    delete req.body.cell_phone;
  }

  /**
   *  Email / Phone unique validation
   */

  let contact_old;
  if (req.body.email && req.body.email != '') {
    contact_old = await Contact.findOne({
      user: currentUser.id,
      email: req.body['email'],
    });
    if (contact_old !== null) {
      return res.status(400).send({
        status: false,
        error: 'Email must be unique!',
      });
    }
  }

  if (req.body.cell_phone) {
    contact_old = await Contact.findOne({
      user: currentUser.id,
      cell_phone: req.body['cell_phone'],
    });
    if (contact_old !== null) {
      return res.status(400).send({
        status: false,
        error: 'Phone number must be unique!',
      });
    }
  }

  // let cleaned = ('' + cell_phone).replace(/\D/g, '')
  // let match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
  // if (match) {
  //   let intlCode = (match[1] ? '+1 ' : '')
  //   cell_phone = [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
  // }

  const contact = new Contact({
    ...req.body,
    user: currentUser.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  contact
    .save()
    .then((_contact) => {
      let detail_content = 'added contact';
      if (req.guest_loggin) {
        detail_content = ActivityHelper.assistantLog(detail_content);
      }

      const activity = new Activity({
        content: detail_content,
        contacts: _contact.id,
        user: currentUser.id,
        type: 'contacts',
        created_at: new Date(),
        updated_at: new Date(),
      });

      activity.save().then((_activity) => {
        _contact['last_activity'] = _activity.id;
        _contact.save().catch((err) => {
          console.log('err', err);
        });

        if (req.body.deal_stage) {
          const deal = new Deal({
            contacts: contact.id,
            user: currentUser.id,
            deal_stage: req.body.deal_stage,
            title: `${contact.first_name} ${contact.last_name || ''} Deal`,
          });

          deal
            .save()
            .then((_deal) => {
              let detail_content = 'added deal';
              if (req.guest_loggin) {
                detail_content = ActivityHelper.assistantLog(detail_content);
              }

              DealStage.updateOne(
                {
                  _id: req.body.deal_stage,
                },
                {
                  $push: { deals: _deal._id },
                }
              ).catch((err) => {
                console.log('error', err.message);
              });

              const activity = new Activity({
                content: detail_content,
                contacts: contact.id,
                user: currentUser.id,
                type: 'deals',
                deals: _deal.id,
              });

              activity.save().catch((err) => {
                console.log('activity save err', err.message);
              });

              Contact.updateOne(
                { _id: contact.id },
                { $set: { last_activity: activity.id } }
              ).catch((err) => {
                console.log('contact update err', err.message);
              });
            })
            .catch((err) => {
              console.log('deal create err', err.message);
            });
        }

        const myJSON = JSON.stringify(_contact);
        const data = JSON.parse(myJSON);
        data.activity = _activity;
        res.send({
          status: true,
          data,
        });
      });
    })
    .catch((err) => {
      console.log('contact save error', err.message);
      return res.status(500).send({
        status: false,
        error: 'Internal server error',
      });
    });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const data = await Contact.findOne({
    user: currentUser.id,
    _id: req.params.id,
  });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Invalid_permission',
    });
  }

  await Contact.deleteOne({ _id: req.params.id });
  await Activity.deleteMany({ contacts: req.params.id });
  await FollowUp.deleteMany({ contact: req.params.id });
  await Appointment.deleteMany({ contact: req.params.id });
  await Reminder.deleteMany({ contact: req.params.id });
  await TimeLine.deleteMany({ contact: req.params.id });
  await Text.deleteMany({ contact: req.params.id });

  res.send({
    status: true,
  });
};

const bulkRemove = async (req, res) => {
  const { currentUser } = req;
  const ids = req.body.ids;
  var deleted = 0;
  var undeleted = 0;
  ids.forEach((id) => {
    if (removeContact(currentUser.id, id)) {
      deleted++;
    } else {
      undeleted++;
    }
  });

  return res.send({
    status: true,
    data: {
      deleted,
      undeleted,
    },
  });
};

const removeContact = async (user_id, id) => {
  const data = await Contact.findOne({ user: user_id, _id: id });
  if (!data) {
    return false;
  }

  await Contact.deleteOne({ _id: id });
  await Activity.deleteMany({ contacts: id });
  await Note.deleteMany({ contact: id });
  await FollowUp.deleteMany({ contact: id });
  await Appointment.deleteMany({ contact: id });
  await Reminder.deleteMany({ contact: id });
  await TimeLine.deleteMany({ contact: id });
  await Text.deleteMany({ contact: id });
  return true;
};

const edit = async (req, res) => {
  const { currentUser } = req;
  const editData = req.body;
  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  } else {
    const contact = await Contact.findOne({
      _id: req.params.id,
    }).catch((err) => {
      console.log('err', err);
    });

    if (editData['label'] === '') {
      editData['label'] = undefined;
    }

    for (const key in editData) {
      contact[key] = editData[key];
    }

    // if (req.body.cell_phone) {
    //   // let cleaned = ('' + cell_phone).replace(/\D/g, '')
    //   // let match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/)
    //   // if (match) {
    //   //   let intlCode = (match[1] ? '+1 ' : '')
    //   //   cell_phone = [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('')
    //   // }
    //   const cell_phone = phone(req.body.cell_phone)[0];
    //   contact['cell_phone'] = cell_phone;
    // }

    let contact_old;
    if (req.body.email && req.body.email != '') {
      contact_old = await Contact.findOne({
        _id: { $ne: req.params.id },
        user: currentUser.id,
        email: req.body['email'],
      });
      if (contact_old !== null) {
        return res.status(400).send({
          status: false,
          error: 'Email must be unique!',
        });
      }
    }

    if (req.body.cell_phone) {
      contact_old = await Contact.findOne({
        _id: { $ne: req.params.id },
        user: currentUser.id,
        cell_phone: req.body['cell_phone'],
      });
      if (contact_old !== null) {
        return res.status(400).send({
          status: false,
          error: 'Phone number must be unique!',
        });
      }
    }

    if (req.body.deal_stage) {
      const deal = new Deal({
        contacts: contact.id,
        user: currentUser.id,
        deal_stage: req.body.deal_stage,
        title: `${contact.first_name} ${contact.last_name || ''} Deal`,
      });

      deal
        .save()
        .then((_deal) => {
          let detail_content = 'added deal';
          if (req.guest_loggin) {
            detail_content = ActivityHelper.assistantLog(detail_content);
          }

          DealStage.updateOne(
            {
              _id: req.body.deal_stage,
            },
            {
              $push: { deals: _deal._id },
            }
          ).catch((err) => {
            console.log('error', err.message);
          });

          const activity = new Activity({
            content: detail_content,
            contacts: contact.id,
            user: currentUser.id,
            type: 'deals',
            deals: _deal.id,
          });

          activity.save().catch((err) => {
            console.log('activity save err', err.message);
          });

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('contact update err', err.message);
          });
        })
        .catch((err) => {
          console.log('deal create err', err.message);
        });
    }

    contact
      .save()
      .then((_res) => {
        const myJSON = JSON.stringify(_res);
        const data = JSON.parse(myJSON);
        delete data.password;
        res.send({
          status: true,
          data,
        });
      })
      .catch((e) => {
        let errors;
        // if (e.errors) {
        //   errors = e.errors.map((err) => {
        //     delete err.instance;
        //     return err;
        //   });
        // }
        return res.status(500).send({
          status: false,
          error: errors || e,
        });
      });
  }
};

const bulkEditLabel = async (req, res) => {
  const { contacts } = req.body;
  let { label } = req.body;
  if (label === '') {
    label = undefined;
  }
  Contact.find({ _id: { $in: contacts } })
    .updateMany({ $set: { label } })
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Label Update Error',
      });
    });
};

const bulkUpdate = async (req, res) => {
  const { contacts, data, tags } = req.body;
  let tagUpdateQuery = {};
  if (tags.tags && tags.tags.length) {
    switch (tags.option) {
      case 2:
        tagUpdateQuery = { $push: { tags: { $each: tags.tags } } };
        break;
      case 3:
        tagUpdateQuery = { $pull: { tags: { $in: tags.tags } } };
        break;
      case 4:
        tagUpdateQuery = { tags: tags.tags };
        break;
    }
  }
  let updateQuery = {};
  if (Object.keys(data).length) {
    updateQuery = { $set: data };
  }
  if (Object.keys(tagUpdateQuery).length) {
    updateQuery = { ...updateQuery, ...tagUpdateQuery };
  }

  Contact.find({ _id: { $in: contacts } })
    .updateMany(updateQuery)
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('error', err);
      res.status(500).send({
        status: false,
        error: err.message || 'Update Error',
      });
    });
};

const importCSV = async (req, res) => {
  const file = req.file;
  const { currentUser } = req;
  let duplicate_contacts = [];
  const exceed_contacts = [];

  let count = 0;
  let max_upload_count = 0;
  const contact_info = currentUser.contact_info;
  const labels = await LabelHelper.getAll(currentUser.id);

  if (contact_info['is_limit']) {
    count = await Contact.countDocuments({ user: currentUser.id });

    max_upload_count =
      contact_info.max_count || system_settings.CONTACT_UPLOAD_LIMIT.PRO;

    if (max_upload_count <= count) {
      return res.send({
        status: false,
        error: 'Exceed upload max contacts',
      });
    }
  }

  const contact_array = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on('data', async (data) => {
      contact_array.push(data);
    })
    .on('end', () => {
      const promise_array = [];

      let add_content = 'added contact';
      let note_content = 'added note';
      if (req.guest_loggin) {
        add_content = ActivityHelper.assistantLog(add_content);
        note_content = ActivityHelper.assistantLog(note_content);
      }
      for (let i = 0; i < contact_array.length; i++) {
        const promise = new Promise(async (resolve) => {
          try {
            const data = contact_array[i];

            if (data['first_name'] === '') {
              data['first_name'] = null;
            }
            if (data['email'] === '') {
              data['email'] = null;
            }
            if (data['cell_phone'] === '') {
              data['cell_phone'] = null;
            }
            if (data['first_name'] || data['email'] || data['cell_phone']) {
              let cell_phone;
              const query = [];

              if (data['first_name'] && data['last_name']) {
                query.push({
                  user: currentUser.id,
                  first_name: data['first_name'],
                  last_name: data['last_name'],
                });
              }

              if (data['email'] && validateEmail(data['email'])) {
                query.push({
                  user: currentUser.id,
                  email: new RegExp(data['email'], 'i'),
                });
              }

              if (data['cell_phone']) {
                cell_phone = phone(data['cell_phone'])[0];
                if (cell_phone) {
                  query.push({
                    user: currentUser.id,
                    cell_phone,
                  });
                }
              }

              const _duplicate_contacts = await Contact.find({
                $or: query,
              })
                .populate('label')
                .catch((err) => {
                  console.log('contact find err', err.message);
                });

              if (_duplicate_contacts && _duplicate_contacts.length > 0) {
                duplicate_contacts =
                  duplicate_contacts.concat(_duplicate_contacts);

                duplicate_contacts.push(data);
                resolve();
                return;
              }

              if (contact_info['is_limit'] && max_upload_count <= count) {
                exceed_contacts.push(data);
                resolve();
                return;
              }
              count += 1;

              let tags = [];
              if (data['tags'] !== '' && typeof data['tags'] !== 'undefined') {
                tags = data['tags'].split(/,\s|\s,|,|\s/);
              }
              let label;

              if (
                data['label'] !== '' &&
                typeof data['label'] !== 'undefined'
              ) {
                for (let i = 0; i < labels.length; i++) {
                  if (
                    capitalize(labels[i].name) === capitalize(data['label'])
                  ) {
                    label = labels[i]._id;
                    break;
                  }
                }

                if (!label) {
                  const new_label = new Label({
                    user: currentUser.id,
                    name: data['label'],
                  });

                  new_label.save().catch((err) => {
                    console.log('new label save err', err.message);
                  });
                  label = new_label.id;
                  labels.push({
                    _id: label,
                    name: data['label'],
                  });
                }
              }

              delete data.label;
              delete data.tags;

              const contact = new Contact({
                ...data,
                tags,
                label,
                cell_phone,
                user: currentUser.id,
              });

              contact
                .save()
                .then((_contact) => {
                  const activity = new Activity({
                    content: add_content,
                    contacts: _contact.id,
                    user: currentUser.id,
                    type: 'contacts',
                  });
                  activity
                    .save()
                    .then((_activity) => {
                      Contact.updateOne(
                        { _id: _contact.id },
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

                  if (data['notes'] && data['notes'].length > 0) {
                    const notes = JSON.parse(data['notes']);
                    // const notes = data['notes'];
                    for (let i = 0; i < notes.length; i++) {
                      // const { content, title } = notes[i];
                      const content = notes[i];
                      const note = new Note({
                        content,
                        contact: _contact.id,
                        user: currentUser.id,
                      });

                      note.save().catch((err) => {
                        console.log(
                          'contact import note save err',
                          err.message
                        );
                      });

                      /**
                      note.save().then((_note) => {
                        const _activity = new Activity({
                          content: note_content,
                          contacts: _contact.id,
                          user: currentUser.id,
                          type: 'notes',
                          notes: _note.id,
                        });

                        _activity
                          .save()
                          .then((__activity) => {
                            Contact.updateOne(
                              { _id: _contact.id },
                              { $set: { last_activity: __activity.id } }
                            ).catch((err) => {
                              console.log('err', err);
                            });
                          })
                          .catch((err) => {
                            console.log('error', err);
                          });
                      });
                      */
                    }
                  }
                  resolve();
                })
                .catch((err) => {
                  console.log('contact save err', err);
                });
            } else {
              resolve();
            }
          } catch (err) {
            console.log('contact import csv internal err', err);
          }
        });
        promise_array.push(promise);
      }

      Promise.all(promise_array).then(() => {
        return res.send({
          status: true,
          exceed_contacts,
          duplicate_contacts,
        });
      });
    });
};

const overwriteCSV = async (req, res) => {
  const file = req.file;
  const { currentUser } = req;
  const failure = [];

  const contact_array = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on('data', async (data) => {
      contact_array.push(data);
    })
    .on('end', async () => {
      const promise_array = [];
      for (let i = 0; i < contact_array.length; i++) {
        const email = contact_array[i]['email'];
        const data = contact_array[i];
        let tags = [];
        if (data['tags'] !== '' && typeof data['tags'] !== 'undefined') {
          tags = data['tags'].split(/,\s|\s,|,|\s/);
        }
        delete data.tags;
        for (const key in data) {
          if (data[key] === '' && typeof data[key] === 'undefined') {
            delete data[key];
          }
        }
        if (email) {
          await Contact.updateOne(
            { email },
            { $set: data, $push: { tags: { $each: tags } } }
          ).catch((err) => {
            console.log('err', err);
          });
        }
      }
      return res.send({
        status: true,
      });
    });
};

const exportCSV = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;

  const data = [];
  for (let i = 0; i < contacts.length; i++) {
    const _data = {
      contact_id: contacts[i],
      note: [],
    };
    const _note = await Note.find({
      user: currentUser.id,
      contact: contacts[i],
    });
    const _contact = await Contact.findOne({ _id: contacts[i] }).populate({
      path: 'label',
      select: 'name',
    });

    if (_note.length !== 0) {
      _data['note'] = _note;
    }
    _data['contact'] = _contact;
    data.push(_data);
  }

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Note doesn`t exist',
    });
  }

  res.send({
    status: true,
    data,
  });
};

const search = async (req, res) => {
  const { currentUser } = req;
  const searchStr = req.body.search;
  const search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
  const phoneSearch = searchStr.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
  let contacts = [];
  if (search.split(' ').length > 1) {
    contacts = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0], $options: 'i' },
          last_name: { $regex: search.split(' ')[1], $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search.split(' ')[0], $options: 'i' },
          last_name: { $regex: search.split(' ')[1], $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          first_name: { $regex: search, $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search, $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          last_name: { $regex: search, $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search, $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          user: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          shared_members: currentUser.id,
        },
      ],
    })
      .populate('last_activity')
      .sort({ first_name: 1 });
  } else {
    contacts = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          user: currentUser.id,
        },
        {
          cell_phone: {
            $regex: '.*' + phoneSearch + '.*',
            $options: 'i',
          },
          shared_members: currentUser.id,
        },
      ],
    })
      .populate('last_activity')
      .sort({ first_name: 1 });
  }

  const count = await Contact.countDocuments({ user: currentUser.id });
  return res.send({
    status: true,
    data: {
      contacts,
      search,
      total: count,
    },
  });
};

const searchEasy = async (req, res) => {
  const { currentUser } = req;
  const search = req.body.search;
  const skip = req.body.skip || 0;
  let data = [];
  if (!search.split(' ')[1]) {
    data = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          cell_phone: {
            $regex:
              '.*' +
              search
                .split('')
                .filter((char) => /^[^\(\)\- ]$/.test(char))
                .join('') +
              '.*',
            $options: 'i',
          },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          email: { $regex: '.*' + search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          last_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          cell_phone: {
            $regex:
              '.*' +
              search
                .split('')
                .filter((char) => /^[^\(\)\- ]$/.test(char))
                .join('') +
              '.*',
            $options: 'i',
          },
          shared_members: currentUser.id,
        },
      ],
    })
      .sort({ first_name: 1 })
      .skip(skip)
      .limit(8)
      .catch((err) => {
        console.log('err', err);
      });
  } else {
    data = await Contact.find({
      $or: [
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          last_name: { $regex: search.split(' ')[1] + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          last_name: { $regex: search + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          cell_phone: { $regex: search + '.*', $options: 'i' },
          user: currentUser.id,
        },
        {
          first_name: { $regex: search.split(' ')[0] + '.*', $options: 'i' },
          last_name: { $regex: search.split(' ')[1] + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          first_name: { $regex: search + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          last_name: { $regex: search + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
        {
          cell_phone: { $regex: search + '.*', $options: 'i' },
          shared_members: currentUser.id,
        },
      ],
    })
      .sort({ first_name: 1 })
      .skip(skip)
      .limit(8)
      .catch((err) => {
        console.log('err', err);
      });
  }
  return res.send({
    status: true,
    data,
  });
};

const filter = async (req, res) => {
  const { currentUser } = req;
  const query = req.body;
  let data = [];
  data = await Contact.find({ ...query, user: currentUser.id });
  return res.send({
    status: true,
    data,
  });
};

const getById = async (req, res) => {
  const { currentUser } = req;
  const _contact = await Contact.findOne({
    user: currentUser.id,
    _id: req.params.id,
  });

  if (!_contact) {
    return res.status(400).json({
      status: false,
      error: 'Contact doesn`t exist',
    });
  }

  res.send({
    status: true,
    data: _contact,
  });
};

const getByIds = async (req, res) => {
  const { ids } = req.body;
  const _contacts = await Contact.find({
    _id: { $in: ids },
  });

  res.send({
    status: true,
    data: _contacts,
  });
};

const leadContact = async (req, res) => {
  const { user, first_name, email, cell_phone, video, pdf, image } = req.body;
  const fieldData = { ...req.body };
  delete fieldData['user'];
  delete fieldData['first_name'];
  delete fieldData['email'];
  delete fieldData['cell_phone'];
  delete fieldData['video'];
  delete fieldData['pdf'];
  delete fieldData['image'];
  let additional_field;
  if (Object.keys(fieldData).length) {
    additional_field = { ...fieldData };
  }

  if (!email && !cell_phone) {
    return res.status(400).send({
      status: false,
      error: 'Please input email address or cell_phone',
    });
  }

  let _exist;
  if (email) {
    await Contact.findOne({
      email,
      user,
    }).catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
  }

  if (!_exist && cell_phone) {
    _exist = await Contact.findOne({
      cell_phone,
      user,
    }).catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
  }

  if (_exist) {
    let _activity;
    if (video) {
      _activity = new Activity({
        content: 'LEAD CAPTURE - watched video',
        contacts: _exist.id,
        user,
        type: 'videos',
        videos: video,
      });
    } else if (pdf) {
      _activity = new Activity({
        content: 'LEAD CAPTURE - reviewed pdf',
        contacts: _exist.id,
        user,
        type: 'pdfs',
        pdfs: pdf,
      });
    } else if (image) {
      _activity = new Activity({
        content: 'LEAD CAPTURE - reviewed image',
        contacts: _exist.id,
        user,
        type: 'images',
        images: image,
      });
    }

    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });

    Contact.updateOne(
      { _id: _exist.id },
      { $set: { last_activity: activity.id, additional_field } }
    ).catch((err) => {
      console.log('contact update err', err.message);
    });

    return res.json({
      status: true,
      data: {
        contact: _exist.id,
        activity: activity.id,
      },
    });
  } else {
    if (email) {
      const verified = await verifyEmail(email).catch((err) => {
        console.log('email verify err', err.message);
      });

      console.log('verified', verified);

      if (!verified) {
        return res.status(400).json({
          status: false,
          error: 'Invalid Email',
        });
      }
    }
    const e164Phone = phone(cell_phone)[0];

    if (cell_phone && !e164Phone) {
      return res.status(400).json({
        status: false,
        error: 'Invalid Phone Number',
      });
    }

    const label = system_settings.LEAD;
    const _contact = new Contact({
      first_name,
      email,
      cell_phone: e164Phone,
      label,
      tags: ['leadcapture'],
      user,
      additional_field,
    });

    const time_zone = user.time_zone_info
      ? JSON.parse(user.time_zone_info).tz_name
      : system_settings.TIME_ZONE;
    const created_at = moment().tz(time_zone).format('h:mm a');

    if (video) {
      _contact
        .save()
        .then(async (contact) => {
          const _video = await Video.findOne({ _id: video }).catch((err) => {
            console.log('video found err', err.message);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('current user found err', err.message);
          });
          const garbage = await Garbage.findOne({ user }).catch((err) => {
            console.log('garbage found err', err.message);
          });

          const _activity = new Activity({
            content: 'LEAD CAPTURE - watched video',
            contacts: contact.id,
            user: currentUser.id,
            type: 'videos',
            videos: video,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          const email_notification = garbage['email_notification'];

          if (email_notification['lead_capture']) {
            sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
            const msg = {
              to: currentUser.email,
              from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
              templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
              dynamic_template_data: {
                subject: mail_contents.NOTIFICATION_WATCHED_VIDEO.SUBJECT,
                first_name,
                phone_number: `<a href="tel:${cell_phone}">${cell_phone}</a>`,
                email: `<a href="mailto:${email}">${email}</a>`,
                activity:
                  first_name +
                  ' watched lead capture video - <b>' +
                  _video.title +
                  '</b> at ' +
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
          }

          const desktop_notification = garbage['desktop_notification'];
          if (desktop_notification['lead_capture']) {
            webpush.setVapidDetails(
              'mailto:support@crmgrow.com',
              api.VAPID.PUBLIC_VAPID_KEY,
              api.VAPID.PRIVATE_VAPID_KEY
            );

            const subscription = JSON.parse(
              currentUser.desktop_notification_subscription
            );
            const title = contact.first_name + ' watched lead capture video';
            // const created_at =
            //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
            //   ' at ' +
            //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
            const body =
              contact.first_name +
              ' - ' +
              contact.email +
              ' watched lead capture video: ' +
              _video.title +
              ' on ' +
              created_at;
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
          if (text_notification['lead_capture']) {
            const e164Phone = phone(currentUser.cell_phone)[0];

            if (!e164Phone) {
              const error = {
                error: 'Invalid Phone Number',
              };

              throw error; // Invalid phone number
            } else {
              let fromNumber = currentUser['proxy_number'];
              if (!fromNumber) {
                fromNumber = api.TWILIO.TWILIO_NUMBER;
              }

              const title =
                contact.first_name +
                '\n' +
                contact.email +
                '\n' +
                contact.cell_phone +
                '\n' +
                '\n' +
                'watched lead capture video: ' +
                '\n' +
                _video.title +
                '\n';
              // const created_at =
              //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
              //   ' at ' +
              //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
              const time = ' on ' + created_at + '\n ';
              const contact_link = urls.CONTACT_PAGE_URL + contact.id;
              twilio.messages
                .create({
                  from: fromNumber,
                  body: title + '\n' + time + contact_link,
                  to: e164Phone,
                })
                .catch((err) => {
                  console.log('send sms err: ', err);
                });
            }
          }

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('contact update err', err.message);
          });

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    } else if (pdf) {
      _contact
        .save()
        .then(async (contact) => {
          const _pdf = await PDF.findOne({ _id: pdf }).catch((err) => {
            console.log('err', err);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('err', err);
          });
          const garbage = await Garbage.findOne({ user }).catch((err) => {
            console.log('err', err);
          });

          const _activity = new Activity({
            content: 'LEAD CAPTURE - reviewed pdf',
            contacts: contact.id,
            user: currentUser.id,
            type: 'pdfs',
            pdfs: pdf,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          const email_notification = garbage['email_notification'];

          if (email_notification['lead_capture']) {
            sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
            const msg = {
              to: currentUser.email,
              from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
              templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
              dynamic_template_data: {
                subject: mail_contents.NOTIFICATION_REVIEWED_PDF.SUBJECT,
                first_name,
                phone_number: `<a href="tel:${cell_phone}">${cell_phone}</a>`,
                email: `<a href="mailto:${email}">${email}</a>`,
                activity:
                  first_name +
                  ' Viewed lead capture pdf - <b>' +
                  _pdf.title +
                  '</b>at ' +
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
          }

          const desktop_notification = garbage['desktop_notification'];
          if (desktop_notification['lead_capture']) {
            webpush.setVapidDetails(
              'mailto:support@crmgrow.com',
              api.VAPID.PUBLIC_VAPID_KEY,
              api.VAPID.PRIVATE_VAPID_KEY
            );

            const subscription = JSON.parse(
              currentUser.desktop_notification_subscription
            );
            const title = contact.first_name + ' watched lead capture pdf';
            // const created_at =
            //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
            //   ' at ' +
            //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
            const body =
              contact.first_name +
              ' - ' +
              contact.email +
              ' watched lead capture pdf: ' +
              _pdf.title +
              ' on ' +
              created_at;
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
          if (text_notification['lead_capture']) {
            const e164Phone = phone(currentUser.cell_phone)[0];

            if (!e164Phone) {
              const error = {
                error: 'Invalid Phone Number',
              };

              throw error; // Invalid phone number
            } else {
              let fromNumber = currentUser['proxy_number'];
              if (!fromNumber) {
                fromNumber = api.TWILIO.TWILIO_NUMBER;
              }

              const title =
                contact.first_name +
                '\n' +
                contact.email +
                '\n' +
                contact.cell_phone +
                '\n' +
                '\n' +
                'watched lead capture video: ' +
                '\n' +
                _pdf.title +
                '\n';
              // const created_at =
              //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
              //   ' at ' +
              //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
              const time = ' on ' + created_at + '\n ';
              const contact_link = urls.CONTACT_PAGE_URL + contact.id;
              twilio.messages
                .create({
                  from: fromNumber,
                  body: title + '\n' + time + contact_link,
                  to: e164Phone,
                })
                .catch((err) => {
                  console.log('send sms err: ', err);
                });
            }
          }

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message,
          });
        });
    } else if (image) {
      _contact
        .save()
        .then(async (contact) => {
          const _image = await Image.findOne({ _id: image }).catch((err) => {
            console.log('err', err);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('err', err);
          });
          const garbage = await Garbage.findOne({ user }).catch((err) => {
            console.log('err', err);
          });

          const _activity = new Activity({
            content: 'LEAD CAPTURE - reviewed image',
            contacts: contact.id,
            user: currentUser.id,
            type: 'images',
            images: image,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          // const created_at = moment()
          //   .utcOffset(currentUser.time_zone)
          //   .format('h:mm: a');
          const email_notification = garbage['email_notification'];

          if (email_notification['lead_capture']) {
            sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
            const msg = {
              to: currentUser.email,
              from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
              templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
              dynamic_template_data: {
                subject: mail_contents.NOTIFICATION_REVIEWED_IMAGE.SUBJECT,
                first_name,
                phone_number: `<a href="tel:${cell_phone}">${cell_phone}</a>`,
                email: `<a href="mailto:${email}">${email}</a>`,
                activity:
                  first_name +
                  ' Viewed lead capture image - <b>' +
                  _image.title +
                  '</b>at ' +
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
          }

          const desktop_notification = garbage['desktop_notification'];
          if (desktop_notification['lead_capture']) {
            webpush.setVapidDetails(
              'mailto:support@crmgrow.com',
              api.VAPID.PUBLIC_VAPID_KEY,
              api.VAPID.PRIVATE_VAPID_KEY
            );

            const subscription = JSON.parse(
              currentUser.desktop_notification_subscription
            );
            const title = contact.first_name + ' watched lead capture image';
            // const created_at =
            //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
            //   ' at ' +
            //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
            const body =
              contact.first_name +
              ' - ' +
              contact.email +
              ' watched lead capture image: ' +
              _image.title +
              ' on ' +
              created_at;
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
          if (text_notification['lead_capture']) {
            const e164Phone = phone(currentUser.cell_phone)[0];

            if (!e164Phone) {
              const error = {
                error: 'Invalid Phone Number',
              };

              throw error; // Invalid phone number
            } else {
              let fromNumber = currentUser['proxy_number'];
              if (!fromNumber) {
                fromNumber = api.TWILIO.TWILIO_NUMBER;
              }

              const title =
                contact.first_name +
                '\n' +
                contact.email +
                '\n' +
                contact.cell_phone +
                '\n' +
                '\n' +
                'watched lead capture video: ' +
                '\n' +
                _image.title +
                '\n';
              // const created_at =
              //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
              //   ' at ' +
              //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
              const time = ' on ' + created_at + '\n ';
              const contact_link = urls.CONTACT_PAGE_URL + contact.id;
              twilio.messages
                .create({
                  from: fromNumber,
                  body: title + '\n' + time + contact_link,
                  to: e164Phone,
                })
                .catch((err) => {
                  console.log('send sms err: ', err);
                });
            }
          }

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    }
  }
};

const isArray = function (a) {
  return !!a && a.constructor === Array;
};

const advanceSearch = async (req, res) => {
  const { currentUser } = req;

  const {
    searchStr,
    recruitingStageCondition,
    labelCondition,
    activityCondition,
    activityStart,
    activityEnd,
    countryCondition,
    regionCondition,
    cityCondition,
    zipcodeCondition,
    tagsCondition,
    stagesCondition,
    brokerageCondition,
    lastMaterial,
    materialCondition,
    sourceCondition,
    includeLabel,
    includeStage,
    includeSource,
    includeTag,
    includeLastActivity,
    includeBrokerage,
    teamOptions,
  } = req.body;
  let { includeFollowUps } = req.body;
  if (includeFollowUps === null || includeFollowUps === 'undefined') {
    includeFollowUps = true;
  }

  const teamQuery = { $or: [] };
  let teamContacts = [];
  const teamContactIds = [];
  if (Object.keys(teamOptions).length) {
    for (const team_id in teamOptions) {
      const teamOption = teamOptions[team_id];
      if (teamOption.flag === 1) {
        teamQuery['$or'].push({
          shared_team: [team_id],
          $or: [
            { user: currentUser._id },
            { shared_members: [currentUser._id] },
          ],
        });
        continue;
      } else {
        const shareWithQuery = {};
        const shareByQuery = {};
        const evTeamQuery = { $or: [] };
        if (teamOption.share_with.flag !== -1) {
          shareWithQuery['user'] = currentUser._id;
          shareWithQuery['shared_team'] = [team_id];
          if (!teamOption.share_with.flag) {
            shareWithQuery['shared_members'] = teamOption.share_with.members;
          }
          evTeamQuery['$or'].push(shareWithQuery);
        }
        if (teamOption.share_by.flag !== -1) {
          shareByQuery['shared_members'] = [currentUser._id];
          shareByQuery['shared_team'] = [team_id];
          if (!teamOption.share_by.flag) {
            shareByQuery['user'] = { $in: teamOption.share_with.members };
          }
          evTeamQuery['$or'].push(shareByQuery);
        }
        teamQuery['$or'].push(evTeamQuery);
      }
    }
    teamContacts = await Contact.find(teamQuery);
    teamContacts.forEach((e) => {
      teamContactIds.push(e._id);
    });
  }

  // Material Check
  let watchedVideoContacts = [];
  let watchedPdfContacts = [];
  let watchedImageContacts = [];
  let notWatchedVideoContacts = [];
  let notWatchedPdfContacts = [];
  let notWatchedImageContacts = [];
  let notSentVideoContacts = [];
  let notSentPdfContacts = [];
  let notSentImageContacts = [];
  let sentVideoContacts = [];
  let sentPdfContacts = [];
  let sentImageContacts = [];

  const excludeMaterialContacts = [];
  const materialContacts = [];
  var query = { $and: [{ user: mongoose.Types.ObjectId(currentUser.id) }] };
  if (!Object.keys(teamOptions).length) {
    if (materialCondition['watched_video']['flag']) {
      let query = [];
      if (materialCondition['watched_video']['material']) {
        query = [
          {
            type: 'videos',
            videos: mongoose.Types.ObjectId(
              materialCondition['watched_video']['material']
            ),
          },
          {
            type: 'video_trackers',
            videos: mongoose.Types.ObjectId(
              materialCondition['watched_video']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'videos' }, { type: 'video_trackers' }];
      }
      watchedVideoContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $or: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts', type: '$type' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
            types: { $addToSet: { action: '$_id.type' } },
          },
        },
        {
          $match: {
            types: { action: 'video_trackers' },
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }
    if (materialCondition['watched_pdf']['flag']) {
      let query = [];
      if (materialCondition['watched_pdf']['material']) {
        query = [
          {
            type: 'pdfs',
            pdfs: mongoose.Types.ObjectId(
              materialCondition['watched_pdf']['material']
            ),
          },
          {
            type: 'pdf_trackers',
            pdfs: mongoose.Types.ObjectId(
              materialCondition['watched_pdf']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'pdfs' }, { type: 'pdf_trackers' }];
      }
      watchedPdfContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $or: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts', type: '$type' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
            types: { $addToSet: { action: '$_id.type' } },
          },
        },
        {
          $match: {
            types: { action: 'pdf_trackers' },
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }
    if (materialCondition['watched_image']['flag']) {
      let query = [];
      if (materialCondition['watched_image']['material']) {
        query = [
          {
            type: 'images',
            images: mongoose.Types.ObjectId(
              materialCondition['watched_image']['material']
            ),
          },
          {
            type: 'image_trackers',
            images: mongoose.Types.ObjectId(
              materialCondition['watched_image']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'images' }, { type: 'image_trackers' }];
      }
      watchedImageContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $or: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts', type: '$type' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
            types: { $addToSet: { action: '$_id.type' } },
          },
        },
        {
          $match: {
            types: { action: 'image_trackers' },
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }

    if (materialCondition['not_watched_video']['flag']) {
      let query = [];
      if (materialCondition['not_watched_video']['material']) {
        query = [
          {
            type: 'videos',
            videos: mongoose.Types.ObjectId(
              materialCondition['not_watched_video']['material']
            ),
          },
          {
            type: 'video_trackers',
            videos: mongoose.Types.ObjectId(
              materialCondition['not_watched_video']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'videos' }, { type: 'video_trackers' }];
      }
      notWatchedVideoContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $or: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts', type: '$type' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
            types: { $addToSet: { action: '$_id.type' } },
          },
        },
        {
          $match: {
            $nor: [{ types: { action: 'video_trackers' } }],
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }
    if (materialCondition['not_watched_pdf']['flag']) {
      let query = [];
      if (materialCondition['not_watched_pdf']['material']) {
        query = [
          {
            type: 'pdfs',
            pdfs: mongoose.Types.ObjectId(
              materialCondition['not_watched_pdf']['material']
            ),
          },
          {
            type: 'pdf_trackers',
            pdfs: mongoose.Types.ObjectId(
              materialCondition['not_watched_pdf']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'pdfs' }, { type: 'pdf_trackers' }];
      }
      notWatchedPdfContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $or: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts', type: '$type' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
            types: { $addToSet: { action: '$_id.type' } },
          },
        },
        {
          $match: {
            $nor: [{ types: { action: 'pdf_trackers' } }],
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }
    if (materialCondition['not_watched_image']['flag']) {
      let query = [];
      if (materialCondition['not_watched_image']['material']) {
        query = [
          {
            type: 'images',
            images: mongoose.Types.ObjectId(
              materialCondition['not_watched_image']['material']
            ),
          },
          {
            type: 'image_trackers',
            images: mongoose.Types.ObjectId(
              materialCondition['not_watched_image']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'images' }, { type: 'image_trackers' }];
      }
      notWatchedImageContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $or: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts', type: '$type' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
            types: { $addToSet: { action: '$_id.type' } },
          },
        },
        {
          $match: {
            $nor: [{ types: { action: 'image_trackers' } }],
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }

    if (materialCondition['not_sent_video']['flag']) {
      let query = [];
      if (materialCondition['not_sent_video']['material']) {
        query = [
          {
            type: 'videos',
            videos: mongoose.Types.ObjectId(
              materialCondition['not_sent_video']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'videos' }];
      }
      notSentVideoContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $and: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
      notSentVideoContacts.forEach((e) => {
        if (excludeMaterialContacts.indexOf(e._id) === -1) {
          e._id && excludeMaterialContacts.push(mongoose.Types.ObjectId(e._id));
        }
      });
    }
    if (materialCondition['not_sent_pdf']['flag']) {
      let query = [];
      if (materialCondition['not_sent_pdf']['material']) {
        query = [
          {
            type: 'pdfs',
            pdfs: mongoose.Types.ObjectId(
              materialCondition['not_sent_pdf']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'pdfs' }];
      }
      notSentPdfContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $and: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
      notSentPdfContacts.forEach((e) => {
        if (excludeMaterialContacts.indexOf(e._id) === -1) {
          e._id && excludeMaterialContacts.push(mongoose.Types.ObjectId(e._id));
        }
      });
    }
    if (materialCondition['not_sent_image']['flag']) {
      let query = [];
      if (materialCondition['not_sent_image']['material']) {
        query = [
          {
            type: 'images',
            images: mongoose.Types.ObjectId(
              materialCondition['not_sent_image']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'images' }];
      }
      notSentImageContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $and: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
      notSentImageContacts.forEach((e) => {
        if (excludeMaterialContacts.indexOf(e._id) === -1) {
          e._id && excludeMaterialContacts.push(mongoose.Types.ObjectId(e._id));
        }
      });
    }
    if (materialCondition['sent_video']['flag']) {
      let query = [];
      if (materialCondition['sent_video']['material']) {
        query = [
          {
            type: 'videos',
            videos: mongoose.Types.ObjectId(
              materialCondition['sent_video']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'videos' }];
      }
      sentVideoContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $and: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }
    if (materialCondition['sent_pdf']['flag']) {
      let query = [];
      if (materialCondition['sent_pdf']['material']) {
        query = [
          {
            type: 'pdfs',
            pdfs: mongoose.Types.ObjectId(
              materialCondition['sent_pdf']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'pdfs' }];
      }
      sentPdfContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $and: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }
    if (materialCondition['sent_image']['flag']) {
      let query = [];
      if (materialCondition['sent_image']['material']) {
        query = [
          {
            type: 'images',
            images: mongoose.Types.ObjectId(
              materialCondition['sent_image']['material']
            ),
          },
        ];
      } else {
        query = [{ type: 'images' }];
      }
      sentImageContacts = await Activity.aggregate([
        {
          $match: {
            $and: [
              { user: mongoose.Types.ObjectId(currentUser._id) },
              { $and: query },
            ],
          },
        },
        { $unwind: '$contacts' },
        {
          $group: {
            _id: { contact: '$contacts' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.contact',
          },
        },
        {
          $project: { _id: 1 },
        },
      ]);
    }
    watchedVideoContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    watchedPdfContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    watchedImageContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    notWatchedVideoContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    notWatchedPdfContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    notWatchedImageContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    sentVideoContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    sentPdfContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });
    sentImageContacts.forEach((e) => {
      e._id && materialContacts.push(mongoose.Types.ObjectId(e._id));
    });

    const includeMaterialCondition =
      materialCondition['not_watched_pdf']['flag'] ||
      materialCondition['not_watched_video']['flag'] ||
      materialCondition['watched_pdf']['flag'] ||
      materialCondition['watched_video']['flag'] ||
      materialCondition['watched_image']['flag'] ||
      materialCondition['not_watched_image']['flag'] ||
      materialCondition['sent_video']['flag'] ||
      materialCondition['sent_pdf']['flag'] ||
      materialCondition['sent_image']['flag'];
    const excludeMaterialCondition =
      materialCondition['not_sent_video']['flag'] ||
      materialCondition['not_sent_pdf']['flag'] ||
      materialCondition['not_sent_image']['flag'];

    if (materialContacts.length) {
      // Exclude Contacts from material contacts
      let materialQuery = { _id: { $in: materialContacts } };
      if (excludeMaterialCondition) {
        if (excludeMaterialContacts.length) {
          materialQuery = {
            $or: [
              { _id: { $in: materialContacts } },
              { _id: { $nin: excludeMaterialContacts } },
            ],
          };
        }
      }
      query['$and'].push(materialQuery);
    } else {
      if (includeMaterialCondition) {
        if (excludeMaterialContacts.length) {
          query['$and'].push({ _id: { $nin: excludeMaterialContacts } });
        } else if (!excludeMaterialCondition) {
          return res.send({
            status: true,
            data: [],
          });
        }
      } else {
        if (excludeMaterialContacts) {
          query['$and'].push({ _id: { $nin: excludeMaterialContacts } });
        }
      }
    }
  } else {
    query = { $and: [{ _id: { $in: teamContactIds } }] };
  }

  if (searchStr) {
    var strQuery = {};
    var search = searchStr.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
    var phoneSearchStr = searchStr.replace(/[.*+\-?^${}()|[\]\\\s]/g, '');
    if (search.split(' ').length > 1) {
      const firstStr = search.split(' ')[0];
      const secondStr = search.split(' ')[1];
      strQuery = {
        $or: [
          {
            first_name: { $regex: '.*' + firstStr, $options: 'i' },
            last_name: { $regex: secondStr + '.*', $options: 'i' },
          },
          { first_name: { $regex: '.*' + searchStr + '.*', $options: 'i' } },
          { last_name: { $regex: '.*' + searchStr + '.*', $options: 'i' } },
          {
            cell_phone: { $regex: '.*' + phoneSearchStr + '.*', $options: 'i' },
          },
        ],
      };
    } else {
      strQuery = {
        $or: [
          { first_name: { $regex: '.*' + searchStr + '.*', $options: 'i' } },
          { email: { $regex: '.*' + searchStr + '.*', $options: 'i' } },
          { last_name: { $regex: '.*' + searchStr + '.*', $options: 'i' } },
          {
            cell_phone: { $regex: '.*' + phoneSearchStr + '.*', $options: 'i' },
          },
        ],
      };
    }
    query['$and'].push(strQuery);
  }

  if (recruitingStageCondition && recruitingStageCondition.length) {
    if (recruitingStageCondition.indexOf(false) !== -1) {
      const stageQuery = {
        $or: [
          { recruiting_stage: { $in: recruitingStageCondition } },
          { recruiting_stage: '' },
          { recruiting_stage: undefined },
        ],
      };
      query['$and'].push(stageQuery);
    } else {
      var stageQuery = {};
      if (includeStage) {
        stageQuery = { recruiting_stage: { $in: recruitingStageCondition } };
      } else {
        stageQuery = { recruiting_stage: { $nin: recruitingStageCondition } };
      }
      query['$and'].push(stageQuery);
    }
  }
  if (sourceCondition && sourceCondition.length) {
    if (sourceCondition.indexOf(false) !== -1) {
      const sourceQuery = {
        $or: [
          { source: { $in: sourceCondition } },
          { source: '' },
          { source: undefined },
        ],
      };
      query['$and'].push(sourceQuery);
    } else {
      var sourceQuery = {};
      if (includeSource) {
        sourceQuery = { source: { $in: sourceCondition } };
      } else {
        sourceQuery = { source: { $nin: sourceCondition } };
      }
      query['$and'].push(sourceQuery);
    }
  }
  if (labelCondition && labelCondition.length) {
    var labelQuery;
    if (includeLabel) {
      labelQuery = { label: { $in: labelCondition } };
    } else {
      labelQuery = { label: { $nin: labelCondition } };
    }

    labelQuery = query['$and'].push(labelQuery);
  }
  if (tagsCondition && tagsCondition.length) {
    if (tagsCondition.indexOf(false) !== -1) {
      tagsCondition.splice(tagsCondition.indexOf(false), 1);
      const tagsQuery = {
        $or: [
          { tags: { $elemMatch: { $in: tagsCondition } } },
          { tags: [] },
          { tags: undefined },
        ],
      };
      query['$and'].push(tagsQuery);
    } else {
      var tagsQuery;
      if (includeTag) {
        const index = tagsCondition.indexOf(-1);
        console.log(index);
        if (index > -1) {
          // if it contain 'No tags'
          tagsQuery = {
            $or: [{ tags: [] }, { tags: undefined }],
          };
          // splice 'No tags' field.
          tagsCondition.splice(index, 1);
          if (tagsCondition.length > 0) {
            tagsQuery = {
              $or: [
                { tags: { $elemMatch: { $in: tagsCondition } } },
                { tags: [] },
                { tags: undefined },
              ],
            };
          }
        } else {
          tagsQuery = { tags: { $elemMatch: { $in: tagsCondition } } };
        }
      } else {
        tagsQuery = {
          $or: [
            { tags: { $not: { $in: tagsCondition } } },
            { tags: [] },
            { tags: undefined },
          ],
        };
      }
      query['$and'].push(tagsQuery);
    }
  }
  if (brokerageCondition && brokerageCondition.length) {
    if (brokerageCondition.indexOf(false) !== -1) {
      const brokerageQuery = {
        $or: [
          { brokerage: { $in: brokerageCondition } },
          { brokerage: '' },
          { brokerage: undefined },
        ],
      };
      query['$and'].push(brokerageQuery);
    } else {
      var brokerageQuery;
      if (includeBrokerage) {
        brokerageQuery = { brokerage: { $in: brokerageCondition } };
      } else {
        brokerageQuery = { brokerage: { $nin: brokerageCondition } };
      }

      query['$and'].push(brokerageQuery);
    }
  }
  if (countryCondition) {
    var countryQuery = { country: countryCondition };
    query['$and'].push(countryQuery);
  }
  if (regionCondition && regionCondition.length) {
    var regionQuery = { state: { $in: regionCondition } };
    query['$and'].push(regionQuery);
  }
  if (cityCondition && cityCondition.length) {
    var cityQuery = { city: { $in: cityCondition } };
    query['$and'].push(cityQuery);
  }
  if (zipcodeCondition) {
    var zipQuery = { zip: { $regex: '.*' + zipcodeCondition + '.*' } };
    query['$and'].push(zipQuery);
  }

  // Activity Time Query
  var contacts = await Contact.find(query)
    .populate({ path: 'last_activity' })
    .sort({ first_name: 1 })
    .catch((err) => {
      console.log('err', err);
    });

  let results = [];
  const resultContactIds = [];
  if (
    (activityCondition && activityCondition.length) ||
    activityStart ||
    activityEnd ||
    lastMaterial['send_video']['flag'] ||
    lastMaterial['send_pdf']['flag'] ||
    lastMaterial['send_image']['flag'] ||
    lastMaterial['watched_video']['flag'] ||
    lastMaterial['watched_pdf']['flag'] ||
    lastMaterial['watched_image']['flag']
  ) {
    await asyncForEach(contacts, async (e) => {
      const activity = e.last_activity;
      if (!activity) {
        return;
      }
      if (await checkFollowUpCondition(includeFollowUps, e, currentUser)) {
        return;
      }
      if (activityStart || activityEnd) {
        if (activityStart) {
          if (new Date(activity.created_at) < new Date(activityStart)) {
            return;
          }
        }
        if (activityEnd) {
          if (new Date(activity.created_at) > new Date(activityEnd)) {
            return;
          }
        }
        if (
          !(
            lastMaterial['send_video']['flag'] ||
            lastMaterial['send_pdf']['flag'] ||
            lastMaterial['send_image']['flag'] ||
            lastMaterial['watched_video']['flag'] ||
            lastMaterial['watched_pdf']['flag'] ||
            lastMaterial['watched_image']['flag']
          ) &&
          !activityCondition.length
        ) {
          results.push(e);
          resultContactIds.push(e._id);
          return;
        }
      }
      if (lastMaterial['send_video']['flag']) {
        if (lastMaterial['send_video']['material']) {
          if (
            activity.type === 'videos' &&
            activity.videos === lastMaterial['send_video']['material']
          ) {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        } else {
          if (activity.type === 'videos') {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        }
      }
      if (lastMaterial['send_pdf']['flag']) {
        if (lastMaterial['send_pdf']['material']) {
          if (
            activity.type === 'pdfs' &&
            activity.pdfs === lastMaterial['send_pdf']['material']
          ) {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        } else {
          if (activity.type === 'pdfs') {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        }
      }
      if (lastMaterial['send_image']['flag']) {
        if (lastMaterial['send_image']['material']) {
          if (
            activity.type === 'images' &&
            activity.images === lastMaterial['send_image']['material']
          ) {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        } else {
          if (activity.type === 'images') {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        }
      }
      if (lastMaterial['watched_video']['flag']) {
        if (lastMaterial['watched_video']['material']) {
          if (
            activity.type === 'video_trackers' &&
            activity.videos === lastMaterial['watched_video']['material']
          ) {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        } else {
          if (activity.type === 'video_trackers') {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        }
      }
      if (lastMaterial['watched_pdf']['flag']) {
        if (lastMaterial['watched_pdf']['material']) {
          if (
            activity.type === 'pdf_trackers' &&
            activity.pdfs === lastMaterial['watched_pdf']['material']
          ) {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        } else {
          if (activity.type === 'pdf_trackers') {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        }
      }
      if (lastMaterial['watched_image']['flag']) {
        if (lastMaterial['watched_image']['material']) {
          if (
            activity.type === 'image_trackers' &&
            activity.pdfs === lastMaterial['watched_image']['material']
          ) {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        } else {
          if (activity.type === 'image_trackers') {
            results.push(e);
            resultContactIds.push(e._id);
            return;
          }
        }
      }
      if (activityCondition.length) {
        if (activityCondition.indexOf(activity.type) !== -1) {
          results.push(e);
          resultContactIds.push(e._id);
        }
      }
    });

    if (!includeLastActivity) {
      results = [];
      await asyncForEach(contacts, async (e) => {
        if (await checkFollowUpCondition(includeFollowUps, e, currentUser)) {
          return;
        }
        if (resultContactIds.indexOf(e._id) === -1) {
          results.push(e);
        }
      });
    }
  } else {
    await asyncForEach(contacts, async (e) => {
      if (!(await checkFollowUpCondition(includeFollowUps, e, currentUser))) {
        results.push(e);
      }
    });
  }
  const count = await Contact.countDocuments({ user: currentUser.id });
  // advance search for stage field
  if (includeStage) {
    var temp = [];
    if (stagesCondition && stagesCondition.length) {
      const deals = await DealStage.find(
        {
          _id: { $in: stagesCondition },
          user: currentUser._id,
        },
        { deals: 1 }
      );
      if (deals) {
        for (let i = 0; i < deals.length; i++) {
          const deal = deals[i];
          if (deal.deals && deal.deals.length) {
            const mDeal = deal.deals;
            for (let j = 0; j < mDeal.length; j++) {
              const dealObj = await Deal.findById(mDeal[j]);
              if (dealObj.contacts) {
                for (let m = 0; m < dealObj.contacts.length; m++) {
                  temp.push(dealObj.contacts[m].toHexString());
                }
              }
            }
          }
        }
      }
      results = results.filter(
        (item) => temp.indexOf(item._id.toHexString()) != -1
      );
    }
  }
  return res.send({
    status: true,
    data: results,
    total: count,
  });
};

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const checkFollowUpCondition = async (
  includeFollowUps,
  contact,
  currentUser
) => {
  const contactFollowUps = await FollowUp.find({
    user: currentUser.id,
    contact: contact._id,
    status: { $ne: -1 },
  }).sort({ due_date: 1 });
  if (
    !includeFollowUps &&
    contactFollowUps !== null &&
    contactFollowUps.length > 0
  ) {
    return true;
  }
};

const getBrokerages = async (req, res) => {
  const { currentUser } = req;

  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    { $group: { _id: '$brokerage' } },
    {
      $sort: { _id: 1 },
    },
  ]).catch((err) => {
    console.log('err', err);
  });

  return res.send({
    status: true,
    data,
  });
};

const getSources = async (req, res) => {
  const { currentUser } = req;

  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    { $group: { _id: '$source' } },
    {
      $sort: { _id: 1 },
    },
  ]).catch((err) => {
    console.log('err', err);
  });

  return res.send({
    status: true,
    data,
  });
};

const getCities = async (req, res) => {
  const { currentUser } = req;

  const data = await Contact.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId(currentUser.id) },
    },
    { $group: { _id: '$city' } },
    {
      $sort: { _id: 1 },
    },
  ]).catch((err) => {
    console.log('err', err);
  });

  return res.send({
    status: true,
    data,
  });
};

const getNthContact = async (req, res) => {
  const { currentUser } = req;
  const skip = req.params.id;

  const contact = await Contact.aggregate([
    {
      $match: { user: currentUser.id },
    },
    {
      $sort: { first_name: 1 },
    },
    {
      $skip: skip,
    },
  ]);
};

const loadFollows = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const _follow_up = await FollowUp.find({
    user: currentUser.id,
    contact,
    status: { $ne: -1 },
  }).sort({ due_date: 1 });
  return res.send({
    status: true,
    follow_ups: _follow_up,
  });
};

const loadTimelines = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const _timelines = await TimeLine.find({
    user: currentUser.id,
    contact,
  });
  let automation = {};
  if (_timelines.length) {
    automation = await Automation.findOne({ _id: _timelines[0]['automation'] })
      .select({ title: 1 })
      .catch((err) => {
        console.log('err', err);
      });
  }
  return res.send({
    status: true,
    timelines: _timelines,
    automation,
  });
};

const selectAllContacts = async (req, res) => {
  const { currentUser } = req;

  const contacts = await Contact.find({
    $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
  }).select('_id');
  return res.send({
    status: true,
    data: contacts,
  });
};

const getAllContacts = async (req, res) => {
  const { currentUser } = req;

  const contacts = await Contact.find({
    $or: [{ user: currentUser.id }, { shared_members: currentUser.id }],
  }).select({
    _id: 1,
    first_name: 1,
    last_name: 1,
    email: 1,
    cell_phone: 1,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const checkEmail = async (req, res) => {
  const { currentUser } = req;
  const { email } = req.body;

  const contacts = await Contact.find({
    user: currentUser.id,
    email: { $regex: new RegExp('^' + email + '$', 'i') },
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const checkPhone = async (req, res) => {
  const { currentUser } = req;
  const { cell_phone } = req.body;

  if (typeof cell_phone === 'object') {
    return res.send({
      data: [],
      status: true,
    });
  }

  const contacts = await Contact.find({
    user: currentUser.id,
    cell_phone,
  });
  return res.send({
    status: true,
    data: contacts,
  });
};

const loadDuplication = async (req, res) => {
  const { currentUser } = req;
  const duplications = await Contact.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(currentUser._id),
      },
    },
    {
      $group: {
        _id: { email: '$email' },
        count: { $sum: 1 },
        contacts: { $push: '$$ROOT' },
      },
    },
    {
      $match: { count: { $gte: 2 } },
    },
  ]).catch((err) => {
    console.log('err', err);
    return res.status(500).send({
      status: false,
      error: err.error,
    });
  });

  return res.send({
    status: true,
    data: duplications,
  });
};

/**
const mergeContacts = (req, res) => {
  const { currentUser } = req;
  const { primary, secondaries, result } = req.body;
  delete result['_id'];
  Contact.updateOne({ _id: mongoose.Types.ObjectId(primary) }, { $set: result })
    .then((data) => {
      Contact.deleteMany({ _id: { $in: secondaries } })
        .then(async (data) => {
          await Activity.deleteMany({
            contacts: { $in: secondaries },
            type: 'contacts',
          });
          await Activity.updateMany(
            { contacts: { $in: secondaries } },
            { $set: { contacts: mongoose.Types.ObjectId(primary) } }
          );
          await EmailTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await Email.updateMany(
            { contacts: { $in: secondaries } },
            { $set: { contacts: mongoose.Types.ObjectId(primary) } }
          );
          await FollowUp.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await ImageTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await Note.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await PDFTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await PhoneLog.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await Reminder.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          await VideoTracker.updateMany(
            { contact: { $in: secondaries } },
            { $set: { contact: mongoose.Types.ObjectId(primary) } }
          );
          return res.send({
            status: true,
          });
        })
        .catch((e) => {
          console.log('error', e);
          return res.status(500).send({
            status: false,
            error: e.error,
          });
        });
      // TimeLine.updateMany({contact: {$in: secondaries}}, {$set: {contact: mongoose.Types.ObjectId(primary)}});
    })
    .catch((e) => {
      console.log('error', e);
      return res.status(500).send({
        status: false,
        error: e.error,
      });
    });
};
 */

const bulkCreate = async (req, res) => {
  const { contacts } = req.body;
  const { currentUser } = req;
  let count = 0;
  let max_upload_count = 0;
  const contact_info = currentUser.contact_info;
  if (contact_info['is_limit']) {
    count = await Contact.countDocuments({ user: currentUser.id });
    max_upload_count =
      contact_info.max_count || system_settings.CONTACT_UPLOAD_LIMIT.PRO;
  }

  const failure = [];
  const succeed = [];
  const promise_array = [];
  let detail_content = 'added contact';
  if (req.guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content);
  }

  for (let i = 0; i < contacts.length; i++) {
    const promise = new Promise(async (resolve, reject) => {
      const data = { ...contacts[i] };
      count += 1;
      if (max_upload_count <= count) {
        const field = {
          data,
          message: 'Exceed upload max contacts',
        };
        failure.push(field);
        resolve();
        return;
      }

      if (data['email']) {
        const email_contact = await Contact.findOne({
          email: data['email'],
          user: currentUser.id,
        }).catch((err) => {
          console.log('contact found err', err.message);
        });
        if (email_contact) {
          failure.push({ message: 'duplicate', data });

          let existing = false;
          failure.some((item) => {
            if (item.data._id == email_contact.id) {
              existing = true;
            }
          });
          if (!existing) {
            failure.push({ message: 'duplicate', data: email_contact });
          }
          resolve();
          return;
        }
      }

      if (data['cell_phone']) {
        data['cell_phone'] = phone(data['cell_phone'])[0];
      }

      if (data['cell_phone']) {
        const phone_contact = await Contact.findOne({
          cell_phone: data['cell_phone'],
          user: currentUser.id,
        }).catch((err) => {
          console.log('contact found err', err.message);
        });
        if (phone_contact) {
          failure.push({ message: 'duplicate', data });

          let existing = false;
          failure.some((item) => {
            if (item.data._id == phone_contact.id) {
              existing = true;
            }
          });
          if (!existing) {
            failure.push({ message: 'duplicate', data: phone_contact });
          }
          resolve();
          return;
        }
      }

      if (data['label']) {
        data['label'] = await LabelHelper.convertLabel(
          currentUser.id,
          data['label']
        );
      } else {
        delete data.label;
      }

      const contact = new Contact({
        ...data,
        user: currentUser.id,
        created_at: new Date(),
        updated_at: new Date(),
      });
      contact
        .save()
        .then((_contact) => {
          succeed.push(_contact);

          const activity = new Activity({
            content: detail_content,
            contacts: _contact.id,
            user: currentUser.id,
            type: 'contacts',
            created_at: new Date(),
            updated_at: new Date(),
          });
          activity
            .save()
            .then((_activity) => {
              Contact.updateOne(
                { _id: _contact.id },
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
          resolve();
        })
        .catch((err) => {
          console.log('err', err);
        });
    });

    promise_array.push(promise);
  }

  Promise.all(promise_array).then(function () {
    const contact_info = {
      count,
      max_upload_count,
    };
    currentUser.contact = contact_info;
    currentUser.save().catch((err) => {
      console.log('user save err', err.message);
    });
    return res.send({
      status: true,
      failure,
      succeed,
    });
  });
};

const verifyEmail = async (email) => {
  // const { email } = req.body;
  const verifier = new Verifier(api.EMAIL_VERIFICATION_KEY, {
    checkFree: false,
    checkDisposable: false,
    checkCatchAll: false,
  });

  return new Promise((resolve, reject) => {
    verifier.verify(email, (err, data) => {
      if (err) {
        reject(false);
      }
      if (
        data['formatCheck'] === 'true' &&
        data['smtpCheck'] === 'true' &&
        data['dnsCheck'] === 'true'
      ) {
        resolve(true);
      } else {
        reject(false);
      }
    });
  });
};

const verifyPhone = async (req, res) => {
  const { cell_phone } = req.body;
  const e164Phone = phone(cell_phone)[0];

  if (e164Phone) {
    return res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Invalid Phone Number',
    });
  }
};

const capitalize = (s) => {
  if ((typeof s).toLowerCase() !== 'string') return;
  if (s.split(' ').length === 2) {
    const s1 = s.split(' ')[0];
    const s2 = s.split(' ')[1];
    return `${s1.charAt(0).toUpperCase() + s1.slice(1).toLowerCase()} ${s2
      .charAt(0)
      .toUpperCase()}${s2.slice(1).toLowerCase()}`;
  }
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const interestContact = async (req, res) => {
  const { user, contact, material, materialType } = req.body;
  const _exist = await Contact.findOne({
    _id: contact,
    user,
  }).catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });
  if (_exist) {
    let _activity;
    if (materialType === 'video') {
      _activity = new Activity({
        content: 'gave thumbs up',
        contacts: _exist.id,
        user,
        type: 'videos',
        videos: material,
      });
    } else if (materialType === 'pdf') {
      _activity = new Activity({
        content: 'gave thumbs up',
        contacts: _exist.id,
        user,
        type: 'pdfs',
        pdfs: material,
      });
    } else if (materialType === 'image') {
      _activity = new Activity({
        content: 'gave thumbs up',
        contacts: _exist.id,
        user,
        type: 'images',
        images: material,
      });
    }

    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('activity save err', err.message);
      });

    return res.json({
      status: true,
      data: {
        contact: _exist.id,
        activity: activity.id,
      },
    });
  }
};

const interestSubmitContact = async (req, res) => {
  const { user, first_name, email, cell_phone, material, materialType } =
    req.body;
  let _exist = await Contact.findOne({
    email,
    user,
  }).catch((err) => {
    return res.status(400).send({
      status: false,
      error: err.message,
    });
  });

  if (!_exist) {
    _exist = await Contact.findOne({
      cell_phone,
      user,
    }).catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
  }

  console.log(_exist);

  let video;
  let pdf;
  let image;
  if (materialType === 'video') {
    video = material;
  }
  if (materialType === 'pdf') {
    pdf = material;
  }
  if (materialType === 'image') {
    image = material;
  }

  if (_exist) {
    let _activity;
    if (video) {
      _activity = new Activity({
        content: 'INTERESTED',
        contacts: _exist.id,
        user,
        type: 'videos',
        videos: video,
      });
    } else if (pdf) {
      _activity = new Activity({
        content: 'INTERESTED',
        contacts: _exist.id,
        user,
        type: 'pdfs',
        pdfs: pdf,
      });
    } else if (image) {
      _activity = new Activity({
        content: 'INTERESTED',
        contacts: _exist.id,
        user,
        type: 'images',
        images: image,
      });
    }

    const activity = await _activity
      .save()
      .then()
      .catch((err) => {
        console.log('err', err);
      });

    return res.json({
      status: true,
      data: {
        contact: _exist.id,
        activity: activity.id,
      },
    });
  } else {
    if (email) {
      const { error } = await verifyEmail(email).catch((err) => {
        return {
          error: err.message,
        };
      });
      if (error) {
        res.status(400).json({
          status: false,
          error,
        });
      }
    }
    const e164Phone = phone(cell_phone)[0];

    if (!e164Phone) {
      return res.status(400).json({
        status: false,
        error: 'Invalid Phone Number',
      });
    }

    const label = system_settings.LEAD;
    const _contact = new Contact({
      first_name,
      email,
      cell_phone: e164Phone,
      label,
      tags: ['interested'],
      user,
    });

    if (video) {
      _contact
        .save()
        .then(async (contact) => {
          const _video = await Video.findOne({ _id: video }).catch((err) => {
            console.log('video found err', err.message);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('current user found err', err.message);
          });
          const garbage = await Garbage.findOne({ user }).catch((err) => {
            console.log('garbage found err', err.message);
          });

          const _activity = new Activity({
            content: 'INTERESTED',
            contacts: contact.id,
            user: currentUser.id,
            type: 'videos',
            videos: video,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          const time_zone = currentUser.time_zone_info
            ? JSON.parse(currentUser.time_zone_info).tz_name
            : system_settings.TIME_ZONE;
          const created_at = moment().tz(time_zone).format('h:mm a');
          const email_notification = garbage['email_notification'];

          if (email_notification['lead_capture']) {
            sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
            const msg = {
              to: currentUser.email,
              from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
              templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
              dynamic_template_data: {
                subject: mail_contents.NOTIFICATION_WATCHED_VIDEO.SUBJECT,
                first_name,
                phone_number: `<a href="tel:${cell_phone}">${cell_phone}</a>`,
                email: `<a href="mailto:${email}">${email}</a>`,
                activity:
                  first_name +
                  ' watched lead capture video - <b>' +
                  _video.title +
                  '</b> at ' +
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
          }

          const desktop_notification = garbage['desktop_notification'];
          if (desktop_notification['lead_capture']) {
            webpush.setVapidDetails(
              'mailto:support@crmgrow.com',
              api.VAPID.PUBLIC_VAPID_KEY,
              api.VAPID.PRIVATE_VAPID_KEY
            );

            const subscription = JSON.parse(
              currentUser.desktop_notification_subscription
            );
            const title = contact.first_name + ' watched lead capture video';
            // const created_at =
            //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
            //   ' at ' +
            //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
            const body =
              contact.first_name +
              ' - ' +
              contact.email +
              ' watched lead capture video: ' +
              _video.title +
              ' on ' +
              created_at;
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
          if (text_notification['lead_capture']) {
            const e164Phone = phone(currentUser.cell_phone)[0];

            if (!e164Phone) {
              const error = {
                error: 'Invalid Phone Number',
              };

              throw error; // Invalid phone number
            } else {
              let fromNumber = currentUser['proxy_number'];
              if (!fromNumber) {
                fromNumber = api.TWILIO.TWILIO_NUMBER;
              }

              const title =
                contact.first_name +
                '\n' +
                contact.email +
                '\n' +
                contact.cell_phone +
                '\n' +
                '\n' +
                'watched lead capture video: ' +
                '\n' +
                _video.title +
                '\n';
              // const created_at =
              //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
              //   ' at ' +
              //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
              const time = ' on ' + created_at + '\n ';
              const contact_link = urls.CONTACT_PAGE_URL + contact.id;
              twilio.messages
                .create({
                  from: fromNumber,
                  body: title + '\n' + time + contact_link,
                  to: e164Phone,
                })
                .catch((err) => {
                  console.log('send sms err: ', err);
                });
            }
          }

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('contact update err', err.message);
          });

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    } else if (pdf) {
      _contact
        .save()
        .then(async (contact) => {
          const _pdf = await PDF.findOne({ _id: pdf }).catch((err) => {
            console.log('err', err);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('err', err);
          });
          const garbage = await Garbage.findOne({ user }).catch((err) => {
            console.log('err', err);
          });

          const _activity = new Activity({
            content: 'INTERESTED',
            contacts: contact.id,
            user: currentUser.id,
            type: 'pdfs',
            pdfs: pdf,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          const time_zone = currentUser.time_zone_info
            ? JSON.parse(currentUser.time_zone_info).tz_name
            : system_settings.TIME_ZONE;
          const created_at = moment().tz(time_zone).format('h:mm a');
          const email_notification = garbage['email_notification'];

          if (email_notification['lead_capture']) {
            sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
            const msg = {
              to: currentUser.email,
              from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
              templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
              dynamic_template_data: {
                subject: mail_contents.NOTIFICATION_REVIEWED_PDF.SUBJECT,
                first_name,
                phone_number: `<a href="tel:${cell_phone}">${cell_phone}</a>`,
                email: `<a href="mailto:${email}">${email}</a>`,
                activity:
                  first_name +
                  ' Viewed lead capture pdf - <b>' +
                  _pdf.title +
                  '</b>at ' +
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
          }

          const desktop_notification = garbage['desktop_notification'];
          if (desktop_notification['lead_capture']) {
            webpush.setVapidDetails(
              'mailto:support@crmgrow.com',
              api.VAPID.PUBLIC_VAPID_KEY,
              api.VAPID.PRIVATE_VAPID_KEY
            );

            const subscription = JSON.parse(
              currentUser.desktop_notification_subscription
            );
            const title = contact.first_name + ' watched lead capture pdf';
            // const created_at =
            //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
            //   ' at ' +
            //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
            const body =
              contact.first_name +
              ' - ' +
              contact.email +
              ' watched lead capture pdf: ' +
              _pdf.title +
              ' on ' +
              created_at;
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
          if (text_notification['lead_capture']) {
            const e164Phone = phone(currentUser.cell_phone)[0];

            if (!e164Phone) {
              const error = {
                error: 'Invalid Phone Number',
              };

              throw error; // Invalid phone number
            } else {
              let fromNumber = currentUser['proxy_number'];
              if (!fromNumber) {
                fromNumber = api.TWILIO.TWILIO_NUMBER;
              }

              const title =
                contact.first_name +
                '\n' +
                contact.email +
                '\n' +
                contact.cell_phone +
                '\n' +
                '\n' +
                'watched lead capture video: ' +
                '\n' +
                _pdf.title +
                '\n';
              // const created_at =
              //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
              //   ' at ' +
              //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
              const time = ' on ' + created_at + '\n ';
              const contact_link = urls.CONTACT_PAGE_URL + contact.id;
              twilio.messages
                .create({
                  from: fromNumber,
                  body: title + '\n' + time + contact_link,
                  to: e164Phone,
                })
                .catch((err) => {
                  console.log('send sms err: ', err);
                });
            }
          }

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message,
          });
        });
    } else if (image) {
      _contact
        .save()
        .then(async (contact) => {
          const _image = await Image.findOne({ _id: image }).catch((err) => {
            console.log('err', err);
          });
          const currentUser = await User.findOne({ _id: user }).catch((err) => {
            console.log('err', err);
          });
          const garbage = await Garbage.findOne({ user }).catch((err) => {
            console.log('err', err);
          });

          const _activity = new Activity({
            content: 'INTERESTED',
            contacts: contact.id,
            user: currentUser.id,
            type: 'images',
            images: image,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const activity = await _activity
            .save()
            .then()
            .catch((err) => {
              console.log('err', err);
            });

          const time_zone = currentUser.time_zone_info
            ? JSON.parse(currentUser.time_zone_info).tz_name
            : system_settings.TIME_ZONE;
          const created_at = moment().tz(time_zone).format('h:mm a');
          const email_notification = garbage['email_notification'];

          if (email_notification['lead_capture']) {
            sgMail.setApiKey(api.SENDGRID.SENDGRID_KEY);
            const msg = {
              to: currentUser.email,
              from: mail_contents.NOTIFICATION_SEND_MATERIAL.MAIL,
              templateId: api.SENDGRID.SENDGRID_NOTICATION_TEMPLATE,
              dynamic_template_data: {
                subject: mail_contents.NOTIFICATION_REVIEWED_IMAGE.SUBJECT,
                first_name,
                phone_number: `<a href="tel:${cell_phone}">${cell_phone}</a>`,
                email: `<a href="mailto:${email}">${email}</a>`,
                activity:
                  first_name +
                  ' Viewed lead capture image - <b>' +
                  _image.title +
                  '</b>at ' +
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
          }

          const desktop_notification = garbage['desktop_notification'];
          if (desktop_notification['lead_capture']) {
            webpush.setVapidDetails(
              'mailto:support@crmgrow.com',
              api.VAPID.PUBLIC_VAPID_KEY,
              api.VAPID.PRIVATE_VAPID_KEY
            );

            const subscription = JSON.parse(
              currentUser.desktop_notification_subscription
            );
            const title = contact.first_name + ' watched lead capture image';
            // const created_at =
            //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
            //   ' at ' +
            //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
            const body =
              contact.first_name +
              ' - ' +
              contact.email +
              ' watched lead capture image: ' +
              _image.title +
              ' on ' +
              created_at;
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
          if (text_notification['lead_capture']) {
            const e164Phone = phone(currentUser.cell_phone)[0];

            if (!e164Phone) {
              const error = {
                error: 'Invalid Phone Number',
              };

              throw error; // Invalid phone number
            } else {
              let fromNumber = currentUser['proxy_number'];
              if (!fromNumber) {
                fromNumber = api.TWILIO.TWILIO_NUMBER;
              }

              const title =
                contact.first_name +
                '\n' +
                contact.email +
                '\n' +
                contact.cell_phone +
                '\n' +
                '\n' +
                'watched lead capture video: ' +
                '\n' +
                _image.title +
                '\n';
              // const created_at =
              //   moment().utcOffset(currentUser.time_zone).format('MM/DD/YYYY') +
              //   ' at ' +
              //   moment().utcOffset(currentUser.time_zone).format('h:mm a');
              const time = ' on ' + created_at + '\n ';
              const contact_link = urls.CONTACT_PAGE_URL + contact.id;
              twilio.messages
                .create({
                  from: fromNumber,
                  body: title + '\n' + time + contact_link,
                  to: e164Phone,
                })
                .catch((err) => {
                  console.log('send sms err: ', err);
                });
            }
          }

          Contact.updateOne(
            { _id: contact.id },
            { $set: { last_activity: activity.id } }
          ).catch((err) => {
            console.log('err', err);
          });

          return res.send({
            status: true,
            data: {
              contact: contact.id,
              activity: activity.id,
            },
          });
        })
        .catch((err) => {
          return res.status(400).send({
            status: false,
            error: err.message,
          });
        });
    }
  }
};

const resubscribe = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const _activity = new Activity({
    user: currentUser.id,
    contacts: contact,
    content: 'resubscribed',
    type: 'emails',
  });
  const activity = await _activity
    .save()
    .then()
    .catch((err) => {
      console.log('err', err.message);
    });
  Contact.updateOne(
    { _id: contact },
    {
      $set: { last_activity: activity.id },
      $pull: { tags: { $in: ['unsubscribed'] } },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const getSharedContact = async (req, res) => {
  const { currentUser } = req;

  if (req.params.id === 'null' || req.params.id === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Invalid Contact',
    });
  }

  const _contact = await Contact.findOne({
    _id: req.params.id,
  })
    .populate('label')
    .catch((err) => {
      console.log('contact found err', err.message);
    });

  const team = await Team.findOne({
    $or: [
      {
        owner: currentUser.id,
        members: mongoose.Types.ObjectId(_contact.user[0]),
      },
      {
        editors: currentUser.id,
        members: mongoose.Types.ObjectId(_contact.user[0]),
      },
    ],
  });

  if (_contact && team) {
    const _activity_list = await Activity.find({
      contacts: req.params.id,
    }).sort({ updated_at: 1 });
    const _activity_detail_list = [];

    for (let i = 0; i < _activity_list.length; i++) {
      const _activity_detail = await Activity.aggregate([
        {
          $lookup: {
            from: _activity_list[i].type,
            localField: _activity_list[i].type,
            foreignField: '_id',
            as: 'activity_detail',
          },
        },
        {
          $match: { _id: _activity_list[i]._id },
        },
      ]);

      _activity_detail_list.push(_activity_detail[0]);
    }

    const myJSON = JSON.stringify(_contact);
    const contact = JSON.parse(myJSON);
    const data = await Object.assign(contact, {
      activity: _activity_detail_list,
    });

    return res.send({
      status: true,
      data,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Contact not found',
    });
  }
};

const mergeContact = async (req, res) => {
  const { primary_contact, secondary_contact } = req.body;
  const editData = { ...req.body };

  delete editData.primary_contact;
  delete editData.secondary_contact;

  if (editData.activity_merge) {
    switch (editData.activity_merge) {
      case 'both': {
        Activity.updateMany(
          {
            contacts: secondary_contact,
          },
          {
            $set: { contacts: mongoose.Types.ObjectId(primary_contact) },
          }
        ).catch((err) => {
          console.log('activity update err', err.message);
        });

        VideoTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        PDFTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        ImageTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        EmailTracker.updateMany(
          { contact: secondary_contact },
          { $set: { contact: mongoose.Types.ObjectId(primary_contact) } }
        );

        Email.updateMany(
          { contacts: secondary_contact },
          { $set: { contacts: mongoose.Types.ObjectId(primary_contact) } }
        );
        break;
      }

      case 'primary': {
        Activity.deleteMany({
          contacts: secondary_contact,
        }).catch((err) => {
          console.log('activity remove err', err.message);
        });
        break;
      }

      case 'remove': {
        Activity.deleteMany({
          contacts: { $in: [primary_contact, secondary_contact] },
        }).catch((err) => {
          console.log('activity remove err', err.message);
        });
        break;
      }
    }
  }

  if (editData.followup_merge) {
    switch (editData.followup_merge) {
      case 'both': {
        FollowUp.updateMany(
          {
            contact: secondary_contact,
          },
          {
            $set: { contact: primary_contact },
          }
        ).catch((err) => {
          console.log('followup update err', err.message);
        });
        Reminder.updateMany(
          {
            contact: secondary_contact,
          },
          {
            $set: { contact: primary_contact },
          }
        ).catch((err) => {
          console.log('reminder update err', err.message);
        });
        break;
      }
      case 'primary': {
        FollowUp.deleteMany({
          contact: secondary_contact,
        }).catch((err) => {
          console.log('followup remove err', err.message);
        });
        Reminder.deleteMany(
          {
            contact: secondary_contact,
          },
          {
            $set: { contact: primary_contact },
          }
        ).catch((err) => {
          console.log('reminder update err', err.message);
        });
        break;
      }
      case 'remove': {
        FollowUp.deleteMany({
          contact: { $in: [primary_contact, secondary_contact] },
        }).catch((err) => {
          console.log('followup remove err', err.message);
        });
        Reminder.deleteMany({
          contact: { $in: [primary_contact, secondary_contact] },
        }).catch((err) => {
          console.log('reminder remove err', err.message);
        });
        break;
      }
    }
  }

  if (editData.automation_merge) {
    switch (editData.automation_merge) {
      case 'primary': {
        TimeLine.deleteMany({
          contact: secondary_contact,
        }).catch((err) => {
          console.log('timeline remove err', err.message);
        });
        break;
      }
      case 'remove': {
        TimeLine.deleteMany({
          contact: { $in: [primary_contact, secondary_contact] },
        }).catch((err) => {
          console.log('timeline remove err', err.message);
        });
        break;
      }
    }
  }

  Contact.findOneAndUpdate(
    {
      _id: primary_contact,
    },
    {
      $set: editData,
    },
    { new: true }
  )
    .then((data) => {
      Contact.deleteOne({ _id: secondary_contact }).catch((err) => {
        console.log('contact delete err', err.message);
      });

      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('contact update err', err.message);
    });
};

const updateContact = async (req, res) => {
  const { label, cell_phone } = req.body;
  const { currentUser } = req;

  if (label) {
    req.body.label = await LabelHelper.convertLabel(currentUser.id, label);
  } else {
    delete req.body.label;
  }
  if (cell_phone) {
    req.body.cell_phone = phone(cell_phone)[0];
  } else {
    delete req.body.cell_phone;
  }
  if (req.body.notes && req.body.notes.length > 0) {
    let note_content = 'added note';
    if (req.guest_loggin) {
      note_content = ActivityHelper.assistantLog(note_content);
    }

    for (let i = 0; i < req.body.notes.length; i++) {
      // const { content, title } = req.body['notes'][i];
      const content = req.body['notes'][i];
      const note = new Note({
        content,
        contact: req.body.id,
        user: currentUser.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      note.save().then((_note) => {
        const _activity = new Activity({
          content: note_content,
          contacts: req.body.id,
          user: currentUser.id,
          type: 'notes',
          notes: _note.id,
          created_at: new Date(),
          updated_at: new Date(),
        });

        _activity
          .save()
          .then((__activity) => {
            Contact.updateOne(
              { _id: req.body.id },
              { $set: { last_activity: __activity.id } }
            ).catch((err) => {
              console.log('err', err);
            });
          })
          .catch((err) => {
            console.log('error', err);
          });
      });
    }
  }

  Contact.updateOne(
    {
      _id: req.body.id,
      user: currentUser.id,
    },
    {
      $set: {
        ...req.body,
      },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('contact update err', err.message);
      return res.send({
        status: false,
        error: 'Internal server error',
      });
    });
};

const shareContacts = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  const promise_array = [];
  const data = [];
  const error = [];
  let contacts_html = '';

  const shareTeam = await Team.findOne({ _id: req.body.team }).catch((err) => {
    console.log('team not found', err.message);
  });

  const user = await User.findOne({
    _id: req.body.user,
  }).catch((err) => {
    console.log('user find err', err.message);
  });

  for (let i = 0; i < contacts.length; i++) {
    const promise = new Promise(async (resolve, reject) => {
      const contact = await Contact.findOne({
        _id: contacts[i],
        user: currentUser.id,
      })
        .populate([
          { path: 'last_activity' },
          {
            path: 'shared_members',
            select: {
              user_name: 1,
              picture_profile: 1,
              email: 1,
              cell_phone: 1,
            },
          },
          {
            path: 'user',
            select: {
              user_name: 1,
              picture_profile: 1,
              email: 1,
              cell_phone: 1,
            },
          },
        ])
        .catch((err) => {
          console.log('contact find err', err.message);
        });

      if (!contact) {
        const _contact = await Contact.findOne({
          _id: contacts[i],
        }).catch((err) => {
          console.log('contact find err', err.message);
        });
        error.push({
          contact: {
            _id: contacts[i],
            first_name: _contact.first_name,
            email: _contact.email,
          },
          error: 'Invalid permission',
        });

        resolve();
      }

      const activity_content = 'shared contact';
      const activity = new Activity({
        user: currentUser.id,
        contacts: contacts[i],
        content: activity_content,
        users: req.body.user,
        type: 'users',
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });

      Contact.updateOne(
        {
          _id: contacts[i],
        },
        {
          $set: {
            shared_contact: true,
            shared_team: req.body.team,
          },
          $push: {
            shared_members: req.body.user,
          },
        }
      )
        .then(() => {
          const first_name = contact.first_name || '';
          const last_name = contact.last_name || '';
          const name = {
            first_name,
            last_name,
          };
          const contact_link = urls.CONTACT_PAGE_URL + contact.id;
          const contact_html = `<tr style="margin-bottom:10px;">
                                  <td>
                                    <span class="icon-user">${getAvatarName(
                                      name
                                    )}</span>
                                  </td>
                                  <td style="padding-left:5px;">
                                    <a class="contact-name" href="${contact_link}">${first_name} ${last_name}</a>
                                  </td>
                                </tr>`;
          contacts_html += contact_html;

          const myJSON = JSON.stringify(contact);
          const _contact = JSON.parse(myJSON);
          _contact.shared_members.push({
            user_name: user.user_name,
            picture_profile: user.picture_profile,
            email: user.email,
            cell_phone: user.cell_phone,
          });
          data.push(_contact);
          resolve();
        })
        .catch((err) => {
          console.log('contact update err', err.message);
        });
    });
    promise_array.push(promise);
  }

  Promise.all(promise_array)
    .then(() => {
      if (data.length > 0) {
        const templatedData = {
          user_name: currentUser.user_name,
          team_member_name: user.user_name,
          team_name: shareTeam.name,
          created_at: moment().format('h:mm MMMM Do, YYYY'),
          html: contacts_html,
        };

        console.log('user email =============>', templatedData);
        const params = {
          Destination: {
            ToAddresses: [user.email],
          },
          Source: mail_contents.NO_REPLAY,
          Template: 'ShareContact',
          TemplateData: JSON.stringify(templatedData),
          ReplyToAddresses: [currentUser.email],
        };

        // Create the promise and SES service object
        ses
          .sendTemplatedEmail(params)
          .promise()
          .then((response) => {
            console.log('success', response.MessageId);
          })
          .catch((err) => {
            console.log('ses send err', err);
          });

        const sharedContacts = data.map((e) => e._id);
        const notification = new Notification({
          creator: currentUser._id,
          user: req.body.user,
          criteria: 'contact_shared',
          contact: sharedContacts,
          team: shareTeam._id,
          content: `${currentUser.user_name} have shared a contact in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
      if (error.length > 0) {
        return res.status(405).json({
          status: false,
          error,
        });
      }
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('contact share err', err);
      return res.status(400).json({
        status: false,
        error: err,
      });
    });
};

const stopShare = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;
  const promise_array = [];
  const data = [];
  const error = [];

  const shareTeam = await Team.findOne({ _id: req.body.team }).catch((err) => {
    console.log('team not found', err.message);
  });

  const user = await User.findOne({
    _id: req.body.user,
  }).catch((err) => {
    console.log('user find err', err.message);
  });

  for (let i = 0; i < contacts.length; i++) {
    const promise = new Promise(async (resolve, reject) => {
      const contact = await Contact.findOne({
        _id: contacts[i],
        user: currentUser.id,
      })
        .populate([
          { path: 'last_activity' },
          {
            path: 'shared_members',
            select: {
              user_name: 1,
              picture_profile: 1,
              email: 1,
              cell_phone: 1,
            },
          },
          {
            path: 'user',
            select: {
              user_name: 1,
              picture_profile: 1,
              email: 1,
              cell_phone: 1,
            },
          },
        ])
        .catch((err) => {
          console.log('contact find err', err.message);
        });

      if (!contact) {
        const _contact = await Contact.findOne({
          _id: contacts[i],
        }).catch((err) => {
          console.log('contact find err', err.message);
        });
        error.push({
          contact: {
            _id: contacts[i],
            first_name: _contact.first_name,
            email: _contact.email,
          },
          error: 'Invalid permission',
        });

        resolve();
      }

      const activity_content = 'stopped sharing contact';
      const activity = new Activity({
        user: currentUser.id,
        contact: contacts[i],
        content: activity_content,
        users: req.body.user,
        type: 'users',
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });

      let query;
      if (contact.shared_members && contact.shared_members.length > 1) {
        query = {
          $pull: {
            shared_members: req.body.user,
          },
        };
      } else {
        query = {
          $unset: {
            shared_contact: true,
            shared_team: true,
            shared_members: true,
          },
        };
      }

      Contact.updateOne(
        {
          _id: contacts[i],
        },
        {
          ...query,
        }
      )
        .then(() => {
          const first_name = contact.first_name || '';
          const last_name = contact.last_name || '';
          const name = {
            first_name,
            last_name,
          };

          const myJSON = JSON.stringify(contact);
          const _contact = JSON.parse(myJSON);
          _contact.shared_members.push({
            user_name: user.user_name,
            picture_profile: user.picture_profile,
            email: user.email,
            cell_phone: user.cell_phone,
          });
          data.push(_contact);
          resolve();
        })
        .catch((err) => {
          console.log('contact update err', err.message);
        });
    });
    promise_array.push(promise);
  }

  Promise.all(promise_array)
    .then(() => {
      if (data.length) {
        const stoppedContact = data.map((e) => e._id);
        const notification = new Notification({
          creator: currentUser._id,
          user: req.body.user,
          criteria: 'stop_share_contact',
          contact: stoppedContact,
          team: shareTeam ? shareTeam._id : '',
          content: `${currentUser.user_name} has stop the contact sharing in CRMGrow`,
        });

        // Notification
        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }
      if (error.length > 0) {
        return res.status(405).json({
          status: false,
          error,
        });
      }
      return res.send({
        status: true,
        data,
      });
    })
    .catch((err) => {
      console.log('contact share err', err);
      return res.status(400).json({
        status: false,
        error: err,
      });
    });
};

const loadByEmails = (req, res) => {
  const { currentUser } = req;
  const { emails } = req.body;
  Contact.find({
    email: { $in: emails },
    user: currentUser._id,
  })
    .select({ _id: 1, first_name: 1, last_name: 1, email: 1, cell_phone: 1 })
    .then((_contacts) => {
      return res.send({
        status: true,
        data: _contacts,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err,
      });
    });
};

const loadNotes = (req, res) => {
  const { currentUser } = req;
  const contactId = req.params.id;

  Note.find({ contact: contactId })
    .then((notes) => {
      return res.send({
        status: true,
        data: notes,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

module.exports = {
  getAll,
  getAllByLastActivity,
  getByLastActivity,
  get,
  getBrokerages,
  getSources,
  getCities,
  create,
  search,
  advanceSearch,
  searchEasy,
  remove,
  bulkRemove,
  edit,
  bulkEditLabel,
  bulkUpdate,
  importCSV,
  overwriteCSV,
  exportCSV,
  getById,
  getByIds,
  getNthContact,
  leadContact,
  loadFollows,
  loadTimelines,
  selectAllContacts,
  getAllContacts,
  checkEmail,
  checkPhone,
  loadDuplication,
  bulkCreate,
  verifyEmail,
  verifyPhone,
  resubscribe,
  filter,
  interestContact,
  interestSubmitContact,
  getSharedContact,
  shareContacts,
  stopShare,
  mergeContact,
  // mergeContacts,
  updateContact,
  loadByEmails,
  loadNotes,
  getDetail,
};
