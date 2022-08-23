const mongoose = require('mongoose');
const moment = require('moment');
const { google } = require('googleapis');
const AWS = require('aws-sdk');

const User = require('../models/user');
const Deal = require('../models/deal');
const DealStage = require('../models/deal_stage');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const Note = require('../models/note');
const FollowUp = require('../models/follow_up');
const ActivityHelper = require('../helpers/activity');
const Email = require('../models/email');
const Text = require('../models/text');
const Appointment = require('../models/appointment');
const TeamCall = require('../models/team_call');
const Notification = require('../models/notification');
const Garbage = require('../models/garbage');
const Reminder = require('../models/reminder');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Task = require('../models/task');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const EmailTracker = require('../models/email_tracker');
const {
  addGoogleCalendarById,
  addOutlookCalendarById,
  updateGoogleCalendarById,
  updateOutlookCalendarById,
  removeGoogleCalendarById,
  removeOutlookCalendarById,
} = require('./appointment');
const { sendEmail, updateUserCount } = require('../helpers/email');
const { sendText, updateUserTextCount } = require('../helpers/text');
const api = require('../config/api');
const urls = require('../constants/urls');
const mail_contents = require('../constants/mail_contents');
const system_settings = require('../config/system_settings');
const { getAvatarName } = require('../helpers/utility');
const uuidv1 = require('uuid/v1');
const _ = require('lodash');

const ses = new AWS.SES({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const getAll = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;

  const data = await Deal.find({
    user: currentUser.id,
    contacts: { $in: contacts },
  });

  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Deal doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;

  const deal = new Deal({
    ...req.body,
    user: currentUser.id,
    updated_at: new Date(),
    created_at: new Date(),
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

      for (let i = 0; i < contacts.length; i++) {
        const activity = new Activity({
          content: detail_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'deals',
          deals: _deal.id,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        Contact.updateOne(
          { _id: contacts[i] },
          { $set: { last_activity: activity.id } }
        ).catch((err) => {
          console.log('err', err);
        });
      }

      const myJSON = JSON.stringify(_deal);
      const data = JSON.parse(myJSON);
      data.deal_stage = req.body.deal_stage;

      return res.send({
        status: true,
        data: _deal,
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const moveDeal = async (req, res) => {
  const { deal_id, position } = req.body;
  let { deal_stage_id } = req.body;

  const deal = await Deal.findOne({ _id: deal_id }).catch((err) => {
    console.log('deal found error', err.message);
    return res.status(500).send(err.message || 'Deal found error');
  });

  try {
    await DealStage.updateOne(
      { _id: deal.deal_stage },
      {
        $pull: {
          deals: { $in: [mongoose.Types.ObjectId(deal_id)] },
        },
      },
      { new: true }
    ).catch((err) => {
      console.log('source deal stage update error', err.message);
      throw err.message || 'Source deal stage update error';
    });

    await Deal.updateOne(
      { _id: deal_id },
      {
        $set: {
          deal_stage: deal_stage_id,
        },
      }
    ).catch((err) => {
      console.log('deal update error', err.message);
      throw err.message || 'deal update error';
    });

    if (!deal_stage_id) {
      deal_stage_id = deal.deal_stage;
    }
    await DealStage.updateOne(
      { _id: deal_stage_id },
      {
        $push: {
          deals: {
            $each: [deal_id],
            $position: position,
          },
        },
      }
    ).catch((err) => {
      console.log('destination deal stage update error', err.message);
      throw err.message || 'Destination deal stage update error';
    });
    return res.send();
  } catch (error) {
    return res.status(500).send(error);
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;

  const deal = await Deal.findOne({
    _id: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    console.log('deal find err', err.message);
  });

  if (!deal) {
    return res.status(400).json({
      status: false,
      error: 'Permission invalid',
    });
  }

  Deal.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    console.log('remove deal', err.message);
  });

  DealStage.updateOne(
    {
      _id: deal.deal_stage,
    },
    {
      $pull: {
        deals: { $in: [mongoose.Types.ObjectId(req.params.id)] },
      },
    }
  ).catch((err) => {
    console.log('remove deal', err.message);
  });

  // TODO: Relative Notes, Tasks, Emails, Appointments remove

  return res.send({
    status: true,
  });
};

const edit = async (req, res) => {
  const { currentUser } = req;
  const body = req.body;

  const currentDeal = await Deal.findOne({
    _id: req.params.id,
    user: currentUser.id,
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message || JSON.stringify(err),
    });
  });

  if (!currentDeal) {
    return res.status(400).send({
      status: false,
      error: 'Not found current deal.',
    });
  }

  Deal.updateOne(
    {
      _id: req.params.id,
      user: currentUser.id,
    },
    { $set: { ...body } }
  )
    .then(async () => {
      if (currentDeal.deal_stage !== body.deal_stage) {
        console.log(
          'current stage',
          'new-stage',
          currentDeal.deal_stage,
          body.deal_stage
        );
        await DealStage.updateOne(
          { _id: currentDeal.deal_stage },
          { $pull: { deals: currentDeal._id } }
        ).catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message || JSON.stringify(err),
          });
        });
        await DealStage.updateOne(
          { _id: body.deal_stage },
          { $addToSet: { deals: currentDeal._id } }
        ).catch((err) => {
          return res.status(500).send({
            status: false,
            error: err.message || JSON.stringify(err),
          });
        });
        return res.send({
          status: true,
        });
      } else {
        return res.send({
          status: true,
        });
      }
    })
    .catch((err) => {
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const updateContact = (req, res) => {
  const { currentUser } = req;
  const { action, contacts } = req.body;

  let query;
  if (action === 'add') {
    query = { $addToSet: { contacts: { $each: contacts } } };
  } else if (action === 'remove') {
    query = { $pull: { contacts: { $in: contacts } } };
  }

  Deal.updateOne(
    {
      _id: req.params.id,
      user: currentUser.id,
    },
    query
  )
    .then((result) => {
      let detail_content = '';
      if (action === 'add') {
        detail_content = 'added to deal';
      } else {
        detail_content = 'removed from deal';
      }
      for (let i = 0; i < contacts.length; i++) {
        const activity = new Activity({
          content: detail_content,
          contacts: contacts[i],
          user: currentUser.id,
          type: 'deals',
          deals: req.params.id,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });
        Contact.updateOne(
          { _id: contacts[i] },
          { $set: { last_activity: activity.id } }
        ).catch((err) => {
          console.log('err', err);
        });
      }
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || JSON.stringify(err),
      });
    });
};

const getDetail = (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  Deal.findOne({ _id: id, user: currentUser._id })
    .then(async (_deal) => {
      const _contacts = await Contact.find({ _id: { $in: _deal['contacts'] } });
      return res.send({
        status: true,
        data: {
          main: _deal,
          contacts: _contacts,
          activities: [],
        },
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};

const getActivity = async (req, res) => {
  const { currentUser } = req;
  const { count } = req.body;
  const startTime = new Date().getTime();

  // Contact Activity List
  let _activity_list;

  if (count) {
    _activity_list = await Activity.find({
      user: currentUser.id,
      deals: req.body.deal,
    })
      .sort({ updated_at: -1 })
      .limit(count);
  } else {
    _activity_list = await Activity.find({
      user: currentUser.id,
      deals: req.body.deal,
    }).sort({ updated_at: 1 });
  }

  // Contact Relative Details
  const videoIds = [];
  const imageIds = [];
  const pdfIds = [];
  const materials = [];
  const trackers = {};
  let notes = [];
  let emails = [];
  let texts = [];
  let appointments = [];
  let tasks = [];

  if (count) {
    const loadedIds = [];
    const noteIds = [];
    const emailIds = [];
    const textIds = [];
    const apptIds = [];
    const taskIds = [];
    const dealIds = [];
    for (let i = 0; i < _activity_list.length; i++) {
      if (
        [
          'notes',
          'emails',
          'texts',
          'appointments',
          'follow_ups',
          'deals',
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
            case 'emails': {
              emailIds.push(detail_id);
              break;
            }
            case 'texts': {
              textIds.push(detail_id);
              break;
            }
            case 'appointments':
              apptIds.push(detail_id);
              break;
            case 'follow_ups':
              taskIds.push(detail_id);
              break;
            case 'deals':
              dealIds.push(detail_id);
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
  } else {
    notes = await Note.find({ deal: req.body.deal });
    emails = await Email.find({ deal: req.body.deal });
    texts = await Text.find({ deal: req.body.deal });
    appointments = await Appointment.find({ deal: req.body.deal });
    tasks = await FollowUp.find({ deal: req.body.deal });
  }

  for (let i = 0; i < _activity_list.length; i++) {
    const e = _activity_list[i];
    if (
      (e['type'] === 'emails' && e['emails']) ||
      (e['type'] === 'texts' && e['texts'])
    ) {
      if (e['videos'] instanceof Array) {
        Array.prototype.push.apply(videoIds, e['videos']);
      } else {
        videoIds.push(e['videos']);
      }
      if (e['pdfs'] instanceof Array) {
        Array.prototype.push.apply(pdfIds, e['pdfs']);
      } else {
        pdfIds.push(e['pdfs']);
      }
      if (e['images'] instanceof Array) {
        Array.prototype.push.apply(imageIds, e['images']);
      } else {
        imageIds.push(e['images']);
      }

      let send_activityIds = [];
      let detail_id;
      let video_trackers;
      let pdf_trackers;
      let image_trackers;
      let email_trackers;
      if (e['type'] === 'emails') {
        detail_id = e['emails'];
        if (detail_id instanceof Array) {
          detail_id = detail_id[0];
        }
        const emails = await Email.find({
          shared_email: detail_id,
        }).catch((err) => {
          console.log('deal email find err', err.message);
        });
        const emailIds = (emails || []).map((e) => e._id);

        const send_activities = await Activity.find({
          emails: { $in: emailIds },
        }).select('_id');

        send_activityIds = send_activities.map((e) => e._id);
        email_trackers = await EmailTracker.find({
          activity: { $in: send_activityIds },
        }).catch((err) => {
          console.log('deal image tracker find err', err.message);
        });
      } else {
        detail_id = e['texts'];
        if (detail_id instanceof Array) {
          detail_id = detail_id[0];
        }
        const texts = await Text.find({
          shared_text: detail_id,
        }).catch((err) => {
          console.log('deal text find err', err.message);
        });
        const textIds = (texts || []).map((e) => e._id);

        const send_activities = await Activity.find({
          texts: { $in: textIds },
        }).select('_id');

        send_activityIds = send_activities.map((e) => e._id);
      }
      if (e['videos'] && e['videos'].length) {
        video_trackers = await VideoTracker.find({
          activity: { $in: send_activityIds },
        }).catch((err) => {
          console.log('deal video tracker find err', err.message);
        });
      }
      if (e['pdfs'] && e['pdfs'].length) {
        pdf_trackers = await PDFTracker.find({
          activity: { $in: send_activityIds },
        }).catch((err) => {
          console.log('deal pdf tracker find err', err.message);
        });
      }
      if (e['images'] && e['images'].length) {
        image_trackers = await ImageTracker.find({
          activity: { $in: send_activityIds },
        }).catch((err) => {
          console.log('deal image tracker find err', err.message);
        });
      }

      trackers[detail_id] = {
        video_trackers,
        pdf_trackers,
        image_trackers,
        email_trackers,
      };
    }
  }

  const videos = await Video.find({ _id: { $in: videoIds } });
  const pdfs = await PDF.find({ _id: { $in: pdfIds } });
  const images = await Image.find({ _id: { $in: imageIds } });
  Array.prototype.push.apply(materials, videos);
  Array.prototype.push.apply(materials, pdfs);
  Array.prototype.push.apply(materials, images);

  const data = {
    activity: _activity_list,

    details: {
      materials,
      notes,
      emails,
      texts,
      appointments,
      trackers,
      tasks,
    },
  };

  return res.send({
    status: true,
    data,
  });
};

const getNotes = async (req, res) => {
  const { currentUser } = req;
  const notes = await Note.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: notes,
  });
};

const createNote = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;

  const note = new Note({
    content: req.body.content,
    deal: req.body.deal,
    user: currentUser.id,
  });

  note.save().catch((err) => {
    console.log('deal note create err', err.message);
  });

  const content = 'added note';
  const activity = new Activity({
    user: currentUser.id,
    content,
    notes: note.id,
    type: 'notes',
    deals: req.body.deal,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  for (let i = 0; i < contacts.length; i++) {
    const contact_note = new Note({
      contact: contacts[i],
      has_shared: true,
      shared_note: note.id,
      content: req.body.content,
      user: currentUser.id,
    });

    contact_note.save().catch((err) => {
      console.log('note save err', err.message);
    });

    const note_activity = new Activity({
      content,
      contacts: contacts[i],
      type: 'notes',
      notes: contact_note.id,
      user: currentUser.id,
    });

    note_activity
      .save()
      .then((_activity) => {
        Contact.updateOne(
          { _id: contacts[i] },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
      })
      .catch((e) => {
        console.log('follow error', e);
        return res.status(400).send({
          status: false,
          error: e,
        });
      });
  }
  return res.send({
    status: true,
  });
};

const editNote = async (req, res) => {
  const editData = { ...req.body };
  delete editData.contact;

  Note.updateOne(
    {
      _id: req.body.note,
    },
    {
      $set: { ...editData },
    }
  ).catch((err) => {
    console.log('deal note update err', err.message);
  });

  Note.updateMany(
    {
      shared_note: req.body.note,
    },
    {
      $set: { ...editData },
    }
  ).catch((err) => {
    console.log('deal note update err', err.message);
  });

  return res.send({
    status: true,
  });
};

const removeNote = async (req, res) => {
  Note.deleteOne({
    _id: req.body.note,
  }).catch((err) => {
    console.log('deal note delete err', err.message);
  });

  const notes = await Note.findMany({
    shared_note: req.body.note,
  }).catch((err) => {
    console.log('deal related note find err', err.message);
  });

  if (notes && notes.length > 0) {
    for (let i = 0; i < notes.length; i++) {
      Activity.deleteOne({
        notes: notes[i].id,
        types: 'notes',
      }).catch((err) => {
        console.log('activity deal note delete err', err.message);
      });
    }

    Note.deleteMany({
      shared_note: req.body.note,
    }).catch((err) => {
      console.log('deal note delete err', err.message);
    });
  }

  Activity.deleteOne({
    notes: req.body.note,
    type: 'notes',
  }).catch((err) => {
    console.log('deal not activity remove err', err.message);
  });

  return res.send({
    status: true,
  });
};

const createFollowUp = async (req, res) => {
  const { currentUser } = req;
  const { deal, type, content, due_date } = req.body;
  const followup = new FollowUp({
    user: currentUser.id,
    deal,
    type,
    content,
    due_date,
  });

  followup.save().catch((err) => {
    console.log('new follow up save err', err.message);
  });

  const activity_content = 'added task';
  const activity = new Activity({
    content: activity_content,
    type: 'follow_ups',
    follow_ups: followup.id,
    deals: req.body.deal,
    user: currentUser.id,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  const garbage = await Garbage.findOne({ user: currentUser.id }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  let reminder_before = 30;
  if (garbage) {
    reminder_before = garbage.reminder_before;
  }

  const startdate = moment(due_date);
  const remind_at = startdate.subtract(reminder_before, 'minutes');

  const { contacts } = req.body;
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    const new_followup = new FollowUp({
      has_shared: true,
      shared_follow_up: followup.id,
      contact,
      content,
      due_date,
      type,
      remind_at,
      user: currentUser.id,
    });

    new_followup.save().catch((err) => {
      console.log('new follow up save err', err.message);
    });

    const new_activity = new Activity({
      content: activity_content,
      contacts: contact,
      user: currentUser.id,
      type: 'follow_ups',
      follow_ups: new_followup.id,
    });

    new_activity.save().catch((err) => {
      console.log('activity save err', err.message);
    });
  }

  return res.send({
    status: true,
  });
};

const updateFollowUp = async (req, res) => {
  const { currentUser } = req;
  // const { deal, type, content, due_date } = req.body;
  const editData = { ...req.body };

  FollowUp.updateOne(
    {
      _id: req.body.followup,
    },
    {
      $set: { ...editData },
    }
  ).catch((err) => {
    console.log('deal followup update err', err.message);
  });

  const activity_content = 'updated task';

  const activity = new Activity({
    content: activity_content,
    type: 'follow_ups',
    follow_ups: req.body.followup,
    deals: req.body.deal,
    user: currentUser.id,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  FollowUp.updateMany(
    {
      shared_follow_up: req.body.followup,
    },
    {
      $set: { ...editData },
    }
  ).catch((err) => {
    console.log('contact deal update task', err.message);
  });

  let due_date;
  const followups = await FollowUp.find({
    shared_follow_up: req.body.followup,
  });
  const contacts = [];
  const followUpIds = [];
  const contactFollowMatch = {};
  followups.forEach((e) => {
    if (e && e['contact'] && e['contact'][0]) {
      contacts.push(e['contact'][0]);
      contactFollowMatch[e['contact'][0]] = e._id;
    }
    followUpIds.push(e._id);
  });
  if (req.body.due_date) {
    const garbage = await Garbage.findOne({ user: currentUser.id }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    let reminder_before = 30;
    if (garbage) {
      reminder_before = garbage.reminder_before;
    }

    const startdate = moment(req.body.due_date);
    due_date = startdate.subtract(reminder_before, 'minutes');

    Reminder.updateMany(
      { follow_up: { $in: followUpIds } },
      {
        $set: {
          due_date,
        },
      }
    ).catch((err) => {
      console.log('err', err);
    });
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    const new_activity = new Activity({
      content: activity_content,
      contacts: contact,
      user: currentUser.id,
      type: 'follow_ups',
      follow_ups: contactFollowMatch[contact],
    });

    new_activity
      .save()
      .then((_activity) => {
        Contact.updateOne(
          { _id: contact },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
      })
      .catch((e) => {
        console.log('follow error', e);
        return res.status(400).send({
          status: false,
          error: e,
        });
      });
  }

  return res.send({
    status: true,
  });
};

const completeFollowUp = async (req, res) => {
  const { currentUser } = req;
  // const { deal, type, content, due_date } = req.body;
  const editData = { ...req.body };

  FollowUp.updateOne(
    {
      _id: req.body.followup,
    },
    {
      $set: { ...editData },
    }
  ).catch((err) => {
    console.log('deal followup update err', err.message);
  });

  const activity_content = 'completed task';

  const activity = new Activity({
    content: activity_content,
    type: 'follow_ups',
    follow_ups: req.body.followup,
    deals: req.body.deal,
    user: currentUser.id,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  FollowUp.updateMany(
    {
      shared_follow_up: req.body.followup,
    },
    {
      $set: { status: 1 },
    }
  ).catch((err) => {
    console.log('contact deal update task', err.message);
  });

  const followups = await FollowUp.find({
    shared_follow_up: req.body.followup,
  }).catch((err) => {
    console.log('followups find err', err.message);
  });

  const contacts = [];
  const followUpIds = [];
  const contactFollowMatch = {};
  followups.forEach((e) => {
    if (e && e['contact'] && e['contact'][0]) {
      contacts.push(e['contact'][0]);
      contactFollowMatch[e['contact'][0]] = e._id;
    }
    followUpIds.push(e._id);
  });

  if (followUpIds) {
    Reminder.deleteMany({
      follow_up: { $in: followUpIds },
    }).catch((err) => {
      console.log('reminder remove err', err.message);
    });
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    const activity = new Activity({
      content: activity_content,
      contacts: contact,
      user: currentUser.id,
      type: 'follow_ups',
      follow_ups: contactFollowMatch[contact],
    });

    activity
      .save()
      .then((_activity) => {
        Contact.updateOne(
          { _id: contact },
          {
            $set: { last_activity: _activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
      })
      .catch((e) => {
        console.log('follow error', e);
        return res.status(400).send({
          status: false,
          error: e,
        });
      });
  }
  return res.send({
    status: true,
  });
};

const removeFollowUp = async (req, res) => {
  FollowUp.deleteOne({
    _id: req.body.followup,
  }).catch((err) => {
    console.log('remove followup err', err.message);
  });

  Activity.deleteOne({
    follow_ups: req.body.followup,
    type: 'follow_ups',
  }).catch((err) => {
    console.log('followup find err', err.message);
  });

  const follow_ups = await FollowUp.find({
    shared_follow_up: req.body.followup,
  }).catch((err) => {
    console.log('followup find err', err.message);
  });

  if (follow_ups && follow_ups.length) {
    for (let i = 0; i < follow_ups.length; i++) {
      Activity.deleteMany({
        type: 'follow_ups',
        follow_ups: follow_ups[i].id,
      }).catch((err) => {
        console.log('activity remove error', err.message);
      });
    }

    FollowUp.deleteMany({
      shared_follow_up: req.body.followup,
    }).catch((err) => {
      console.log('remove followup err', err.message);
    });
  }

  return res.send({
    status: true,
  });
};

const sendEmails = async (req, res) => {
  const { currentUser } = req;
  const {
    subject,
    content,
    cc,
    bcc,
    deal,
    contacts: inputContacts,
    video_ids,
    pdf_ids,
    image_ids,
  } = req.body;
  const error = [];

  const email = new Email({
    user: currentUser.id,
    subject,
    content,
    cc,
    bcc,
    deal,
  });

  if (!currentUser.primary_connected) {
    return res.status(406).json({
      status: false,
      error: 'no connected',
    });
  }

  email.save().catch((err) => {
    console.log('new email save err', err.message);
  });

  const activity_content = 'sent email';

  const activity = new Activity({
    user: currentUser.id,
    content: activity_content,
    deals: deal,
    type: 'emails',
    emails: email.id,
    videos: video_ids,
    pdfs: pdf_ids,
    images: image_ids,
  });

  activity.save().catch((err) => {
    console.log('activity save err', err.message);
  });

  const taskProcessId = new Date().getTime() + uuidv1();
  let newTaskId;
  let contacts = [...inputContacts];
  let contactsToTemp = [];

  const STANDARD_CHUNK = 8;
  const CHUNK_COUNT = 12;
  const MIN_CHUNK = 5;
  const TIME_GAPS = [1, 2, 3];

  if (inputContacts.length > STANDARD_CHUNK) {
    const currentTasks = await Task.find({
      user: currentUser._id,
      type: 'send_email',
      status: 'active',
    })
      .sort({ due_date: -1 })
      .limit(1)
      .catch((err) => {
        console.log('Getting Last Email Tasks', err);
      });
    let last_due;
    if (currentTasks && currentTasks.length) {
      // Split From Here
      last_due = currentTasks[0].due_date;
      contactsToTemp = [...contacts];
      contacts = [];
    } else {
      // Handle First Chunk and Create With Anothers
      last_due = new Date();
      contactsToTemp = contacts.slice(STANDARD_CHUNK);
      contacts = contacts.slice(0, STANDARD_CHUNK);
    }

    let delay = 2;
    let taskIndex = 0;
    while (taskIndex < contactsToTemp.length) {
      const due_date = moment(last_due).add(delay, 'minutes');
      const chunk =
        Math.floor(Math.random() * (CHUNK_COUNT - MIN_CHUNK)) + MIN_CHUNK;

      const task = new Task({
        user: currentUser.id,
        contacts: contactsToTemp.slice(taskIndex, taskIndex + chunk),
        status: 'active',
        process: taskProcessId,
        type: 'send_email',
        action: {
          ...req.body,
        },
        due_date,
      });

      task.save().catch((err) => {
        console.log('campaign job save err', err.message);
      });

      if (!newTaskId) {
        newTaskId = task._id;
      }

      taskIndex += chunk;
      const timeIndex = Math.floor(Math.random() * TIME_GAPS.length);
      delay += TIME_GAPS[timeIndex];
    }

    if (!contacts.length) {
      return res.send({
        status: true,
        message: 'All are in queue.',
      });
    }
  }
  if (contacts.length) {
    const data = {
      user: currentUser.id,
      ...req.body,
      shared_email: email.id,
      has_shared: true,
    };

    sendEmail(data)
      .then(async (_res) => {
        _res.forEach((response) => {
          if (!response.status) {
            error.push({
              contact: response.contact,
              error: response.error,
              type: response.type,
            });
          }
        });

        let notRunnedContactIds = [];
        if (_res.length !== contacts.length) {
          const runnedContactIds = [];
          _res.forEach((e) => {
            runnedContactIds.push(e.contact && e.contact._id);
          });
          notRunnedContactIds = _.difference(contacts, runnedContactIds);
        }

        // Create Notification and With Success and Failed
        if (contactsToTemp) {
          // Failed Contacts && Total Contacts Count
          if (error.length) {
            const notification = new Notification({
              user: currentUser._id,
              criteria: 'bulk_email',
              status: 'pending',
              process: taskProcessId,
              deliver_status: {
                failed: error,
                contacts,
                notExecuted: notRunnedContactIds,
              },
              detail: { ...req.body },
            });
            notification.save().catch((err) => {
              console.log('Email Notification Create Failed');
            });
          }
          // Task Update
          const task = await Task.findById(newTaskId).catch(() => {
            console.log('Initialize First Task Processing Status Failed');
          });
          if (task) {
            const failedContacts = error.map((e) => e.contact && e.contact._id);
            const succeedContacts = _.difference(contacts, [
              ...failedContacts,
              ...notRunnedContactIds,
            ]);
            task.exec_result = {
              failed: error,
              notExecuted: notRunnedContactIds,
              succeed: succeedContacts,
            };
            task.save().catch(() => {
              console.log('Updating First Task Processing Status Failed');
            });
          }
        }

        updateUserCount(currentUser._id, _res.length - error.length).catch(
          (err) => {
            console.log('Update user email count failed.', err);
          }
        );

        if (error.length > 0) {
          const connect_errors = error.filter((e) => {
            if (
              e.type === 'connection_failed' ||
              e.type === 'google_token_invalid' ||
              e.type === 'outlook_token_invalid'
            ) {
              return true;
            }
          });
          if (connect_errors.length) {
            return res.status(406).json({
              status: false,
              error,
              notExecuted: notRunnedContactIds,
            });
          } else {
            return res.status(405).json({
              status: false,
              error,
              notExecuted: notRunnedContactIds,
            });
          }
        } else {
          return res.send({
            status: true,
          });
        }
      })
      .catch((err) => {
        console.log('email send error', err);
      });
  }
};

const getEmails = async (req, res) => {
  const { currentUser } = req;
  const emails = await Email.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: emails,
  });
};

const getAppointments = async (req, res) => {
  const { currentUser } = req;
  const appointments = await Appointment.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: appointments,
  });
};

const getTeamCalls = async (req, res) => {
  const { currentUser } = req;
  const team_calls = await TeamCall.find({
    user: currentUser.id,
    deal: req.body.deal,
  });

  return res.status({
    status: true,
    data: team_calls,
  });
};

const removeTeamCall = async (req, res) => {
  const { currentUser } = req;

  TeamCall.deleteOne({
    _id: req.body.team_call,
    user: currentUser.id,
  })
    .then(() => {
      // shared team call delete
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('team call delete err', err.message);
      return res.send(500).json({
        status: false,
        error: err,
      });
    });
};

const createAppointment = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;

  let event_id;
  let recurrence_id;

  if (currentUser.calendar_connected) {
    const _appointment = req.body;
    const { connected_email } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const ctz = currentUser.time_zone_info
      ? JSON.parse(currentUser.time_zone_info).tz_name
      : system_settings.TIME_ZONE;

    if (calendar.connected_calendar_type === 'outlook') {
      const { new_event_id, new_recurrence_id } = await addOutlookCalendarById(
        ctz,
        _appointment,
        calendar
      );
      event_id = new_event_id;
      recurrence_id = new_recurrence_id;
    } else {
      const oauth2Client = new google.auth.OAuth2(
        api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
        api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
        urls.GMAIL_AUTHORIZE_URL
      );
      const token = JSON.parse(calendar.google_refresh_token);
      oauth2Client.setCredentials({ refresh_token: token.refresh_token });
      const { new_event_id, new_recurrence_id } = await addGoogleCalendarById(
        oauth2Client,
        ctz,
        _appointment
      );
      event_id = new_event_id;
      recurrence_id = new_recurrence_id;
    }

    const deal_data = { ...req.body };

    const appointment = new Appointment({
      ...deal_data,
      event_id,
      user: currentUser.id,
    });

    appointment.save().catch((err) => {
      console.log('deal appointment create err', err.message);
    });

    const content = 'added appointment';
    const activity = new Activity({
      user: currentUser.id,
      content,
      type: 'appointments',
      appointments: appointment.id,
      deals: req.body.deal,
    });

    activity.save().catch((err) => {
      console.log('activity save err', err.message);
    });

    for (let i = 0; i < contacts.length; i++) {
      // const contact_appointment = new Appointment({
      //   ...req.body,
      //   event_id,
      //   contact: contacts[i],
      //   has_shared: true,
      //   shared_appointment: appointment.id,
      //   user: currentUser.id,
      // });

      // contact_appointment.save().catch((err) => {
      //   console.log('note save err', err.message);
      // });

      const appointment_activity = new Activity({
        content,
        contacts: contacts[i],
        type: 'appointments',
        appointments: appointment.id,
        user: currentUser.id,
      });

      appointment_activity.save().catch((err) => {
        console.log('note activity err', err.message);
      });
    }
    return res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'You must connect gmail/outlook',
    });
  }
};

const updateAppointment = async (req, res) => {
  const { currentUser } = req;
  const { contacts } = req.body;

  if (currentUser.calendar_connected) {
    const _appointment = req.body;
    const { connected_email } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const ctz = currentUser.time_zone_info
      ? JSON.parse(currentUser.time_zone_info).tz_name
      : system_settings.TIME_ZONE;

    const event_id = req.body.recurrence_id || req.body.event_id;
    if (calendar.connected_calendar_type === 'outlook') {
      const data = { ctz, appointment: _appointment, calendar, event_id };
      updateOutlookCalendarById(data);
    } else {
      const oauth2Client = new google.auth.OAuth2(
        api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
        api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
        urls.GMAIL_AUTHORIZE_URL
      );
      const token = JSON.parse(calendar.google_refresh_token);
      oauth2Client.setCredentials({ refresh_token: token.refresh_token });
      const data = {
        oauth2Client,
        ctz,
        appointment: _appointment,
        calendar,
        event_id,
      };
      await updateGoogleCalendarById(data);
    }

    const deal_data = { ...req.body };

    Appointment.updateOne(
      {
        _id: req.body.appointment,
      },
      { $set: deal_data }
    ).catch((err) => {
      console.log('appointment update err', err.message);
    });

    const activity_content = 'updated appointment';
    const activity = new Activity({
      user: currentUser.id,
      content: activity_content,
      type: 'appointments',
      appointments: req.body.appointment,
      deals: req.body.deal,
    });

    activity.save().catch((err) => {
      console.log('activity save err', err.message);
    });

    for (let i = 0; i < contacts.length; i++) {
      const appointment_activity = new Activity({
        content: activity_content,
        contacts: contacts[i],
        type: 'appointments',
        appointments: req.body.appointment,
        user: currentUser.id,
      });

      appointment_activity.save().catch((err) => {
        console.log('note activity err', err.message);
      });
    }
    return res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'You must connect gmail/outlook',
    });
  }
};

const removeAppointment = async (req, res) => {
  const { currentUser } = req;

  if (currentUser.calendar_connected) {
    const { connected_email } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const remove_id = req.body.recurrence_id || req.body.event_id;

    if (calendar.connected_calendar_type === 'outlook') {
      const data = { calendar_id: req.body.calendar_id, calendar, remove_id };
      removeOutlookCalendarById(data);
    } else {
      const oauth2Client = new google.auth.OAuth2(
        api.GMAIL_CLIENT.GMAIL_CLIENT_ID,
        api.GMAIL_CLIENT.GMAIL_CLIENT_SECRET,
        urls.GMAIL_AUTHORIZE_URL
      );
      const token = JSON.parse(calendar.google_refresh_token);
      oauth2Client.setCredentials({ refresh_token: token.refresh_token });
      const data = {
        oauth2Client,
        calendar_id: req.body.calendar_id,
        remove_id,
      };
      removeGoogleCalendarById(data);
    }

    const appointment = Appointment.findOne({
      user: currentUser.id,
      event_id: remove_id,
    }).catch((err) => {
      console.log('appointment find err', err.message);
    });

    Activity.deleteMany({
      appointments: appointment.id,
      user: currentUser.id,
    }).catch((err) => {
      console.log('appointment activity err', err.message);
    });

    Appointment.deleteOne({
      user: currentUser.id,
      event_id: remove_id,
    }).catch((err) => {
      console.log('appointment update err', err.message);
    });

    return res.send({
      status: true,
    });
  }
};

const createTeamCall = async (req, res) => {
  const { currentUser } = req;
  let leader;
  let contacts;

  if (req.body.contacts && req.body.contacts.length > 0) {
    contacts = await Contact.find({ _id: { $in: req.body.contacts } }).catch(
      (err) => {
        console.log('contact find err', err.message);
      }
    );
  }

  if (req.body.leader) {
    leader = await User.findOne({ _id: req.body.leader }).catch((err) => {
      console.log('leader find err', err.message);
    });
  }

  const deal_data = { ...req.body };

  const team_call = new TeamCall({
    ...deal_data,
    user: currentUser.id,
  });

  console.log('deal_data', deal_data, team_call);

  team_call
    .save()
    .then(() => {
      const activity = new Activity({
        team_calls: team_call.id,
        user: currentUser.id,
        content: 'inquired group call',
        type: 'team_calls',
        deals: req.body.deal,
      });

      activity.save().catch((err) => {
        console.log('activity save err', err.message);
      });

      if (leader) {
        let guests = '';
        if (contacts) {
          for (let i = 0; i < contacts.length; i++) {
            const first_name = contacts[i].first_name || '';
            const last_name = contacts[i].last_name || '';
            const data = {
              first_name,
              last_name,
            };

            const new_activity = new Activity({
              team_calls: team_call.id,
              user: currentUser.id,
              contacts: contacts[i].id,
              content: 'inquired group call',
              type: 'team_calls',
            });

            new_activity.save().catch((err) => {
              console.log('activity save err', err.message);
            });

            Contact.updateOne(
              {
                _id: contacts[i].id,
              },
              {
                $set: { last_activity: new_activity.id },
              }
            ).catch((err) => {
              console.log('contact update err', err.message);
            });

            const guest = `<tr style="margin-bottom:10px;"><td><span class="icon-user">${getAvatarName(
              data
            )}</label></td><td style="padding-left:5px;">${first_name} ${last_name}</td></tr>`;
            guests += guest;
          }
        }

        const organizer = `<tr><td><span class="icon-user">${getAvatarName({
          full_name: currentUser.user_name,
        })}</label></td><td style="padding-left: 5px;">${
          currentUser.user_name
        }</td></tr>`;

        const templatedData = {
          user_name: currentUser.user_name,
          leader_name: leader.user_name,
          created_at: moment().format('h:mm MMMM Do, YYYY'),
          subject: team_call.subject,
          description: team_call.description || '',
          organizer,
          call_url: urls.TEAM_CALLS + team_call.id,
          guests,
        };

        const params = {
          Destination: {
            ToAddresses: [leader.email],
          },
          Source: mail_contents.NO_REPLAY,
          Template: 'TeamCallRequest',
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
      }

      /** **********
       *  Creat dashboard notification to the inviated users
       *  */
      if (leader) {
        const notification = new Notification({
          user: leader.id,
          team_call: team_call.id,
          criteria: 'team_call_invited',
          content: `You've been invited to join a call by ${currentUser.user_name}.`,
        });

        notification.save().catch((err) => {
          console.log('notification save err', err.message);
        });
      }

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('team save err', err.message);
      return res.status(400).json({
        status: false,
        error: err.message,
      });
    });
};

const sendTexts = async (req, res) => {
  const { currentUser } = req;
  const { content, deal, video_ids, pdf_ids, image_ids } = req.body;
  const error = [];

  const text_info = currentUser.text_info;
  let count = 0;
  let max_text_count = 0;
  let additional_sms_credit = 0;

  if (!currentUser['proxy_number'] && !currentUser['twilio_number']) {
    return res.status(408).json({
      status: false,
      error: 'No phone',
    });
  }

  if (!text_info['is_enabled']) {
    return res.status(410).json({
      status: false,
      error: 'Disable send sms',
    });
  }

  if (text_info['is_limit']) {
    count = currentUser.text_info.count || 0;

    max_text_count =
      text_info.max_count || system_settings.TEXT_MONTHLY_LIMIT.PRO;

    const { additional_credit } = currentUser.text_info;
    if (additional_credit) {
      additional_sms_credit = additional_credit.amount;
    }

    if (max_text_count <= count && !additional_sms_credit) {
      return res.status(409).json({
        status: false,
        error: 'Exceed max sms credit',
      });
    }
  }

  const text = new Text({
    user: currentUser.id,
    type: 0,
    content,
    deal,
  });

  text.save().catch((err) => {
    console.log('new email save err', err.message);
  });

  const activity_content = 'sent text';

  const activity = new Activity({
    user: currentUser.id,
    content: activity_content,
    deals: deal,
    type: 'texts',
    texts: text.id,
    videos: video_ids,
    pdfs: pdf_ids,
    images: image_ids,
  });

  activity.save().catch((err) => {
    console.log('deal text activity save err', err.message);
  });

  const textProcessId = new Date().getTime() + '_' + uuidv1();

  const data = {
    user: currentUser.id,
    ...req.body,
    shared_text: text.id,
    has_shared: true,
    max_text_count,
    textProcessId,
  };

  sendText(data)
    .then((_res) => {
      const errors = [];
      let sentCount = 0;
      _res.forEach((e) => {
        if (!e.status && !e.type) {
          errors.push(e);
        }
        if (e.isSent || e.status) {
          sentCount++;
        }
      });

      if (sentCount) {
        updateUserTextCount(currentUser._id, sentCount).catch((err) => {
          console.log('update user text info is failed.', err);
        });
      }

      if (errors.length > 0) {
        return res.status(405).json({
          status: false,
          error: errors,
        });
      }
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('email send error', err);
    });
};

module.exports = {
  getAll,
  getActivity,
  getNotes,
  getAppointments,
  getTeamCalls,
  removeTeamCall,
  create,
  moveDeal,
  edit,
  remove,
  getDetail,
  createNote,
  editNote,
  removeNote,
  createFollowUp,
  completeFollowUp,
  createAppointment,
  updateAppointment,
  removeAppointment,
  updateFollowUp,
  removeFollowUp,
  createTeamCall,
  sendEmails,
  getEmails,
  sendTexts,
  updateContact,
};
