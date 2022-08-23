const phone = require('phone');
const moment = require('moment-timezone');
const fs = require('fs');
const AWS = require('aws-sdk');

const User = require('../models/user');
const Video = require('../models/video');
const PDF = require('../models/pdf');
const Image = require('../models/image');
const Folder = require('../models/folder');
const Team = require('../models/team');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const Email = require('../models/email');
const Text = require('../models/text');
const VideoTracker = require('../models/video_tracker');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const Garbage = require('../models/garbage');
const Task = require('../models/task');
const Notification = require('../models/notification');
const EmailHelper = require('../helpers/email');
const TextHelper = require('../helpers/text');
const api = require('../config/api');
const garbageHelper = require('../helpers/garbage');
const mail_contents = require('../constants/mail_contents');
const system_settings = require('../config/system_settings');
const urls = require('../constants/urls');
const TimeLine = require('../models/time_line');
const uuidv1 = require('uuid/v1');
const _ = require('lodash');

const credentials = {
  clientID: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_ID,
  clientSecret: api.OUTLOOK_CLIENT.OUTLOOK_CLIENT_SECRET,
  site: 'https://login.microsoftonline.com/common',
  authorizationPath: '/oauth2/v2.0/authorize',
  tokenPath: '/oauth2/v2.0/token',
};

const oauth2 = require('simple-oauth2')(credentials);

const { RestClient } = require('@signalwire/node');

const client = new RestClient(api.SIGNALWIRE.PROJECT_ID, api.SIGNALWIRE.TOKEN, {
  signalwireSpaceUrl: api.SIGNALWIRE.WORKSPACE_DOMAIN,
});
const accountSid = api.TWILIO.TWILIO_SID;
const authToken = api.TWILIO.TWILIO_AUTH_TOKEN;

const twilio = require('twilio')(accountSid, authToken);

const s3 = new AWS.S3({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_S3_REGION,
});

const bulkEmail = async (req, res) => {
  const { currentUser } = req;
  const {
    contacts: inputContacts,
    video_ids,
    pdf_ids,
    image_ids,
    content,
    subject,
    cc,
    bcc,
    scheduled_time,
    attachments,
  } = req.body;

  const STANDARD_CHUNK = 8;
  const CHUNK_COUNT = 12;
  const MIN_CHUNK = 5;
  const TIME_GAPS = [1, 2, 3];

  const max_email_count =
    currentUser['email_info']['max_count'] ||
    system_settings.EMAIL_DAILY_LIMIT.BASIC;

  if (!currentUser.primary_connected) {
    return res.status(406).json({
      status: false,
      error: 'no connected',
    });
  }

  if (inputContacts.length > max_email_count) {
    return res.status(400).json({
      status: false,
      error: 'Email max limited',
    });
  }

  const taskProcessId = new Date().getTime() + uuidv1();
  let newTaskId;

  let contacts = [...inputContacts];
  let contactsToTemp = [];

  // TODO: Scheduled Time Task
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
        message: 'all_queue',
      });
    }
  }

  // TODO: Update the Response if temp contacts exist.
  if (contacts.length) {
    const email_data = {
      user: currentUser._id,
      contacts,
      video_ids,
      pdf_ids,
      image_ids,
      content,
      subject,
      cc,
      bcc,
      attachments,
      // mode,
      // shared_email,
      // has_shared,
      is_guest: req.guest_loggin,
    };

    EmailHelper.sendEmail(email_data)
      .then(async (result) => {
        const error = [];
        result.forEach((_res) => {
          if (!_res.status) {
            error.push({
              contact: _res.contact,
              error: _res.error,
              type: _res.type,
            });
          }
        });

        let notRunnedContactIds = [];
        if (result.length !== contacts.length) {
          const runnedContactIds = [];
          result.forEach((e) => {
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

        EmailHelper.updateUserCount(
          currentUser._id,
          result.length - error.length
        ).catch((err) => {
          console.log('Update user email count failed.', err);
        });

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
        console.log('bulk email sending is failed', err);
        return res.status(500).json({
          status: false,
          error: err,
        });
      });
  }
};

// TODO: AUTO FOLLOW UP
const bulkText = async (req, res) => {
  const { currentUser } = req;
  const { video_ids, pdf_ids, image_ids, content, contacts, mode } = req.body;

  if (!contacts || !contacts.length) {
    return res.status(400).json({
      status: false,
      error: 'Contacts not found',
    });
  }

  if (contacts.length > system_settings.TEXT_ONE_TIME) {
    return res.status(400).json({
      status: false,
      error: `You can send max ${system_settings.TEXT_ONE_TIME} contacts at a time`,
    });
  }

  if (!currentUser['proxy_number'] && !currentUser['twilio_number']) {
    return res.status(408).json({
      status: false,
      error: 'No phone',
    });
  }

  const text_info = currentUser.text_info;
  let count = 0;
  let max_text_count = 0;
  let additional_sms_credit = 0;

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

  const textProcessId = new Date().getTime() + '_' + uuidv1();
  TextHelper.sendText({
    user: currentUser._id,
    video_ids,
    pdf_ids,
    image_ids,
    content,
    contacts,
    mode,
    max_text_count,
    // shared_text,
    // has_shared,
    is_guest: req.guest_loggin,
    textProcessId,
  })
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
        TextHelper.updateUserTextCount(currentUser._id, sentCount).catch(
          (err) => {
            console.log('update user text info is failed.', err);
          }
        );
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
      console.log('err', err);
      return res.status(400).json({
        status: false,
        error: err,
      });
    });
};

const socialShare = async (req, res) => {
  const { activity_id, site } = req.body;
  const activity = await Activity.findOne({ _id: activity_id });
  let _activity;

  if (activity) {
    const user = await User.findOne({ _id: activity.user, del: false }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    const contact = await Contact.findOne({ _id: activity.contacts }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    if (user && contact) {
      const activity_type = activity.type;
      switch (activity_type) {
        case 'videos': {
          const video_tracker = new VideoTracker({
            user: user.id,
            contact: contact.id,
            video: activity.videos,
            type: 'share',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _video_tracker = await video_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('video track save error', err.message);
            });

          _activity = new Activity({
            content: `clicked ${site} share button`,
            contacts: contact.id,
            user: user.id,
            type: 'video_trackers',
            videos: activity.videos,
            video_trackers: _video_tracker.id,
          });
          break;
        }
        case 'pdfs': {
          const pdf_tracker = new PDFTracker({
            user: user.id,
            contact: contact.id,
            pdf: activity.pdfs,
            type: 'share',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _pdf_tracker = await pdf_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('pdf track save error', err.message);
            });

          _activity = new Activity({
            content: `clicked ${site} share button`,
            contacts: contact.id,
            user: user.id,
            type: 'pdf_trackers',
            pdfs: activity.pdfs,
            pdf_trackers: _pdf_tracker.id,
          });
          break;
        }
        case 'images': {
          const image_tracker = new ImageTracker({
            user: user.id,
            contact: contact.id,
            image: activity.images,
            type: 'share',
            activity: activity.id,
          });

          const _image_tracker = await image_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('image track save error', err.message);
            });

          _activity = new Activity({
            content: `clicked ${site} share button`,
            contacts: contact.id,
            user: user.id,
            type: 'image_trackers',
            images: activity.images,
            image_trackers: _image_tracker.id,
          });
          break;
        }
        default:
          break;
      }

      const last_activity = await _activity
        .save()
        .then()
        .catch((err) => {
          console.log('err', err);
        });
      Contact.updateOne(
        { _id: contact.id },
        {
          $set: { last_activity: last_activity.id },
        }
      ).catch((err) => {
        console.log('update contact err', err.message);
      });
    }
  }

  return res.json({
    status: true,
  });
};

const thumbsUp = async (req, res) => {
  const { activity_id } = req.body;
  const activity = await Activity.findOne({ _id: activity_id });
  let _activity;

  if (activity) {
    const user = await User.findOne({ _id: activity.user, del: false }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    const contact = await Contact.findOne({ _id: activity.contacts }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    if (user && contact) {
      const activity_type = activity.type;
      switch (activity_type) {
        case 'videos': {
          const video_tracker = new VideoTracker({
            user: user.id,
            contact: contact.id,
            video: activity.videos,
            type: 'thumbs up',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _video_tracker = await video_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('video track save error', err.message);
            });

          _activity = new Activity({
            content: `gave thumbs up`,
            contacts: contact.id,
            user: user.id,
            type: 'video_trackers',
            videos: activity.videos,
            video_trackers: _video_tracker.id,
          });
          break;
        }
        case 'pdfs': {
          const pdf_tracker = new PDFTracker({
            user: user.id,
            contact: contact.id,
            pdf: activity.pdfs,
            type: 'thumbs up',
            activity: activity.id,
            updated_at: new Date(),
            created_at: new Date(),
          });

          const _pdf_tracker = await pdf_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('pdf track save error', err.message);
            });

          _activity = new Activity({
            content: `gave thumbs up`,
            contacts: contact.id,
            user: user.id,
            type: 'pdf_trackers',
            pdfs: activity.pdfs,
            pdf_trackers: _pdf_tracker.id,
          });
          break;
        }
        case 'images': {
          const image_tracker = new ImageTracker({
            user: user.id,
            contact: contact.id,
            image: activity.images,
            type: 'thumbs up',
            activity: activity.id,
          });

          const _image_tracker = await image_tracker
            .save()
            .then()
            .catch((err) => {
              console.log('image track save error', err.message);
            });

          _activity = new Activity({
            content: `gave thumbs up`,
            contacts: contact.id,
            user: user.id,
            type: 'image_trackers',
            images: activity.images,
            image_trackers: _image_tracker.id,
          });
          break;
        }
        default:
          break;
      }

      const last_activity = await _activity
        .save()
        .then()
        .catch((err) => {
          console.log('err', err);
        });
      Contact.updateOne(
        { _id: contact.id },
        {
          $set: { last_activity: last_activity.id },
        }
      ).catch((err) => {
        console.log('update contact err', err.message);
      });
    }
  }

  return res.json({
    status: true,
  });
};

const loadMaterial = async (req, res) => {
  const { currentUser } = req;
  const garbage = await garbageHelper.get(currentUser);
  let editedVideos = [];
  let editedPdfs = [];
  let editedImages = [];
  if (garbage && garbage['edited_video']) {
    editedVideos = garbage['edited_video'];
  }
  if (garbage && garbage['edited_pdf']) {
    editedPdfs = garbage['edited_pdf'];
  }
  if (garbage && garbage['edited_image']) {
    editedImages = garbage['edited_image'];
  }

  const company = currentUser.company || 'eXp Realty';

  const _folder_list = await Folder.find({
    user: currentUser.id,
  });

  const _video_list = await Video.find({ user: currentUser.id, del: false })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  const _video_admin = await Video.find({
    role: 'admin',
    del: false,
    _id: { $nin: editedVideos },
    company,
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  Array.prototype.push.apply(_video_list, _video_admin);

  const _pdf_list = await PDF.find({ user: currentUser.id, del: false })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  const _pdf_admin = await PDF.find({
    role: 'admin',
    del: false,
    _id: { $nin: editedPdfs },
    company,
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  Array.prototype.push.apply(_pdf_list, _pdf_admin);

  const _image_list = await Image.find({
    user: currentUser.id,
    del: false,
    type: { $ne: 'folder' },
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  const _image_admin = await Image.find({
    role: 'admin',
    del: false,
    _id: { $nin: editedImages },
    company,
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  Array.prototype.push.apply(_image_list, _image_admin);

  const teams = await Team.find({
    $or: [{ members: currentUser.id }, { owner: currentUser.id }],
  }).populate([
    { path: 'videos' },
    { path: 'pdfs' },
    { path: 'images' },
    { path: 'folders' },
  ]);

  const materialOwnerIds = [];
  if (teams && teams.length > 0) {
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const videos = [];
      const pdfs = [];
      const images = [];
      const folders = [];
      team['videos'].forEach((e) => {
        videos.push({ ...e._doc, team: { _id: team._id, name: team['name'] } });
        materialOwnerIds.push(e.user);
      });
      team['pdfs'].forEach((e) => {
        pdfs.push({ ...e._doc, team: { _id: team._id, name: team['name'] } });
        materialOwnerIds.push(e.user);
      });
      team['images'].forEach((e) => {
        images.push({ ...e._doc, team: { _id: team._id, name: team['name'] } });
        materialOwnerIds.push(e.user);
      });
      team['folders'].forEach((e) => {
        folders.push({
          ...e._doc,
          team: { _id: team._id, name: team['name'] },
        });
        materialOwnerIds.push(e.user);
      });

      Array.prototype.push.apply(_video_list, videos);
      Array.prototype.push.apply(_pdf_list, pdfs);
      Array.prototype.push.apply(_image_list, images);
      Array.prototype.push.apply(_folder_list, folders);
    }
  }

  const _other_folders = [];
  const _other_folder_videoIds = [];
  const _other_folder_imageIds = [];
  const _other_folder_pdfIds = [];
  _folder_list.filter((e) => {
    if (e.user !== currentUser._id) {
      _other_folders.push(e);
      Array.prototype.push.apply(_other_folder_videoIds, e.videos);
      Array.prototype.push.apply(_other_folder_imageIds, e.images);
      Array.prototype.push.apply(_other_folder_pdfIds, e.pdfs);
      return true;
    }
    return false;
  });

  const _other_folder_images = await Image.find({
    _id: { $in: _other_folder_imageIds },
    del: false,
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  const _other_folder_pdfs = await PDF.find({
    _id: { $in: _other_folder_pdfIds },
    del: false,
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });
  const _other_folder_videos = await Video.find({
    _id: { $in: _other_folder_videoIds },
    del: false,
  })
    .sort({ priority: 1 })
    .sort({ created_at: 1 });

  Array.prototype.push.apply(_video_list, _other_folder_videos);
  Array.prototype.push.apply(_pdf_list, _other_folder_pdfs);
  Array.prototype.push.apply(_image_list, _other_folder_images);

  const _material_owners = await User.find({
    _id: { $in: materialOwnerIds },
  }).select('_id user_name');
  const _material_owner_objects = {};
  _material_owners.forEach((e) => {
    _material_owner_objects[e._id] = e;
  });

  const _video_detail_list = [];

  for (let i = 0; i < _video_list.length; i++) {
    const view = await VideoTracker.countDocuments({
      video: _video_list[i]._id,
      user: currentUser._id,
    });

    let video_detail;
    if (_video_list[i]._doc) {
      video_detail = {
        ..._video_list[i]._doc,
        views: view,
        material_type: 'video',
      };
    } else {
      video_detail = {
        ..._video_list[i],
        views: view,
        material_type: 'video',
      };
    }

    if (_material_owner_objects[video_detail.user]) {
      video_detail = {
        ...video_detail,
        user: _material_owner_objects[video_detail.user],
      };
    }
    _video_detail_list.push(video_detail);
  }

  const _pdf_detail_list = [];

  for (let i = 0; i < _pdf_list.length; i++) {
    const view = await PDFTracker.countDocuments({
      pdf: _pdf_list[i]._id,
      user: currentUser._id,
    });

    let pdf_detail;
    if (_pdf_list[i]._doc) {
      pdf_detail = {
        ..._pdf_list[i]._doc,
        views: view,
        material_type: 'pdf',
      };
    } else {
      pdf_detail = {
        ..._pdf_list[i],
        views: view,
        material_type: 'pdf',
      };
    }

    if (_material_owner_objects[pdf_detail.user]) {
      pdf_detail = {
        ...pdf_detail,
        user: _material_owner_objects[pdf_detail.user],
      };
    }
    _pdf_detail_list.push(pdf_detail);
  }

  const _image_detail_list = [];

  for (let i = 0; i < _image_list.length; i++) {
    const view = await ImageTracker.countDocuments({
      image: _image_list[i]._id,
      user: currentUser._id,
    });

    let image_detail;
    if (_image_list[i]._doc) {
      image_detail = {
        ..._image_list[i]._doc,
        views: view,
        material_type: 'image',
      };
    } else {
      image_detail = {
        ..._image_list[i],
        views: view,
        material_type: 'image',
      };
    }

    if (_material_owner_objects[image_detail.user]) {
      image_detail = {
        ...image_detail,
        user: _material_owner_objects[image_detail.user],
      };
    }
    _image_detail_list.push(image_detail);
  }

  const _folder_detail_list = [];

  for (let i = 0; i < _folder_list.length; i++) {
    const myJSON = JSON.stringify(_folder_list[i]);
    const _folder = JSON.parse(myJSON);
    const folder = await Object.assign(_folder, {
      material_type: 'folder',
    });
    if (_material_owner_objects[folder.user]) {
      folder.user = _material_owner_objects[folder.user];
    }
    _folder_detail_list.push(folder);
  }

  res.send({
    status: true,
    data: [
      ..._folder_detail_list,
      ..._video_detail_list,
      ..._pdf_detail_list,
      ..._image_detail_list,
    ],
  });
};

const createFolder = (req, res) => {
  const { currentUser } = req;

  const folder = new Folder({
    ...req.body,
    user: currentUser._id,
  });

  folder
    .save()
    .then((_folder) => {
      return res.send({
        status: true,
        data: _folder,
      });
    })
    .catch((e) => {
      return res.status(500).send({
        status: false,
        error: e.message,
      });
    });
};

const editFolder = async (req, res) => {
  const { currentUser } = req;
  const _id = req.params.id;
  const { title } = req.body;
  const folder = await Folder.findOne({ _id, user: currentUser._id }).catch(
    (err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  );

  if (!folder) {
    return res.status(400).send({
      status: false,
      error: 'Not found folder',
    });
  }

  folder['title'] = title;
  folder
    .save()
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};
const removeFolder = async (req, res) => {
  const { currentUser } = req;
  const { _id, mode, target } = req.body;

  const folder = await Folder.findOne({ _id, user: currentUser._id }).catch(
    (err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    }
  );

  if (!folder) {
    return res.status(400).send({
      status: false,
      error: 'Not found folder',
    });
  }

  if (mode === 'remove-all') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        const { videos, images, pdfs } = oldFolderData;
        bulkRemove({ currentUser, body: { videos, images, pdfs } }, res);
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  } else if (mode === 'move-other') {
    const oldFolderData = { ...folder._doc };
    Folder.deleteOne({ _id })
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                videos: { $each: oldFolderData.videos },
                images: { $each: oldFolderData.images },
                pdfs: { $each: oldFolderData.pdfs },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }

  if (mode === 'only-folder') {
    // Skip
  }
  Folder.deleteOne({ _id })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      return res.status(500).send({
        status: false,
        error: err.message,
      });
    });
};
const moveMaterials = async (req, res) => {
  const { currentUser } = req;
  const { materials, target, source } = req.body;
  const { videos, pdfs, images } = materials;
  if (source) {
    await Folder.updateOne(
      { _id: source, user: currentUser._id },
      {
        $pull: {
          videos: { $in: videos },
          pdfs: { $in: pdfs },
          images: { $in: images },
        },
      }
    );
  }
  if (target) {
    await Folder.updateOne(
      { _id: target, user: currentUser._id },
      {
        $addToSet: {
          videos: { $each: videos },
          images: { $each: images },
          pdfs: { $each: pdfs },
        },
      }
    );
  }
  return res.send({
    status: true,
  });
};

const bulkRemove = async (req, res) => {
  const { videos, pdfs, images } = req.body;
  const { currentUser } = req;
  const error = [];
  const promise_array = [];

  if (videos) {
    for (let i = 0; i < videos.length; i++) {
      const promise = new Promise(async (resolve) => {
        const video = await Video.findOne({
          _id: videos[i],
          user: currentUser.id,
        });

        if (video) {
          // Duplicated Admin Video: Garbage Update
          if (video['default_video'] || video['default_edited']) {
            Garbage.updateOne(
              { user: currentUser.id },
              {
                $pull: { edited_video: { $in: [video['default_video']] } },
              }
            ).catch((err) => {
              console.log('default video remove err', err.message);
            });
          }
          // Duplicated Normal Video
          if (video['shared_video']) {
            Video.updateOne(
              {
                _id: video['shared_video'],
                user: currentUser.id,
              },
              {
                $unset: { shared_video: true },
                has_shared: false,
              }
            ).catch((err) => {
              console.log('default video remove err', err.message);
            });
          }
          // Team Video Remove
          if (video['role'] === 'team') {
            Team.updateOne(
              { videos: videos[i] },
              {
                $pull: { videos: { $in: [videos[i]] } },
              }
            ).catch((err) => {
              console.log('err', err.message);
            });
          }
          // Implement the Video Logic && File Remove
          Video.updateOne({ _id: videos[i] }, { $set: { del: true } })
            .then(async () => {
              let hasSameVideo = false;
              if (video['bucket']) {
                const sameVideos = await Video.find({
                  del: false,
                  key: video['key'],
                }).catch((err) => {
                  console.log('same video getting error');
                });
                if (sameVideos && sameVideos.length) {
                  hasSameVideo = true;
                }
              } else {
                const sameVideos = await Video.find({
                  del: false,
                  url: video['url'],
                }).catch((err) => {
                  console.log('same video getting error');
                });
                if (sameVideos && sameVideos.length) {
                  hasSameVideo = true;
                }
              }
              if (!hasSameVideo) {
                if (video['bucket']) {
                  s3.deleteObject(
                    {
                      Bucket: video['bucket'],
                      Key: 'transcoded/' + video['key'] + '.mp4',
                    },
                    function (err, data) {
                      console.log('transcoded video removing error', err);
                    }
                  );
                  emptyBucket(
                    video['bucket'],
                    'streamd/' + video['key'] + '/',
                    (err) => {
                      if (err) {
                        console.log('Removing files error in bucket');
                      }
                    }
                  );
                } else {
                  const url = video['url'];
                  if (url.indexOf('teamgrow.s3') > 0) {
                    s3.deleteObject(
                      {
                        Bucket: api.AWS.AWS_S3_BUCKET_NAME,
                        Key: url.slice(44),
                      },
                      function (err, data) {
                        console.log('err', err);
                      }
                    );
                  } else {
                    try {
                      const file_path = video.path;
                      if (file_path) {
                        fs.unlinkSync(file_path);
                      }
                    } catch (err) {
                      console.log('err', err);
                    }
                  }
                }
              }
              resolve();
            })
            .catch((err) => {
              console.log('err', err.message);
            });
        } else {
          const video = await Video.findOne({
            _id: videos[i],
          });

          error.push({
            video: {
              _id: videos[i],
              title: video['title'],
            },
            error: 'Invalid Permission',
          });
          resolve();
        }
      });
      promise_array.push(promise);
    }
  }

  if (pdfs) {
    for (let i = 0; i < pdfs.length; i++) {
      const promise = new Promise(async (resolve) => {
        const pdf = await PDF.findOne({
          _id: pdfs[i],
          user: currentUser.id,
        });

        if (pdf) {
          // Duplicated Admin PDF: Garbage Update
          if (pdf['default_pdf'] || pdf['default_edited']) {
            Garbage.updateOne(
              { user: currentUser.id },
              {
                $pull: { edited_pdf: { $in: [pdf['default_pdf']] } },
              }
            ).catch((err) => {
              console.log('default pdf remove err', err.message);
            });
          }
          // Duplicated Normal PDF
          if (pdf['shared_pdf']) {
            PDF.updateOne(
              {
                _id: pdf['shared_pdf'],
                user: currentUser.id,
              },
              {
                $unset: { shared_pdf: true },
                has_shared: false,
              }
            ).catch((err) => {
              console.log('default pdf remove err', err.message);
            });
          }
          // Team PDF Remove
          if (pdf['role'] === 'team') {
            Team.updateOne(
              { pdfs: pdfs[i] },
              {
                $pull: { pdfs: { $in: [pdfs[i]] } },
              }
            ).catch((err) => {
              console.log('err', err.message);
            });
          }
          // Implement the PDF Logic && File Remove
          PDF.updateOne({ _id: pdfs[i] }, { $set: { del: true } })
            .then(async () => {
              let hasSamePDF = false;
              const samePdfs = await PDF.find({
                del: false,
                url: pdf['url'],
              }).catch((err) => {
                console.log('same pdf getting error');
              });
              if (samePdfs && samePdfs.length) {
                hasSamePDF = true;
              }
              if (!hasSamePDF) {
                const url = pdf['url'];
                if (url.indexOf('teamgrow.s3') > 0) {
                  s3.deleteObject(
                    {
                      Bucket: api.AWS.AWS_S3_BUCKET_NAME,
                      Key: url.slice(44),
                    },
                    function (err, data) {
                      console.log('err', err);
                    }
                  );
                }
              }
              resolve();
            })
            .catch((err) => {
              console.log('err', err.message);
            });
        } else {
          const pdf = await PDF.findOne({
            _id: pdfs[i],
          });

          error.push({
            pdf: {
              _id: pdfs[i],
              title: pdf['title'],
            },
            error: 'Invalid Permission',
          });
          resolve();
        }
      });
      promise_array.push(promise);
    }
  }

  if (images) {
    for (let i = 0; i < images.length; i++) {
      const promise = new Promise(async (resolve) => {
        const image = await Image.findOne({
          _id: images[i],
          user: currentUser.id,
        });

        if (image) {
          if (image['default_edited']) {
            Garbage.updateOne(
              { user: currentUser.id },
              {
                $pull: { edited_image: { $in: [image.default_image] } },
              }
            ).catch((err) => {
              console.log('default image remove err', err.message);
            });
          }
          if (image['shared_image']) {
            Image.updateOne(
              {
                _id: image.shared_image,
                user: currentUser.id,
              },
              {
                $unset: { shared_image: true },
                has_shared: false,
              }
            ).catch((err) => {
              console.log('default image remove err', err.message);
            });
          }
          if (image.role === 'team') {
            Team.updateOne(
              { images: images[i] },
              {
                $pull: { images: { $in: [images[i]] } },
              }
            ).catch((err) => {
              console.log('err', err.message);
            });
          }

          Image.updateOne({ _id: images[i] }, { $set: { del: true } }).catch(
            (err) => {
              console.log('err', err.message);
            }
          );
          resolve();
        } else {
          const image = await Image.findOne({
            _id: images[i],
          });

          error.push({
            image: {
              _id: images[i],
              title: image.title,
            },
            error: 'Invalid Permission',
          });

          resolve();
        }
      });
      promise_array.push(promise);
    }
  }

  Promise.all(promise_array)
    .then(() => {
      return res.json({
        status: true,
        failed: error,
      });
    })
    .catch((err) => {
      console.log('material bulk remove err', err.message);
      res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const updateFolders = async (req, res) => {
  const { currentUser } = req;
  const { ids, data } = req.body;
  const { title } = data;
  const folders = await Folder.find({
    _id: { $in: ids },
    user: currentUser._id,
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });
  for (let i = 0; i < folders.length; i++) {
    let _title = title;
    if (i) {
      _title = title + ` (${i})`;
    }
    folders[i]['title'] = _title;
    await folders[i].save();
  }

  return res.send({
    status: true,
  });
};
const removeFolders = async (req, res) => {
  const { currentUser } = req;
  const { ids, mode, target } = req.body;

  const folders = await Folder.find({
    _id: { $in: ids },
    user: currentUser._id,
  }).catch((err) => {
    return res.status(500).send({
      status: false,
      error: err.message,
    });
  });

  let videos = [];
  let pdfs = [];
  let images = [];
  for (let i = 0; i < folders.length; i++) {
    const e = folders[i];
    videos = [...videos, ...e.videos];
    pdfs = [...pdfs, ...e.pdfs];
    images = [...images, ...e.images];
  }

  if (mode === 'remove-all') {
    Folder.deleteMany({
      _id: { $in: ids },
      user: currentUser._id,
    })
      .then(() => {
        if (videos.length + pdfs.length + images.length) {
          bulkRemove(
            {
              currentUser,
              body: { videos, pdfs, images },
            },
            res
          );
        } else {
          return res.send({
            status: true,
          });
        }
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  } else if (mode === 'move-other') {
    Folder.deleteMany({
      _id: { $in: ids },
      user: currentUser._id,
    })
      .then(async () => {
        if (target) {
          await Folder.updateOne(
            { _id: target },
            {
              $addToSet: {
                videos: { $each: videos },
                images: { $each: images },
                pdfs: { $each: pdfs },
              },
            }
          );
        }
        return res.send({
          status: true,
        });
      })
      .catch((err) => {
        return res.status(500).send({
          status: false,
          error: err.message,
        });
      });
  }
};

const emptyBucket = (bucketName, folder, callback) => {
  var params = {
    Bucket: bucketName,
    Prefix: folder,
  };

  s3.listObjects(params, (err, data) => {
    if (err) return callback(err);

    if (data.Contents.length === 0) callback();

    const delParams = { Bucket: bucketName, Delete: { Objects: [] } };

    data.Contents.forEach((content) => {
      delParams.Delete.Objects.push({ Key: content.Key });
    });

    s3.deleteObjects(delParams, (err, data) => {
      if (err) return callback(err);
      else callback();
    });
  });
};

module.exports = {
  bulkEmail,
  bulkText,
  socialShare,
  thumbsUp,
  loadMaterial,
  createFolder,
  editFolder,
  removeFolder,
  moveMaterials,
  bulkRemove,
  updateFolders,
  removeFolders,
  emptyBucket,
};
