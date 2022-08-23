const mongoose = require('mongoose');
const sgMail = require('@sendgrid/mail');
const moment = require('moment-timezone');
const CronJob = require('cron').CronJob;
const fs = require('fs');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');
const phone = require('phone');
const webpush = require('web-push');
const sharp = require('sharp');
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
const { result } = require('lodash');

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
                            ...timeline.exec_result.succeed
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
            const {
              message_sid,
              service,
              activities,
              activity,
              text,
              tasks,
            } = timeline.action;
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
                    TextHelper.handleFailedText(activities, activity, text, 3, tasks || []);

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
                  TextHelper.handleFailedText(activities, activity, text, 4, tasks || []);

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

task_check.start();
