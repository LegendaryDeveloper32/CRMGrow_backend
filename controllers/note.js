const Note = require('../models/note');
const Activity = require('../models/activity');
const Contact = require('../models/contact');
const ActivityHelper = require('../helpers/activity');

const get = async (req, res) => {
  const { currentUser } = req;
  const query = { ...req.query };
  const contact = query['contact'];

  const data = await Note.find({ user: currentUser.id, contact });
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

const create = async (req, res) => {
  const { currentUser } = req;

  const note = new Note({
    ...req.body,
    user: currentUser.id,
    updated_at: new Date(),
    created_at: new Date(),
  });

  note
    .save()
    .then((_note) => {
      let detail_content = 'added note';
      if (req.guest_loggin) {
        detail_content = ActivityHelper.assistantLog(detail_content);
      }

      const activity = new Activity({
        content: detail_content,
        contacts: _note.contact,
        user: currentUser.id,
        type: 'notes',
        notes: _note.id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      activity.save().then((_activity) => {
        Contact.updateOne(
          { _id: _note.contact },
          { $set: { last_activity: _activity.id } }
        ).catch((err) => {
          console.log('err', err);
        });
        const myJSON = JSON.stringify(_note);
        const data = JSON.parse(myJSON);
        data.activity = _activity;
        res.send({
          status: true,
          data,
        });
      });
    })
    .catch((err) => {
      return res.status(400).send({
        status: false,
        error: err.message,
      });
    });
};

const bulkCreate = async (req, res) => {
  const { currentUser } = req;
  const { contacts, content } = req.body;

  let detail_content = 'added note';
  if (req.guest_loggin) {
    detail_content = ActivityHelper.assistantLog(detail_content);
  }

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    const note = new Note({
      content,
      contact,
      user: currentUser.id,
    });

    note
      .save()
      .then((_note) => {
        const activity = new Activity({
          content: detail_content,
          contacts: _note.contact,
          user: currentUser.id,
          type: 'notes',
          notes: _note.id,
        });

        activity
          .save()
          .then((_activity) => {
            Contact.updateOne(
              { _id: _note.contact },
              {
                $set: { last_activity: _activity.id },
              }
            ).catch((err) => {
              console.log('err', err);
            });
            const myJSON = JSON.stringify(_note);
            const data = JSON.parse(myJSON);
            data.activity = _activity;
          })
          .catch((e) => {
            console.log('note creating Error', e);
            return res.status().send({
              status: false,
              error: e,
            });
          });
      })
      .catch((e) => {
        console.log('note creating Error', e);
        return res.status().send({
          status: false,
          error: e,
        });
      });
  }
  return res.send({
    status: true,
  });
};

const remove = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;

  await Note.deleteOne({ user: currentUser._id, _id: id });

  Activity.deleteOne({
    type: 'notes',
    notes: id,
  }).catch((err) => {
    console.log('activity remove err', err.message);
  });

  return res.send({
    status: true,
  });
};

const update = async (req, res) => {
  const { currentUser } = req;
  const id = req.params.id;
  const data = req.body;

  await Note.updateOne({ user: currentUser._id, _id: id }, { $set: data });

  return res.send({
    status: true,
  });
};

module.exports = {
  get,
  create,
  bulkCreate,
  remove,
  update,
};
