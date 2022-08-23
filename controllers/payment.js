const api = require('../config/api');
const system_settings = require('../config/system_settings');
const urls = require('../constants/urls');
const Payment = require('../models/payment');
const User = require('../models/user');
const Notification = require('../models/notification');

const stripeKey = api.STRIPE.SECRET_KEY;

const stripe = require('stripe')(stripeKey);

const get = async (req, res) => {
  const { currentUser } = req;
  if (!currentUser.payment || currentUser.payment === 'undefined') {
    return res.status(400).json({
      status: false,
      error: 'Payment doesn`t exist',
    });
  }
  //   if (!req.params.id || req.params.id == 'undefined') {
  //     return res.status(400).json({
  //         status: false,
  //         error: 'Payment doesn`t exist'
  //     })
  //   }

  const data = await Payment.findOne({ _id: req.params.id }).catch((err) => {
    console.log('err', err);
  });
  if (!data) {
    return res.status(400).json({
      status: false,
      error: 'Payment doesn`t exist',
    });
  }
  data['bill_amount'] = system_settings.SUBSCRIPTION_MONTHLY_PLAN.BASIC;

  data.save().catch((err) => {
    console.log('err', err);
  });

  res.send({
    status: true,
    data,
  });
};

const create = async (payment_data) => {
  return new Promise(function (resolve, reject) {
    const { user_name, email, token, referral, level, is_trial } = payment_data;
    createCustomer(user_name, email, referral).then((customer) => {
      stripe.customers.createSource(
        customer.id,
        { source: token.id },
        function (err, card) {
          if (err) {
            console.log('card error', err);
          }
          if (!card) {
            reject('Card is null');
            return;
          }
          if (card['cvc_check'] === 'unchecked') {
            reject('CVC is unchecked');
            return;
          }

          const bill_amount = system_settings.SUBSCRIPTION_MONTHLY_PLAN[level];
          const pricingPlan = api.STRIPE.PLAN[level];
          createSubscription(customer.id, pricingPlan, card.id, is_trial)
            .then(async (subscripition) => {
              // Save card information to DB.
              const payment = new Payment({
                email,
                customer_id: customer.id,
                plan_id: pricingPlan,
                token: token.id,
                subscription: subscripition.id,
                bill_amount,
                card_id: card.id,
                card_name: token.card_name,
                card_brand: token.card.brand,
                fingerprint: card.fingerprint,
                exp_month: token.card.exp_month,
                exp_year: token.card.exp_year,
                last4: token.card.last4,
                active: true,
                referral,
              });

              const _payment = await payment
                .save()
                .then()
                .catch((err) => {
                  console.log('err', err);
                });
              resolve(_payment);
            })
            .catch((err) => {
              reject(err.type);
            });
        }
      );
    });
  });
};

const update = async (req, res) => {
  const { token } = req.body;
  const { currentUser } = req;
  let level;
  if (currentUser.user_version === 'v1') {
    if (currentUser.package_level === 'PRO') {
      level = 'LITE';
    } else {
      return res.status(400).json({
        status: false,
        error:
          'Please contact support team because your plan is different than others',
      });
    }
  } else {
    level = currentUser.package_level || system_settings.DEFAULT_PACKAGE;
  }

  if (!currentUser.payment) {
    const payment_data = {
      user_name: currentUser.user_name,
      email: currentUser.email,
      token,
      level,
    };

    create(payment_data)
      .then((payment) => {
        // Save card information to DB.

        currentUser['payment'] = payment.id;
        currentUser
          .save()
          .then(() => {
            return res.send({
              status: true,
              data: payment,
            });
          })
          .catch((err) => {
            console.log('err', err);
          });
      })
      .catch((err) => {
        console.log('creating subscripition error', err);
        return res.status(400).send({
          status: false,
          error: err.type,
        });
      });
  }

  if (currentUser.payment) {
    const payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (err) => {
        console.log('err', err);
      }
    );

    if (!payment) {
      const payment_data = {
        user_name: currentUser.user_name,
        email: currentUser.email,
        token,
        level,
      };

      create(payment_data)
        .then((payment) => {
          // Save card information to DB.

          currentUser['payment'] = payment.id;
          currentUser
            .save()
            .then(() => {
              return res.send({
                status: true,
                data: payment,
              });
            })
            .catch((err) => {
              console.log('err', err);
            });
        })
        .catch((err) => {
          console.log('creating subscripition error', err);
          return res.status(400).send({
            status: false,
            error: err.type,
          });
        });
    } else {
      stripe.customers.retrieve(
        payment['customer_id'],
        function (err, customer) {
          if (err || customer['deleted']) {
            console.log('customer retrieve error', err);
            const payment_data = {
              user_name: currentUser.user_name,
              email: currentUser.email,
              token,
              level,
            };

            create(payment_data)
              .then((payment) => {
                // Save card information to DB.

                currentUser['payment'] = payment.id;
                currentUser
                  .save()
                  .then(() => {
                    return res.send({
                      status: true,
                      data: payment,
                    });
                  })
                  .catch((err) => {
                    console.log('err', err);
                  });
              })
              .catch((err) => {
                console.log('creating subscripition error', err);
                return res.status(400).send({
                  status: false,
                  error: err,
                });
              });
          } else {
            stripe.tokens.retrieve(token.id, function (err, _token) {
              // asynchronously called
              if (!_token) {
                return res.status(400).send({
                  status: false,
                  error: 'Card is not valid',
                });
              }
              if (payment['fingerprint'] !== _token.card.fingerprint) {
                stripe.customers.createSource(
                  payment['customer_id'],
                  { source: token.id },
                  function (err, card) {
                    if (!card) {
                      return res.status(400).send({
                        status: false,
                        error: 'Card is not valid',
                      });
                    }

                    stripe.customers
                      .update(payment['customer_id'], {
                        default_source: card.id,
                      })
                      .then(() => {
                        try {
                          stripe.customers.deleteSource(
                            payment['customer_id'],
                            payment['card_id'],
                            function (err, confirmation) {
                              if (err) {
                                console.log('delete source err', err);
                              }
                            }
                          );
                          // Save card information to DB.

                          if (customer.subscriptions) {
                            const subscription =
                              customer.subscriptions['data'][0];
                            if (subscription) {
                              payment['card_id'] = card.id;
                              payment['card_name'] = token.card_name;
                              payment['card_brand'] = token.card.brand;
                              payment['exp_month'] = token.card.exp_month;
                              payment['exp_year'] = token.card.exp_year;
                              payment['last4'] = token.card.last4;
                              payment['fingerprint'] = card.fingerprint;
                              payment['updated_at'] = new Date();
                              payment.save().catch((err) => {
                                console.log('err', err);
                              });

                              return res.send({
                                status: true,
                                data: currentUser.payment,
                              });
                            } else {
                              const bill_amount =
                                system_settings.SUBSCRIPTION_MONTHLY_PLAN[
                                  level
                                ];
                              const pricingPlan = api.STRIPE.PLAN[level];

                              createSubscription(
                                customer.id,
                                pricingPlan,
                                card.id
                              )
                                .then(async (subscripition) => {
                                  // Save card information to DB.
                                  payment['subscription'] = subscripition.id;
                                  payment['bill_amount'] = bill_amount;
                                  payment['card_id'] = card.id;
                                  payment['card_name'] = token.card_name;
                                  payment['card_brand'] = token.card.brand;
                                  payment['exp_month'] = token.card.exp_month;
                                  payment['exp_year'] = token.card.exp_year;
                                  payment['last4'] = token.card.last4;
                                  payment['fingerprint'] = card.fingerprint;
                                  payment['updated_at'] = new Date();
                                  payment.save().catch((err) => {
                                    console.log('err', err);
                                  });

                                  payment
                                    .save()
                                    .then()
                                    .catch((err) => {
                                      console.log('err', err);
                                    });

                                  payment.save().catch((err) => {
                                    console.log('err', err);
                                  });

                                  return res.send({
                                    status: true,
                                    data: currentUser.payment,
                                  });
                                })
                                .catch((err) => {
                                  return res.status(400).send({
                                    status: false,
                                    error: err.type,
                                  });
                                });
                            }
                          } else {
                            const payment_data = {
                              user_name: currentUser.user_name,
                              email: currentUser.email,
                              token,
                              level,
                            };

                            create(payment_data)
                              .then((payment) => {
                                // Save card information to DB.

                                currentUser['payment'] = payment.id;
                                currentUser
                                  .save()
                                  .then(() => {
                                    return res.send({
                                      status: true,
                                      data: payment,
                                    });
                                  })
                                  .catch((err) => {
                                    console.log('err', err);
                                  });
                              })
                              .catch((err) => {
                                console.log(
                                  'creating subscripition error',
                                  err
                                );
                                return res.status(400).send({
                                  status: false,
                                  error: err,
                                });
                              });
                          }
                        } catch (err) {
                          console.log('delete card err', err);
                        }
                      });
                    /**
                    const pricingPlan = api.STRIPE.PRIOR_PLAN;
                    const bill_amount =
                      system_settings.SUBSCRIPTION_MONTHLY_PLAN.BASIC;

                    updateSubscription(
                      payment['customer_id'],
                      pricingPlan,
                      card.id
                    )
                      .then((subscription) => {
                        console.log('update Subscription', subscription);
                        cancelSubscription(payment['subscription']).catch(
                          (err) => {
                            console.log('cancel subscription err', err);
                          }
                        );
                        try {
                          stripe.customers.deleteSource(
                            payment['customer_id'],
                            payment['card_id'],
                            function (err, confirmation) {
                              if (err) {
                                console.log('delete source err', err);
                              }
                            }
                          );
                          // Save card information to DB.
                          payment['plan_id'] = pricingPlan;
                          payment['bill_amount'] = bill_amount;
                          payment['token'] = token.id;
                          payment['card_id'] = card.id;
                          payment['card_name'] = token.card_name;
                          payment['card_brand'] = token.card.brand;
                          payment['exp_month'] = token.card.exp_month;
                          payment['exp_year'] = token.card.exp_year;
                          payment['last4'] = token.card.last4;
                          payment['subscription'] = subscription.id;
                          payment['fingerprint'] = card.fingerprint;
                          payment['updated_at'] = new Date();
                          payment.save().catch((err) => {
                            console.log('err', err);
                          });
                          return res.send({
                            status: true,
                            data: currentUser.payment,
                          });
                        } catch (err) {
                          console.log('delete card err', err);
                        }
                      })
                      .catch((err) => {
                        console.log('creating subscripition error', err);
                        return res.status(400).send({
                          status: false,
                          eror: err,
                        });
                      });
                     */
                  }
                );
              } else {
                const customer_id = payment['customer_id'];
                const card_id = payment['card_id'];
                stripe.customers.retrieveSource(
                  customer_id,
                  card_id,
                  function (err, card) {
                    if (err) {
                      stripe.customers.createSource(
                        payment['customer_id'],
                        { source: token.id },
                        function (err, card) {
                          console.log('_card', card);
                          if (err || !card) {
                            return res.status(400).send({
                              status: false,
                              error: 'Card is not valid',
                            });
                          }

                          const bill_amount =
                            system_settings.SUBSCRIPTION_MONTHLY_PLAN[level];
                          const pricingPlan = api.STRIPE.PLAN[level];

                          createSubscription(
                            payment['customer_id'],
                            pricingPlan,
                            card.id
                          )
                            .then((subscription) => {
                              console.log('update Subscription', subscription);
                              try {
                                // Save card information to DB.
                                payment['plan_id'] = pricingPlan;
                                payment['bill_amount'] = bill_amount;
                                payment['card_id'] = card.id;
                                payment['card_name'] = token.card_name;
                                payment['card_brand'] = token.card.brand;
                                payment['exp_month'] = token.card.exp_month;
                                payment['exp_year'] = token.card.exp_year;
                                payment['last4'] = token.card.last4;
                                payment['subscription'] = subscription.id;
                                payment['fingerprint'] = card.fingerprint;
                                payment['updated_at'] = new Date();
                                payment.save().catch((err) => {
                                  console.log('err', err);
                                });
                                return res.send({
                                  status: true,
                                  data: currentUser.payment,
                                });
                              } catch (err) {
                                console.log('delete card err', err);
                              }
                            })
                            .catch((err) => {
                              console.log('creating subscripition error', err);
                              return res.status(400).send({
                                status: false,
                                error: err,
                              });
                            });
                        }
                      );
                    } else {
                      if (customer.subscriptions) {
                        const subscription = customer.subscriptions['data'][0];
                        if (subscription) {
                          const card = {
                            name: token.card.name,
                            exp_month: token.card.exp_month,
                            exp_year: token.card.exp_year,
                          };

                          delete card.id;

                          updateCard(customer_id, card_id, card)
                            .then((_card) => {
                              // Save card information to DB.
                              payment['card_name'] = token.card_name;
                              payment['card_brand'] = token.card.brand;
                              payment['exp_month'] = token.card.exp_month;
                              payment['exp_year'] = token.card.exp_year;
                              payment['last4'] = token.card.last4;
                              payment['updated_at'] = new Date();
                              payment.save().catch((err) => {
                                console.log('err', err);
                              });

                              return res.send({
                                status: true,
                                data: currentUser.payment,
                              });
                            })
                            .catch((err) => {
                              return res.status(400).send({
                                status: false,
                                error: err,
                              });
                            });
                        } else {
                          const bill_amount =
                            system_settings.SUBSCRIPTION_MONTHLY_PLAN[level];
                          const pricingPlan = api.STRIPE.PLAN[level];

                          createSubscription(customer.id, pricingPlan, card.id)
                            .then(async (subscripition) => {
                              // Save card information to DB.
                              payment['subscription'] = subscripition.id;
                              payment['bill_amount'] = bill_amount;
                              payment['card_id'] = card.id;
                              payment['card_name'] = token.card_name;
                              payment['card_brand'] = token.card.brand;
                              payment['exp_month'] = token.card.exp_month;
                              payment['exp_year'] = token.card.exp_year;
                              payment['last4'] = token.card.last4;
                              payment['fingerprint'] = card.fingerprint;
                              payment['updated_at'] = new Date();
                              payment.save().catch((err) => {
                                console.log('err', err);
                              });

                              payment
                                .save()
                                .then()
                                .catch((err) => {
                                  console.log('err', err);
                                });

                              payment.save().catch((err) => {
                                console.log('err', err);
                              });

                              return res.send({
                                status: true,
                                data: currentUser.payment,
                              });
                            })
                            .catch((err) => {
                              return res.status(400).send({
                                status: false,
                                error: err.type,
                              });
                            });
                        }
                      }
                    }
                  }
                );
              }
            });
          }
        }
      );
    }
  }
};

const updateCustomerEmail = async (customer_id, email) => {
  // Create new customer
  return new Promise(function (resolve, reject) {
    stripe.customers.update(
      customer_id,
      { metadata: { email } },
      async (err) => {
        if (err) {
          console.log('err', err);
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
};

const createCustomer = async (user_name, email, referral) => {
  return new Promise((resolve, reject) => {
    stripe.customers.create(
      {
        name: user_name,
        email,
        metadata: { referral },
      },
      async (err, customer) => {
        if (err) {
          console.log('err', err);
          reject(err);
          return;
        }
        resolve(customer);
      }
    );
  });
};

const createSubscription = async (customerId, planId, cardId, is_trial) => {
  let data;
  if (is_trial) {
    data = {
      customer: customerId,
      items: [{ price: planId }],
      trial_period_days: system_settings.SUBSCRIPTION_FREE_TRIAL,
      default_source: cardId,
    };
  } else {
    data = {
      customer: customerId,
      items: [{ price: planId }],
      default_source: cardId,
    };
  }

  return new Promise(function (resolve, reject) {
    stripe.subscriptions.create(data, function (err, subscription) {
      console.log('creating subscription err', err);
      if (err != null) {
        return reject(err);
      }
      resolve(subscription);
    });
  });
};

const updateSubscription = async (data) => {
  const { customerId, planId, subscriptionId } = data;

  return new Promise(function (resolve, reject) {
    stripe.customers.retrieve(customerId, function (err, customer) {
      if (err) {
        console.log('update subscription error', err);
        return reject(err.type);
      }
      stripe.subscriptions.update(
        subscriptionId,
        {
          cancel_at_period_end: false,
          proration_behavior: 'create_prorations',
          items: [
            {
              id: customer.subscriptions['data'][0].id,
              price: planId,
            },
          ],
        },
        function (err, subscription) {
          if (err) {
            console.log('update subscription error', err);
            return reject(err.type);
          }
          resolve(subscription);
        }
      );
    });
  });
};

const cancelSubscription = async (subscription_id) => {
  return new Promise(function (resolve, reject) {
    stripe.subscriptions.del(subscription_id, function (err, confirmation) {
      if (err != null) {
        return reject(err);
      }
      resolve();
    });
  });
};

/**
 *
 * @param {customer id} id
 */
const deleteCustomer = async (id) => {
  return new Promise(function (resolve, reject) {
    stripe.customers.del(id, function (err, confirmation) {
      if (err) reject(err);
      resolve(confirmation);
    });
  });
};

/**
 *
 * @param {customer id} customerId
 * @param {cart id} cardId
 * @param {data} data
 * @qutation update card
 */
const updateCard = async (customerId, cardId, data) => {
  return new Promise(function (resolve, reject) {
    stripe.customers.updateSource(
      customerId,
      cardId,
      data,
      function (err, card) {
        if (err) {
          console.log('err', err);
          reject(err);
        }
        resolve(card);
      }
    );
  });
};

const cancelCustomer = async (id) => {
  const payment = await Payment.findOne({ _id: id }).catch((err) => {
    console.log('err', err);
  });
  return new Promise((resolve, reject) => {
    cancelSubscription(payment.subscription).catch((err) => {
      console.log('err', err);
    });

    deleteCustomer(payment.customer_id)
      .then(() => {
        resolve();
      })
      .catch((err) => {
        console.log('err', err);
        reject();
      });
  });
};

const paymentFailed = async (req, res) => {
  const invoice = req.body.data;
  const customer_id = invoice['object']['customer'];
  const attempt_count = invoice['object']['attempt_count'];

  const payment = await Payment.findOne({
    customer_id,
  }).catch((err) => {
    console.log('payment find err', err.message);
  });

  const user = await User.findOne({
    payment,
    del: false,
  }).catch((err) => {
    console.log('user find err', err.message);
  });

  user['subscription']['is_failed'] = true;
  user['subscription']['updated_at'] = new Date();
  user['subscription']['attempt_count'] = attempt_count;
  user['updated_at'] = new Date();

  if (attempt_count === 4) {
    user['subscription']['is_suspended'] = true;
    user['subscription']['suspended_at'] = new Date();
  }

  user.save().catch((err) => {
    console.log('err', err.message);
  });

  const notification = new Notification({
    type: 'personal',
    criteria: 'subscription_failed',
    content: `Your payment for your crmgrow account has failed. Please update cc card info at <a href="${urls.BILLING_URL}" style="color:black;">billing page</a>`,
    user: user.id,
  });

  notification.save().catch((err) => {
    console.log('err', err.message);
  });

  return res.send({
    status: true,
  });
};

const paymentSucceed = async (req, res) => {
  const invoice = req.body.data;
  const customer_id = invoice['object']['customer'];
  const payment = await Payment.findOne({ customer_id }).catch((err) => {
    console.log('err', err);
  });
  const user = await User.findOne({ payment: payment.id, del: false }).catch(
    (err) => {
      console.log('err', err);
    }
  );

  user['subscription']['is_failed'] = false;
  user['subscription']['attempt_count'] = 0;
  user['subscription']['is_suspended'] = false;
  user['subscription']['updated_at'] = new Date();

  if (user) {
    const subscription = {
      is_false: false,
      attempt_count: 0,
      is_suspended: false,
      updated_at: new Date(),
      amount: invoice['object']['amount_paid'],
    };

    User.updateOne(
      {
        _id: user.id,
      },
      {
        $set: {
          is_trial: false,
          subscription,
        },
      }
    ).catch((err) => {
      console.log('user update subscription err', err.message);
    });

    Notification.deleteMany({
      type: 'personal',
      criteria: 'subscription_failed',
      user: user.id,
    }).catch((err) => {
      console.log('notification delete error', err.message);
    });

    return res.send({
      status: true,
    });
  } else {
    console.log('Payment not found for user: ', customer_id);
    return res.status(400).json({
      status: false,
      error: `Couldn't find user ${customer_id}`,
    });
  }
};

const createCharge = async (data) => {
  const { card_id, customer_id, amount, description } = data;
  return stripe.charges.create({
    amount,
    currency: 'usd',
    customer: customer_id,
    description,
  });
};

const getTransactions = async (req, res) => {
  const { currentUser } = req;
  let payment;

  if (currentUser.payment) {
    payment = await Payment.findOne({ _id: currentUser.payment }).catch(
      (err) => {
        console.log('err', err);
      }
    );
  } else {
    return res.send({
      status: true,
      data: [],
    });
  }

  if (payment) {
    const customer_id = payment.customer_id;
    stripe.charges.list({ customer: customer_id }, async (err, charges) => {
      if (err) {
        console.log('payment history find err', err);
        return res.status(400).json({
          status: false,
          error: err,
        });
      }
      const charge_list = charges.data;
      const data = [];
      for (let i = 0; i < charge_list.length; i++) {
        if (charge_list[i].invoice) {
          const invoice = await stripe.invoices.retrieve(
            charge_list[i].invoice
          );
          const charge = {
            id: charge_list[i].id,
            amount: charge_list[i].amount / 100,
            status: charge_list[i].status,
            description: charge_list[i].description,
            customer: charge_list[i].customer,
            date: charge_list[i].created * 1000,
            invoice_pdf: invoice.invoice_pdf,
          };
          data.push(charge);
        } else {
          const charge = {
            id: charge_list[i].id,
            amount: charge_list[i].amount / 100,
            status: charge_list[i].status,
            description: charge_list[i].description,
            customer: charge_list[i].customer,
            date: charge_list[i].created * 1000,
          };
          data.push(charge);
        }
      }
      return res.send({
        status: true,
        data,
      });
    });
  } else {
    return res.send({
      status: true,
      data: [],
    });
  }
};

module.exports = {
  get,
  create,
  update,
  updateSubscription,
  createCharge,
  cancelCustomer,
  getTransactions,
  paymentFailed,
  paymentSucceed,
  updateCustomerEmail,
  cancelSubscription,
  deleteCustomer,
};
