const mongoose = require('mongoose');
const User = require('../models/user');
const TimeLine = require('../models/time_line');
const { ENV_PATH } = require('../config/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../config/database');

mongoose.set('useCreateIndex', true);
mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

const due_date = '2021-04-14T21:04:00.000+00:00';
const due_date_old = '2021-04-14T21:03:00.000+00:00';
const time_line = async () => {
  const time_lines = await TimeLine.find({
    user: mongoose.Types.ObjectId('606cc58a3ae225640fd0e2d5'),
    due_date: { $lte: new Date(due_date), $gt: new Date(due_date_old) },
  });
  console.log('time_lines', time_lines);
};

time_line();
