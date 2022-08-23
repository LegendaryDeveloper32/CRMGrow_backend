// const mongoose = require('mongoose');
// const User = require('../models/user')
// const { DB_PORT } = require('../config/database');

// mongoose.set('useCreateIndex', true)
// mongoose.connect(DB_PORT, {useNewUrlParser: true})
// .then(() => console.log('Connecting to database successful'))
// .catch(err => console.error('Could not connect to mongo DB', err))
// //Fetch or read data from
// const migrate = async() => {
//   const users = await User.find({}).catch(err=>{
//     console.log('err', err)
//   })
//   for(let i=0; i<users.length; i++){
//     const user = users[i]
//     user['del'] = false
//     if(user.payment.length===0){
//       user.payment = undefined
//     }
//     user.save().catch(err=>{
//       console.log('err', err)
//     })
//   }
// }
// migrate();
// const mongoose = require('mongoose');
// const User = require('../models/user')
// const { DB_PORT } = require('../config/database');

// mongoose.set('useCreateIndex', true)
// mongoose.connect(DB_PORT, {useNewUrlParser: true})
// .then(() => console.log('Connecting to database successful'))
// .catch(err => console.error('Could not connect to mongo DB', err))
// //Fetch or read data from
// const migrate = async() => {
//   const users = await User.find({}).catch(err=>{
//     console.log('err', err)
//   })
//   for(let i=0; i<users.length; i++){
//     const user = users[i]
//     user['admin_loggin'] = false
//     user.save().catch(err=>{
//       console.log('err', err)
//     })
//   }
// }
// migrate();

const mongoose = require('mongoose');
const User = require('../models/user');
const Contact = require('../models/contact');
const { ENV_PATH } = require('../config/path');

require('dotenv').config({ path: ENV_PATH });
const { DB_PORT } = require('../config/database');

mongoose.set('useCreateIndex', true);
mongoose
  .connect(DB_PORT, { useNewUrlParser: true })
  .then(() => console.log('Connecting to database successful'))
  .catch((err) => console.error('Could not connect to mongo DB', err));

// Fetch or read data from
const migrate = async () => {
  User.updateMany(
    {
      del: false,
    },
    {
      $set: {
        'text_info.count': 0,
      },
    }
  )
    .then(() => {
      console.log('text count update finished');
    })
    .catch((err) => {
      console.log('user update err', err.message);
    });
};
migrate();
