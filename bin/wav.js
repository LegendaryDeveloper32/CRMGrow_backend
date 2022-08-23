const request = require('request-promise');

const VENDOR_ID = 'k8d8BvqFWV9rSTwZyGed64Dc0SbjSQ6D';
const API_KEY =
  'q6Oggy7to8EEgSyJTwvinjslHitdRjuC76UEtw8kxyGRDAlF1ogg3hc4WzW2vnzc';

const requestAuth = () => {
  const body = {
    id: '123456',
    email: 'super@crmgrow.com',
    firstName: 'Garrett',
    lastName: 'Steve',
    phone: '3127678603',
    address1: '442 w elm st',
    city: 'Chicago',
    state: 'IL',
    zip: '60610',
    subscriptions: {
      multi: true,
      sms: true,
    },
    test: true,
  };

  var options = {
    method: 'POST',
    url: 'https://app.stormapp.com/api/customers',
    headers: {
      'Content-Type': 'application/json',
    },
    auth: {
      user: VENDOR_ID,
      password: API_KEY,
    },
    body,
    json: true,
  };

  request(options, function (error, response, data) {
    if (error) throw new Error(error);

    console.log(data);
  });
};

requestAuth();
