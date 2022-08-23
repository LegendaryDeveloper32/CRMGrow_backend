const { validationResult } = require('express-validator/check');
const Label = require('../models/label');
const garbageHelper = require('../helpers/garbage.js');

const create = async (req, res) => {
  const { currentUser } = req;

  const label = new Label({
    ...req.body,
    user: currentUser.id,
  });

  try {
    const newLabel = await label.save();
    return res.send({ status: true, data: newLabel });
  } catch (err) {
    return res.status(500).send({
      status: false,
      error: err.message || 'Label creating failed.',
    });
  }
};

const getAll = async (req, res) => {
  const { currentUser } = req;
  const garbage = await garbageHelper.get(currentUser);

  if (!garbage) {
    return res.status(400).send({
      status: false,
      error: `Couldn't get the Garbage`,
    });
  }

  let editedLabels = [];
  if (garbage && garbage['edited_label']) {
    editedLabels = garbage['edited_label'];
  }

  const company = currentUser.company || 'eXp Realty';
  const _label_list = await Label.find({
    user: currentUser.id,
  }).sort({ priority: -1 });

  const _label_admin = await Label.find({
    role: 'admin',
    _id: { $nin: editedLabels },
  }).sort({ priority: 1 });

  Array.prototype.push.apply(_label_list, _label_admin);

  if (!_label_list) {
    return res.status(400).json({
      status: false,
      error: 'Label doesn`t exist',
    });
  } else {
    res.send({
      status: true,
      data: _label_list,
    });
  }
};

const update = async (req, res) => {
  const data = req.body;
  const { currentUser } = req;
  Label.updateOne(
    {
      _id: req.params.id,
      user: currentUser.id,
    },
    { $set: data }
  )
    .then(() => {
      res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(500).json({
        status: false,
        error: err.message || 'Label Update Error',
      });
    });
};

const remove = (req, res) => {
  const { currentUser } = req;

  Label.deleteOne({
    _id: req.params.id,
    user: currentUser.id,
  })
    .then(() => {
      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      res.status(500).send({
        status: false,
        error: err.message || 'Label Delete Error',
      });
    });
};

const changeOrder = async (req, res) => {
  const { data } = req.body;
  const { currentUser } = req;

  for (let i = 0; i < data.length; i++) {
    await Label.updateOne(
      { _id: data[i]._id, user: currentUser._id },
      { $set: { priority: i } }
    );
  }

  return res.send({
    status: true,
  });
};

module.exports = {
  create,
  getAll,
  update,
  remove,
  changeOrder,
};
