const Notification = require('../models/notification');
const Task = require('../models/task');
const Text = require('../models/text');

const get = async (req, res) => {
  const { currentUser } = req;
  const { limit } = req.query;
  const personal_notifications = await Notification.find({
    user: currentUser.id,
    is_read: false,
  }).limit(parseInt(limit));

  const system_notifications = await Notification.find({
    type: 'global',
    del: false,
  }).sort({ updated_at: -1 });

  res.send({
    status: true,
    personal_notifications,
    system_notifications,
  });
};

const bulkRead = (req, res) => {
  const { ids } = req.body;
  const { currentUser } = req;
  Notification.updateMany(
    {
      _id: { $in: ids },
      user: currentUser.id,
    },
    {
      $set: { is_read: true },
    }
  )
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

const bulkUnread = (req, res) => {
  const { ids } = req.body;
  const { currentUser } = req;
  Notification.updateMany(
    {
      _id: { $in: ids },
      type: 'personal',
      user: currentUser.id,
    },
    { is_read: false }
  )
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

const bulkRemove = (req, res) => {
  const { ids } = req.body;
  const { currentUser } = req;
  Notification.deleteMany({
    _id: { $in: ids },
    user: currentUser.id,
  })
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

const getNotificationDetails = async (notifications) => {
  const promise_array = [];

  for (let i = 0; i < notifications.length; i++) {
    const notification = notifications[i];
    let detailNotification;
    let promise;
    let pathField;
    let selectField;
    let trackField;
    switch (notification['criteria']) {
      case 'bulk_sms':
        // TODO: 5 contacts populate for succeed and failed
        promise = new Promise((resolve) => {
          resolve(notification);
        });
        break;
      case 'bulk_email':
        // TODO: 5 contacts populate for succeed and failed
        promise = new Promise((resolve) => {
          resolve(notification);
        });
        break;
      case 'team_invited':
      case 'team_accept':
      case 'team_reject':
      case 'team_requested':
      case 'join_accept':
      case 'join_reject':
        detailNotification = await Notification.findById(notification['_id'])
          .populate({
            path: 'creator',
            select: '_id user_name email cell_phone picture_profile',
          })
          .populate({
            path: 'team',
            select: '_id name picture',
          });
        promise = new Promise((resolve) => {
          resolve(detailNotification);
        });
        break;
      case 'share_automation':
      case 'stop_share_automation':
        detailNotification = await Notification.findById(notification['_id'])
          .populate({
            path: 'creator',
            select: '_id user_name email cell_phone picture_profile',
          })
          .populate({
            path: 'team',
            select: '_id name picture',
          })
          .populate({
            path: 'action.automation',
            select: '_id title',
          });
        promise = new Promise((resolve) => {
          resolve(detailNotification);
        });
        break;
      case 'share_template':
      case 'stop_share_template':
        detailNotification = await Notification.findById(notification['_id'])
          .populate({
            path: 'creator',
            select: '_id user_name email cell_phone picture_profile',
          })
          .populate({
            path: 'team',
            select: '_id name picture',
          })
          .populate({
            path: 'action.template',
            select: '_id title subject',
          });
        promise = new Promise((resolve) => {
          resolve(detailNotification);
        });
        break;
      case 'share_material':
      case 'stop_share_material':
        if (notification.action.object) {
          pathField = 'action.' + notification.action.object;
          detailNotification = await Notification.findById(notification['_id'])
            .populate({
              path: 'creator',
              select: '_id user_name email cell_phone picture_profile',
            })
            .populate({
              path: 'team',
              select: '_id name picture',
            })
            .populate({
              path: pathField,
              select: '_id title preview thumbnail',
            });
          promise = new Promise((resolve) => {
            resolve(detailNotification);
          });
        } else {
          detailNotification = await Notification.findById(notification['_id'])
            .populate({
              path: 'creator',
              select: '_id user_name email cell_phone picture_profile',
            })
            .populate({
              path: 'team',
              select: '_id name picture',
            })
            .populate({
              path: 'action.pdf',
              select: '_id title preview thumbnail',
            })
            .populate({
              path: 'action.video',
              select: '_id title preview thumbnail',
            })
            .populate({
              path: 'action.image',
              select: '_id title preview thumbnail',
            })
            .populate({
              path: 'action.folder',
              select: '_id title preview thumbnail',
            });
          promise = new Promise((resolve) => {
            resolve(detailNotification);
          });
        }
        break;
      case 'contact_shared':
      case 'stop_share_contact':
        detailNotification = await Notification.findById(notification['_id'])
          .populate({
            path: 'creator',
            select: '_id user_name email cell_phone picture_profile',
          })
          .populate({
            path: 'team',
            select: '_id name picture',
          })
          .populate({
            path: 'contact',
            select: '_id first_name last_name email cell_phone',
          });
        promise = new Promise((resolve) => {
          resolve(detailNotification);
        });
        break;
      case 'open_email':
      case 'click_link':
      case 'unsubscribe':
        pathField = 'action.' + notification.action.object;
        selectField = '';
        if (notification.action.object === 'email') {
          selectField = '_id subject content';
        } else {
          selectField = '_id title preview thumbnail';
        }
        detailNotification = await Notification.findById(notification['_id'])
          .populate({
            path: 'contact',
            select: '_id first_name last_name email cell_phone',
          })
          .populate({
            path: pathField,
            select: selectField,
          })
          .populate({
            path: 'email_tracker',
          });
        promise = new Promise((resolve) => {
          resolve(detailNotification);
        });
        break;
      case 'material_track':
        pathField = 'action.' + notification.action.object;
        selectField = '';
        trackField = notification.action.object + '_tracker';
        if (notification.action.object === 'email') {
          selectField = '_id subject content';
        } else {
          selectField = '_id title preview thumbnail';
        }
        detailNotification = await Notification.findById(notification['_id'])
          .populate({
            path: 'contact',
            select: '_id first_name last_name email cell_phone',
          })
          .populate({
            path: pathField,
            select: selectField,
          })
          .populate({
            path: trackField,
          });
        promise = new Promise((resolve) => {
          resolve(detailNotification);
        });
        break;
      default:
        promise = new Promise((resolve) => {
          resolve(notification);
        });
    }
    promise_array.push(promise);
  }

  return Promise.all(promise_array);
};

const getPage = async (req, res) => {
  const { currentUser } = req;
  const { page } = req.params;

  const notifications = await Notification.find({
    $or: [
      {
        user: currentUser.id,
      },
      {
        owner: currentUser.id,
      },
      {
        type: 'global',
      },
    ],
    del: false,
  })
    .sort({ updated_at: -1 })
    .skip((page - 1) * 15)
    .limit(15);

  const total = await Notification.countDocuments({
    $or: [
      {
        user: currentUser.id,
      },
      {
        owner: currentUser.id,
      },
      {
        type: 'global',
      },
    ],
    del: false,
  });

  getNotificationDetails(notifications)
    .then((_notifications) => {
      return res.json({
        status: true,
        notifications: _notifications,
        total,
      });
    })
    .catch((err) => {
      console.log('Notifications detail getting is failed', err);
    });
};

const getDelivery = async (req, res) => {
  const { currentUser } = req;
  const sms = await Notification.find({
    user: currentUser.id,
    criteria: 'bulk_sms',
  })
    .populate('contact')
    .catch((err) => {
      console.log('notification find err', err.message);
    });

  return res.send({
    status: true,
    notification: {
      sms,
    },
  });
};

const getStatus = async (req, res) => {
  const { currentUser } = req;

  const emailTasks = await Task.aggregate([
    {
      $match: {
        user: currentUser._id,
        type: 'send_email',
      },
    },
    {
      $group: {
        _id: '$process',
        details: { $last: '$action' },
        tasks: {
          $push: {
            _id: '$_id',
            contacts: '$contacts',
            exec_result: '$exec_result',
            status: '$status',
            updated_at: '$updated_at',
            created_at: '$created_at',
            due_date: '$due_date',
          },
        },
        exp_end: { $last: '$due_date' },
        exp_start: { $first: '$due_date' },
      },
    },
  ]);

  const textTasks = await Task.aggregate([
    {
      $match: {
        user: currentUser._id,
        type: 'bulk_sms',
      },
    },
    {
      $group: {
        _id: '$process',
        details: { $last: '$action' },
        tasks: {
          $push: {
            _id: '$_id',
            contacts: '$contacts',
            exec_result: '$exec_result',
            status: '$status',
            updated_at: '$updated_at',
            created_at: '$created_at',
            due_date: '$due_date',
          },
        },
        exp_time: { $last: '$due_date' },
      },
    },
  ]);

  const unreadCount = await Text.countDocuments({
    user: currentUser._id,
    type: 1,
    status: 0,
  }).catch((err) => {
    console.log('received text count getting is failed', err);
  });
  let unreadMessages = [];
  if (unreadCount) {
    unreadMessages = await Text.find({
      user: currentUser._id,
      type: 1,
      status: 0,
    })
      .sort({ created_at: -1 })
      .limit(10)
      .populate('contacts', '_id first_name last_name email cell_phone')
      .catch((err) => {
        console.log('received text count getting is failed', err);
      });
  }

  const response = {
    emails: emailTasks,
    texts: textTasks,
    unread: unreadCount,
    unreadMessages,
  };

  let notifications = await Notification.find({
    $or: [{ user: currentUser._id }, { owner: currentUser._id }],
    is_read: false,
  })
    .sort({ updated_at: -1 })
    .limit(6)
    .catch((err) => {
      console.log('Getting unread notifications', err);
    });
  if (notifications && notifications.length) {
    response.unreadNotifications = notifications.length;
  } else {
    notifications = await Notification.find({
      $or: [{ user: currentUser._id }, { owner: currentUser._id }],
    })
      .sort({ updated_at: -1 })
      .limit(5)
      .catch((err) => {
        console.log('Getting Latest notifications', err);
      });
    response.unreadNotifications = 0;
  }
  const formatted_notifications = await getNotificationDetails(
    notifications
  ).catch((err) => {
    console.log('Notification Detail getting is failed', err);
  });
  response.notifications = formatted_notifications;

  let system_notifications = await Notification.find({
    type: 'global',
    _id: { $ne: '5f5863fe1764de3cf845b8b3' },
    del: false,
  }).sort({ updated_at: -1 });

  let v2_announce;
  if (currentUser.user_version === 'v1') {
    v2_announce = {
      content: `<a href="https://app.crmgrow.com">Click here</a> to go back to crmgrow version 1.0. Please register live training for v2 by <a href="https://crmgrow.com/demo">clicking here</a>`,
    };
  } else {
    v2_announce = {
      content: `Welcome to crmgrow! Please register live training for v2 by <a href="https://crmgrow.com/demo">clicking here</a>`,
    };
  }

  if (system_notifications.length === 0) {
    system_notifications = [v2_announce];
  } else {
    system_notifications.push(v2_announce);
  }

  response.system_notifications = system_notifications;

  return res.send(response);
};

module.exports = {
  get,
  getPage,
  getDelivery,
  bulkRead,
  bulkUnread,
  bulkRemove,
  getStatus,
};
