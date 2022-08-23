const _ = require('lodash');

const MailList = require('../models/mail_list');

const getAll = async (req, res) => {
  const { currentUser } = req;
  const data = await MailList.find({ user: currentUser.id })
    .select({ title: 1 })
    .catch((err) => {
      console.log('mail list find err', err.message);
    });

  return res.send({
    status: true,
    data,
  });
};

const get = async (req, res) => {
  const data = await MailList.findOne({ _id: req.params.id });
  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Mail list doesn`t exist',
    });
  }

  return res.send({
    status: true,
    data,
  });
};

const create = async (req, res) => {
  const { currentUser } = req;

  const mail_list = new MailList({
    ...req.body,
    user: currentUser.id,
    updated_at: new Date(),
    created_at: new Date(),
  });

  mail_list
    .save()
    .then(() => {
      return res.send({
        status: true,
        data: mail_list,
      });
    })
    .catch((err) => {
      console.log('err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message || 'Internal server error',
      });
    });
};

const addContacts = async (req, res) => {
  const { mail_list, contacts } = req.body;

  const list = await MailList.findOne({
    _id: mail_list,
  }).catch((err) => {
    console.log('contact found err', err.message);
  });

  const contacts_list = list.contacts;
  const new_list = _.unionBy(contacts_list, contacts, 'email');

  MailList.updateOne(
    {
      _id: mail_list,
    },
    {
      $set: { contacts: new_list },
    }
  )
    .then(() => {
      return res.send({
        status: true,
        data: new_list,
      });
    })
    .catch((err) => {
      console.log('mail list update err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const removeContacts = async (req, res) => {
  const { mail_list, contacts } = req.body;
  MailList.updateOne(
    {
      _id: mail_list,
    },
    {
      $pull: { contacts: { $in: contacts } },
    }
  )
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('mail list update err', err.message);
      return res.status(500).json({
        status: false,
        error: err.message,
      });
    });
};

const moveTopContacts = async (req, res) => {};

module.exports = {
  get,
  getAll,
  create,
  addContacts,
  removeContacts,
  moveTopContacts,
};
