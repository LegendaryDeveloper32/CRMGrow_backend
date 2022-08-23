const system_settings = {
  SUBSCRIPTION_MONTHLY_PLAN: {
    BASIC: '29',
    TEAM: '25',
  },
  SUBSCRIPTION_FREE_TRIAL: 14,
  DEFAULT_PACKAGE: 'PRO',
  EMAIL_ONE_TIME: 15,
  EMAIL_DAILY_LIMIT: {
    BASIC: 500,
    GMAIL: 500,
    GSUIT: 1500,
    OUTLOOK: 300,
    MICROSOFT: 2000,
  },
  TEXT_ONE_TIME: 15,
  TEXT_MONTHLY_LIMIT: {
    PRO: 250,
    ELITE: 750,
  },
  ASSISTANT_LIMIT: {
    PRO: 1,
    ELITE: 3,
  },
  CALENDAR_LIMIT: {
    PRO: 1,
    ELITE: 3,
  },
  CONTACT_UPLOAD_LIMIT: {
    LITE: 200,
    PRO: 2000,
    ELITE: 20000,
  },
  MATERIAL_UPLOAD_LIMIT: {
    LITE: 10,
    PRO: 100,
  },
  VIDEO_RECORD_LIMIT: {
    LITE: 600000,
    PRO: 7200000,
    ELITE: 60000000,
  },
  PASSWORD: {
    USER: process.env.DEFAULT_PASS || 'user123',
    ADMIN: process.env.ADMIN_DEFAULT_PASS || 'admin123',
  },
  COMPANY: {
    DEFAULT: 'eXp Realty',
  },
  ADMIN_ACCOUNT: 'support@crmgrow.com',
  LEAD: '5f16d58d0af09220208b6e11',
  AUTO_FOLLOW_UP: 'has reviewed material',
  AUTO_FOLLOW_UP2: 'didn`t watch material',
  AUTOMATION_ASSIGN_LIMIT: {
    PRO: 300,
    ELITE: 3000,
  },
  THUMBNAIL: {
    WIDTH: 400,
    HEIGHT: 220,
  },
  IMAP_PORT: 587,
  ONBOARD_PRICING_30_MINS: 5000,
  ONBOARD_PRICING_1_HOUR: 9500,
  SCHEDULE_LINK_30_MINS: 'https://calendly.com/coachwithdaniel/crm-grow-30',
  SCHEDULE_LINK_1_HOUR: 'https://calendly.com/coachwithdaniel/crm-grow',
  CAMPAIGN_MAIL_START: {
    SMTP: 500,
    GMAIL: 150,
    GSUIT: 500,
    OUTLOOK: 150,
    MICROSOFT: 500,
    AWS: 5000,
  },
  CAMPAIGN_MAIL_LIMIT: {
    GMAIL: 400,
    GSUIT: 1500,
    OUTLOOK: 250,
    MICROSOFT: 1000,
    AWS: 5000,
  },
  DEMO_VIDEO: '60ad6077af664b0016ebb176',
  WEBINAR_LINK:
    'https://calendly.com/support-1196/crmgrow-live-demo?month=2021-05',
  TIME_ZONE: 'America/New York',
  DEFAULT_STAGES: [
    'Lead',
    '30% Committed',
    '60% Committed',
    '90% Committed',
    'Application',
    'Submitted',
  ],
  SMS_CREDIT: [
    {
      PRICE: 600,
      AMOUNT: 250,
    },
    {
      PRICE: 1000,
      AMOUNT: 500,
    },
    {
      PRICE: 1500,
      AMOUNT: 1000,
    },
  ],
  REFERRAL_DEEP: 3,
  USER_VERSION: 1,
  REPLACE_NAME: 'crmgrow',
  PACKAGE_LEVEL: [0, 29, 49, 99],
  MLM_LEVEL: [0, 0.1, 0.15, 0.12],
};

module.exports = system_settings;
