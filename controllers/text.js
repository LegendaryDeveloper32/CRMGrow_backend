const phone = require('phone');
const mongoose = require('mongoose');

const User = require('../models/user');
const Contact = require('../models/contact');
const Activity = require('../models/activity');
const Text = require('../models/text');
const Payment = require('../models/payment');
const PaymentCtrl = require('./payment');
const urls = require('../constants/urls');
const api = require('../config/api');
const system_settings = require('../config/system_settings');

const accountSid = api.TWILIO.TWILIO_SID;
const authToken = api.TWILIO.TWILIO_AUTH_TOKEN;
const twilio = require('twilio')(accountSid, authToken);
const AWS = require('aws-sdk');
const moment = require('moment-timezone');

const ses = new AWS.SES({
  accessKeyId: api.AWS.AWS_ACCESS_KEY,
  secretAccessKey: api.AWS.AWS_SECRET_ACCESS_KEY,
  region: api.AWS.AWS_SES_REGION,
  apiVersion: '2010-12-01',
});

const { RestClient } = require('@signalwire/node');
const VideoTracker = require('../models/video_tracker');
const { sendNotificationEmail } = require('../helpers/email');
const PDFTracker = require('../models/pdf_tracker');
const ImageTracker = require('../models/image_tracker');
const Video = require('../models/video');
const Image = require('../models/image');
const PDF = require('../models/pdf');

const client = new RestClient(api.SIGNALWIRE.PROJECT_ID, api.SIGNALWIRE.TOKEN, {
  signalwireSpaceUrl: api.SIGNALWIRE.WORKSPACE_DOMAIN,
});

const getAll = async (req, res) => {
  const { currentUser } = req;
  const data = [];
  const contacts = await Text.aggregate([
    {
      $match: {
        user: currentUser._id,
      },
    },
    {
      $group: {
        _id: '$contacts',
        content: { $last: '$content' },
        created_at: { $last: '$created_at' },
        updated_at: { $last: '$updated_at' },
        type: { $last: '$type' },
        text_id: { $last: '$id' },
        status: { $last: '$status' },
      },
    },
    {
      $lookup: {
        from: 'contacts',
        localField: '_id',
        foreignField: '_id',
        as: 'contacts',
      },
    },
  ]);

  return res.send({
    status: true,
    data: contacts,
  });
};

const send = async (req, res) => {
  const { currentUser } = req;
  const { text } = req.body;
  const contact = await Contact.findOne({ _id: req.params.id }).catch((err) => {
    console.log('err', err);
  });
  const e164Phone = phone(contact.cell_phone)[0];
  let fromNumber = currentUser['proxy_number'];

  if (!fromNumber) {
    const areaCode = currentUser.cell_phone.substring(1, 4);
    const data = await twilio.availablePhoneNumbers('US').local.list({
      areaCode,
    });

    const number = data[0];
    const proxy_number = await twilio.incomingPhoneNumbers.create({
      phoneNumber: number.phoneNumber,
      smsUrl: urls.SMS_RECEIVE_URL,
    });
    currentUser['proxy_number'] = proxy_number.phoneNumber;
    fromNumber = currentUser['proxy_number'];
    currentUser.save().catch((err) => {
      console.log('err', err);
    });
  }

  console.info(`Send SMS: ${fromNumber} -> ${contact.cell_phone} :`, text);

  if (!e164Phone) {
    return res.status(400).send({
      status: false,
      error: 'Invalid phone number',
    });
  }

  await twilio.messages
    .create({ from: fromNumber, body: text, to: e164Phone })
    .catch((err) => {
      console.log('err', err);
    });

  const new_text = new Text({
    content: req.body.text,
    contact: req.params.id,
    to: e164Phone,
    from: fromNumber,
    user: currentUser.id,
  });

  new_text
    .save()
    .then((_sms) => {
      const activity = new Activity({
        content: currentUser.user_name + ' sent text',
        contacts: _sms.contact,
        user: currentUser.id,
        type: 'texts',
        text: _sms.id,
      });

      activity.save().then((_activity) => {
        const myJSON = JSON.stringify(_sms);
        const data = JSON.parse(myJSON);
        data.activity = _activity;
        res.send({
          status: true,
          data,
        });
      });
    })
    .catch((e) => {
      let errors;
      if (e.errors) {
        errors = e.errors.map((err) => {
          delete err.instance;
          return err;
        });
      }
      return res.status(500).send({
        status: false,
        error: errors || e,
      });
    });
};

const receive = async (req, res) => {
  const text = req.body['Body'];
  const from = req.body['From'];
  const to = req.body['To'];

  const currentUser = await User.findOne({ twilio_number: to }).catch((err) => {
    console.log('current user found err sms', err.message);
  });

  if (currentUser != null) {
    const phoneNumber = req.body['From'];

    const contact = await Contact.findOne({
      cell_phone: phoneNumber,
      user: currentUser.id,
    }).catch((err) => {
      console.log('contact found err sms reply', err);
    });

    // let phoneNumberString
    // if(currentUser.phone) {
    //   const userPhone = currentUser.phone
    //   phoneNumberString = userPhone.internationalNumber
    // } else {
    //   phoneNumberString = TextHelper.matchUSPhoneNumber(currentUser.cell_phone)
    // }

    // if (!e164Phone) {
    //   const error = {
    //     error: 'Invalid Phone Number'
    //   }

    //   throw error // Invalid phone number
    // }

    if (contact) {
      const content =
        contact.first_name +
        ', please call/text ' +
        currentUser.user_name +
        ' back at: ' +
        currentUser.cell_phone;
      await twilio.messages
        .create({ from: to, body: content, to: from })
        .catch((err) => {
          console.log('sms reply err', err);
        });
    }

    // const sms = new SMS({
    //   content: text,
    //   contact: contact.id,
    //   to: currentUser.cell_phone,
    //   from: from,
    //   user: currentUser.id,
    //   updated_at: new Date(),
    //   created_at: new Date(),
    // })

    // const _sms = await sms.save()

    // const activity = new Activity({
    //   content: contact.first_name + ' replied text',
    //   contacts: contact.id,
    //   user: currentUser.id,
    //   type: 'sms',
    //   sms: _sms.id,
    //   created_at: new Date(),
    //   updated_at: new Date(),
    // })

    // activity.save()
  }
  return res.send({
    status: true,
  });
};

const receive1 = async (req, res) => {
  const text = req.body['Body'];
  const from = req.body['From'];
  const to = req.body['To'];

  const currentUser = await User.findOne({ proxy_number: to }).catch((err) => {
    console.log('current user found err sms', err.message);
  });

  if (currentUser != null) {
    const phoneNumber = req.body['From'];

    const contact = await Contact.findOne({
      cell_phone: phoneNumber,
      user: currentUser.id,
    }).catch((err) => {
      console.log('contact found err sms reply', err);
    });

    if (contact) {
      if (text.toLowerCase() === 'stop') {
        const activity = new Activity({
          content: 'unsubscribed sms',
          contacts: contact.id,
          user: currentUser.id,
          type: 'sms_trackers',
          created_at: new Date(),
          updated_at: new Date(),
        });

        const _activity = await activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: { last_activity: _activity.id },
            $push: { tags: { $each: ['unsubscribed'] } },
          }
        ).catch((err) => {
          console.log('err', err);
        });
        const content =
          'You have successfully been unsubscribed. You will not receive any more messages from this number.';

        await client.messages
          .create({
            from: to,
            to: from,
            body: content,
          })
          .catch((err) => {
            console.log('sms reply err', err);
          });
      } else {
        const content =
          contact.first_name +
          ', please call/text ' +
          currentUser.user_name +
          ' back at: ' +
          currentUser.cell_phone;

        await client.messages
          .create({
            from: to,
            to: from,
            body: content,
          })
          .catch((err) => {
            console.log('sms reply err', err);
          });
      }
    }
  }
  return res.send({
    status: true,
  });
};

const get = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;
  const data = await Text.find({ user: currentUser.id, contacts: contact });

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

const receiveTextSignalWire = async (req, res) => {
  const text = req.body['Body'];
  const from = req.body['From'];
  const to = req.body['To'];

  const currentUser = await User.findOne({ proxy_number: to }).catch((err) => {
    console.log('current user found err text', err.message);
  });

  if (currentUser) {
    const phoneNumber = req.body['From'];

    const contact = await Contact.findOne({
      $or: [
        { cell_phone: phoneNumber, user: currentUser.id },
        { cell_phone: phoneNumber, shared_members: currentUser.id },
      ],
    }).catch((err) => {
      console.log('contact found err sms reply', err);
    });

    if (contact) {
      if (text.toLowerCase() === 'stop') {
        const activity = new Activity({
          content: 'unsubscribed sms',
          contacts: contact.id,
          user: currentUser.id,
          type: 'text_trackers',
          created_at: new Date(),
          updated_at: new Date(),
        });

        activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: { last_activity: activity.id },
            $push: { tags: { $each: ['unsubscribed'] } },
          }
        ).catch((err) => {
          console.log('err', err);
        });
        const content =
          'You have successfully been unsubscribed. You will not receive any more messages from this number.';

        await client.messages
          .create({
            from: to,
            to: from,
            body: content,
          })
          .catch((err) => {
            console.log('sms reply err', err);
          });
      } else {
        const new_text = new Text({
          user: currentUser.id,
          contacts: contact.id,
          content: text,
          status: 0,
          type: 1,
        });

        new_text.save().catch((err) => {
          console.log('new text save err', err.message);
        });

        const activity = new Activity({
          content: 'received text',
          contacts: contact.id,
          user: currentUser.id,
          type: 'texts',
          texts: new_text.id,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: { last_activity: activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
      }
    } else {
      const content =
        'Please call/text ' +
        currentUser.user_name +
        'back at: ' +
        currentUser.cell_phone;

      await client.messages
        .create({
          from: to,
          to: from,
          body: content,
        })
        .catch((err) => {
          console.log('sms reply err', err);
        });
    }
  }
  return res.send();
};

const receiveTextTwilio = async (req, res) => {
  const text = req.body['Body'];
  const from = req.body['From'];
  const to = req.body['To'];

  const currentUser = await User.findOne({ twilio_number: to }).catch((err) => {
    console.log('current user found err sms', err.message);
  });

  if (currentUser != null) {
    const phoneNumber = req.body['From'];

    const contact = await Contact.findOne({
      cell_phone: phoneNumber,
      user: currentUser.id,
    }).catch((err) => {
      console.log('contact found err sms reply', err);
    });

    if (contact) {
      if (text.toLowerCase() === 'stop') {
        const activity = new Activity({
          content: 'unsubscribed sms',
          contacts: contact.id,
          user: currentUser.id,
          type: 'text_trackers',
          created_at: new Date(),
          updated_at: new Date(),
        });

        const _activity = await activity
          .save()
          .then()
          .catch((err) => {
            console.log('err', err);
          });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: { last_activity: _activity.id },
            $push: { tags: { $each: ['unsubscribed'] } },
          }
        ).catch((err) => {
          console.log('err', err);
        });
        const content =
          'You have successfully been unsubscribed. You will not receive any more messages from this number.';

        await client.messages
          .create({
            from: to,
            to: from,
            body: content,
          })
          .catch((err) => {
            console.log('sms reply err', err);
          });
      } else {
        const new_text = new Text({
          user: currentUser.id,
          contacts: contact.id,
          content: text,
          status: 0,
          type: 1,
        });

        new_text.save().catch((err) => {
          console.log('new text save err', err.message);
        });

        const activity = new Activity({
          content: 'received text',
          contacts: contact.id,
          user: currentUser.id,
          type: 'texts',
          texts: new_text.id,
        });

        activity.save().catch((err) => {
          console.log('activity save err', err.message);
        });

        Contact.updateOne(
          { _id: contact.id },
          {
            $set: { last_activity: activity.id },
          }
        ).catch((err) => {
          console.log('err', err);
        });
      }
    } else {
      const content =
        'Please call/text ' +
        currentUser.user_name +
        ' back at: ' +
        currentUser.cell_phone;

      await twilio.messages
        .create({ from: to, body: content, to: from })
        .catch((err) => {
          console.log('sms reply err', err);
        });
    }
  }
  return res.send();
};

const searchNumbers = async (req, res) => {
  const { currentUser } = req;
  let areaCode;
  let countryCode;
  const data = [];
  const phone = currentUser.phone;
  if (phone) {
    areaCode = phone.areaCode;
    countryCode = phone.countryCode;
  } else {
    areaCode = currentUser.cell_phone.substring(1, 4);
    countryCode = 'US';
  }

  const search_code = req.body.searchCode || areaCode;

  if (search_code) {
    twilio
      .availablePhoneNumbers(countryCode)
      .local.list({
        areaCode: search_code,
      })
      .then(async (response) => {
        const number = response[0];

        if (typeof number === 'undefined' || number === '+') {
          return res.send({
            status: true,
            data: [],
          });
        } else {
          const length = response.length > 5 ? 5 : response.length;
          for (let i = 0; i < length; i++) {
            data.push({
              number: response[i].phoneNumber,
              region: response[i].region,
              locality: response[i].locality,
            });
          }

          return res.send({
            status: true,
            data,
          });
        }
      })
      .catch((err) => {
        return res.status(500).json({
          status: false,
          error: err.message || err,
        });
      });
  } else {
    return res.send({
      status: true,
      data,
    });
  }

  /** 
  if (countryCode === 'US' || countryCode === 'CA') {
    client
      .availablePhoneNumbers(countryCode)
      .local.list({
        areaCode: search_code,
      })
      .then(async (available_phone_numbers) => {
        if (available_phone_numbers && available_phone_numbers.length > 0) {
          available_phone_numbers.forEach((number) => {
            data.push({
              number: number.phoneNumber,
              region: number.region,
              service: 'signalwire',
            });
          });

          for (let i = 0; i < 3; i++) {
            const number = available_phone_numbers[i];
            if (number) {
              data.push({
                number: number.phoneNumber,
                region: number.region,
                service: 'signalwire',
              });
            }
          }
          return res.send({
            status: true,
            data,
          });
        } else {
          twilio
            .availablePhoneNumbers(countryCode)
            .local.list({
              areaCode: search_code,
            })
            .then((response) => {
              const number = response[0];
              if (typeof number === 'undefined' || number === '+') {
                return res.status(400).json({
                  status: false,
                  error: 'Numbers not found',
                });
              } else {
                for (let i = 0; i < 3; i++) {
                  const number = response[i];
                  if (number) {
                    data.push({
                      number: number.phoneNumber,
                      region: number.region,
                      service: 'twilio',
                    });
                  }
                }

                return res.send({
                  status: true,
                  data,
                });
              }
            })
            .catch((err) => {
              return res.status(500).json({
                status: false,
                error: err.message || err,
              });
            });
        }
      })
      .catch((err) => {
        console.log('phone number get err', err);
      });
  } else {
    twilio
      .availablePhoneNumbers(countryCode)
      .local.list({
        areaCode,
      })
      .then(async (response) => {
        const number = data[0];

        if (typeof number === 'undefined' || number === '+') {
          return res.status(400).json({
            status: false,
            error: 'Numbers not found',
          });
        } else {
          response.forEach((number) => {
            data.push({
              number: number.phoneNumber,
              service: 'twilio',
            });
          });
          return res.send({
            status: true,
            data,
          });
        }
      })
      .catch((err) => {
        return res.status(500).json({
          status: false,
          error: err.message || err,
        });
      });
  }
  */
};

const buyNumbers = async (req, res) => {
  const { currentUser } = req;
  // if (req.body.service === 'signalwire') {
  //   client.incomingPhoneNumbers
  //     .create({
  //       friendlyName: currentUser.user_name,
  //       phoneNumber: req.body.number,
  //       smsUrl: urls.SMS_RECEIVE_URL1,
  //     })
  //     .then((incoming_phone_number) => {
  //       User.updateOne(
  //         { _id: currentUser.id },
  //         {
  //           $set: {
  //             proxy_number: req.body.number,
  //             proxy_number_id: incoming_phone_number.sid,
  //           },
  //         }
  //       ).catch((err) => {
  //         console.log('err', err.message);
  //       });

  //       return res.send({
  //         status: true,
  //       });
  //     })
  //     .catch((err) => {
  //       return res.status(400).json({
  //         status: false,
  //         error: err.message,
  //       });
  //     });
  // } else {

  twilio.incomingPhoneNumbers
    .create({
      friendlyName: currentUser.user_name,
      phoneNumber: req.body.number,
      smsUrl: urls.SMS_RECEIVE_URL,
    })
    .then((incoming_phone_number) => {
      User.updateOne(
        { _id: currentUser.id },
        {
          $set: {
            twilio_number: req.body.number,
            twilio_number_id: incoming_phone_number.sid,
          },
        }
      ).catch((err) => {
        console.log('err', err.message);
      });

      return res.send({
        status: true,
      });
    })
    .catch((err) => {
      console.log('proxy number error', err);
    });
  // }
};

const buyCredit = async (req, res) => {
  const { currentUser } = req;
  let payment;

  if (currentUser.payment) {
    payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (err) => {
        console.log('by sms credit err', err.message);
      }
    );
  }

  if (payment) {
    let price;
    let amount;
    const description = 'Buy sms credit';

    if (req.body.option === 1) {
      price = system_settings.SMS_CREDIT[0].PRICE;
      amount = system_settings.SMS_CREDIT[0].AMOUNT;
    } else if (req.body.option === 2) {
      price = system_settings.SMS_CREDIT[1].PRICE;
      amount = system_settings.SMS_CREDIT[1].AMOUNT;
    } else if (req.body.option === 3) {
      price = system_settings.SMS_CREDIT[2].PRICE;
      amount = system_settings.SMS_CREDIT[2].AMOUNT;
    }

    const data = {
      card_id: payment.card_id,
      customer_id: payment.customer_id,
      receipt_email: currentUser.email,
      amount: price,
      description,
    };

    PaymentCtrl.createCharge(data)
      .then((_res) => {
        let { additional_credit } = currentUser.text_info;
        if (additional_credit) {
          additional_credit.updated_at = new Date();
          additional_credit.amount += amount;
        } else {
          additional_credit = {
            updated_at: new Date(),
            amount,
          };
        }

        User.updateOne(
          { _id: currentUser.id },
          {
            $set: {
              'text_info.additional_credit': additional_credit,
            },
          }
        ).catch((err) => {
          console.log('user paid demo update err', err.message);
        });

        const time_zone = currentUser.time_zone_info
          ? JSON.parse(currentUser.time_zone_info).tz_name
          : system_settings.TIME_ZONE;

        const data = {
          template_data: {
            user_name: currentUser.user_name,
            created_at: moment().tz(time_zone).format('h:mm MMMM Do, YYYY'),
            last_4_cc: payment.last4,
            invoice_id: _res.invoice || '',
            amount: price / 100,
          },
          template_name: 'PaymentNotification',
          required_reply: true,
          email: currentUser.email,
        };

        sendNotificationEmail(data);

        return res.send({
          status: true,
        });
      })
      .catch((_err) => {
        console.log('buys sms err', _err.message);
      });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Payment information isn`t correct, please contact support team',
    });
  }
};

const markAsRead = async (req, res) => {
  Text.updateOne(
    {
      _id: req.params.id,
    },
    {
      $set: {
        status: 1,
      },
    }
  ).catch((err) => {
    console.log('text update err', err.message);
  });

  return res.send({
    status: true,
  });
};

const loadFiles = async (req, res) => {
  const { currentUser } = req;
  const { contact } = req.body;

  const videoIds = [];
  const pdfIds = [];
  const imageIds = [];
  let videos = [];
  let pdfs = [];
  let images = [];
  let videoTrackers = [];
  let imageTrackers = [];
  let pdfTrackers = [];
  const videoActivities = [];
  const pdfActivities = [];
  const imageActivities = [];
  const sendAtIndex = {};
  const texts = await Text.find({
    user: currentUser._id,
    contacts: contact,
  })
    .select('_id')
    .catch((err) => {
      console.log('Finding contact text is failed', err);
    });
  if (texts && texts.length) {
    const textIds = texts.map((e) => e._id);
    const sendActivities = await Activity.find({
      texts: { $in: textIds },
      type: { $in: ['videos', 'pdfs', 'images'] },
    }).catch((err) => {
      console.log('Sending Activity getting is failed', err);
    });

    sendActivities.forEach((e) => {
      switch (e.type) {
        case 'videos':
          videoIds.push(e.videos[0]);
          videoActivities.push(e._id);
          if (sendAtIndex[e.videos[0]]) {
            sendAtIndex[e.videos[0]].push(e.updated_at);
          } else {
            sendAtIndex[e.videos[0]] = [e.updated_at];
          }
          break;
        case 'pdfs':
          pdfIds.push(e.pdfs[0]);
          pdfActivities.push(e._id);
          if (sendAtIndex[e.pdfs[0]]) {
            sendAtIndex[e.pdfs[0]].push(e.updated_at);
          } else {
            sendAtIndex[e.pdfs[0]] = [e.updated_at];
          }
          break;
        case 'images':
          imageIds.push(e.images[0]);
          imageActivities.push(e._id);
          if (sendAtIndex[e.images[0]]) {
            sendAtIndex[e.images[0]].push(e.updated_at);
          } else {
            sendAtIndex[e.images[0]] = [e.updated_at];
          }
          break;
      }
    });

    if (videoActivities.length) {
      videoTrackers = await VideoTracker.find({
        contact,
        activity: { $in: videoActivities },
      }).catch((err) => {
        console.log('Video Tracking getting failed');
      });
      videos = await Video.find({
        _id: { $in: videoIds },
      })
        .select('_id title preview thumbnail duration')
        .catch((err) => {
          console.log('video getting failed');
        });
    }
    if (pdfActivities.length) {
      pdfTrackers = PDFTracker.find({
        contact,
        activity: { $in: pdfActivities },
      }).catch((err) => {
        console.log('PDF Tracking getting failed');
      });
      pdfs = await PDF.find({
        _id: { $in: pdfIds },
      })
        .select('_id title preview')
        .catch((err) => {
          console.log('pdf getting failed');
        });
    }
    if (imageActivities.length) {
      imageTrackers = ImageTracker.find({
        contact,
        activity: { $in: imageActivities },
      }).catch((err) => {
        console.log('Image Tracking getting failed');
      });
      images = await Image.find({
        _id: { $in: imageIds },
      })
        .select('_id title preview')
        .catch((err) => {
          console.log('image getting failed');
        });
    }
  }

  return res.send({
    status: true,
    data: {
      videos,
      pdfs,
      images,
      videoTrackers,
      imageTrackers,
      pdfTrackers,
      sendAtIndex,
    },
  });
};

module.exports = {
  get,
  getAll,
  send,
  receive,
  receive1,
  searchNumbers,
  buyNumbers,
  buyCredit,
  receiveTextSignalWire,
  receiveTextTwilio,
  markAsRead,
  loadFiles,
};
