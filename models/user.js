const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const system_settings = require('../config/system_settings');

const UserSchema = new Schema(
  {
    user_name: String,
    nick_name: String,
    social_id: String,
    email: String,
    hash: String,
    salt: String,
    cell_phone: String,
    phone: {
      number: String,
      internationalNumber: String,
      nationalNumber: String,
      countryCode: String,
      areaCode: String,
      dialCode: String,
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'payment' },
    time_zone_info: String,
    time_zone: { type: String, default: '-07:00' },
    email_signature: { type: String, default: '' },
    location: { type: String, default: '' },
    proxy_number: String,
    proxy_number_id: String,
    twilio_number: String,
    twilio_number_id: String,
    picture_profile: String,
    learn_more: String,
    role: String,
    primary_connected: Boolean,
    outlook_refresh_token: String,
    google_refresh_token: String,
    yahoo_refresh_token: String,
    other_emailer: Object,
    connected_email_type: String,
    calendar_connected: Boolean,
    calendar_list: Array,
    connected_email: String,
    daily_report: Boolean,
    weekly_report: Boolean,
    admin_notification: { type: Number, default: 0 },
    desktop_notification: Boolean,
    desktop_notification_subscription: String,
    text_notification: Boolean,
    assistant_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: system_settings.ASSISTANT_LIMIT.PRO,
      },
    },
    contact_info: {
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: system_settings.CONTACT_UPLOAD_LIMIT.PRO,
      },
    },
    text_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: system_settings.TEXT_MONTHLY_LIMIT.PRO,
      },
      count: Number,
      additional_credit: Object,
    },
    calendar_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: system_settings.CALENDAR_LIMIT.PRO,
      },
    },
    email_info: {
      mass_enable: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: system_settings.EMAIL_DAILY_LIMIT.BASIC,
      },
      count: Number,
    },
    automation_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      max_count: {
        type: Number,
        default: system_settings.ASSISTANT_LIMIT.PRO,
      },
    },
    material_info: {
      is_enabled: { type: Boolean, default: true },
      is_limit: { type: Boolean, default: true },
      upload_max_count: {
        type: Number,
        default: system_settings.MATERIAL_UPLOAD_LIMIT.PRO,
      },
      record_max_duration: {
        type: Number,
        default: system_settings.VIDEO_RECORD_LIMIT.PRO,
      },
    },
    team_info: {
      owner_enabled: { type: Boolean, default: true },
    },
    dialer_info: {
      is_enabled: Boolean,
    },
    user_version: { type: String, default: 'v2' },
    capture_enabled: { type: Boolean, default: true },
    link_track_enabled: { type: Boolean, default: true },
    email_verified: Boolean,
    welcome_email: { type: Boolean, default: false },
    is_trial: { type: Boolean, default: true },
    is_free: Boolean,
    subscription: {
      is_failed: Boolean,
      updated_at: Date,
      is_suspended: Boolean,
      suspended_at: Date,
      attempt_count: Number,
      amount: Number,
      period: { type: String, default: 'month' },
    },
    package_level: { type: String, default: 'PRO' },
    due_commission: Number,
    paid_commission: Number,
    total_commission: Number,
    paid_demo: { type: Boolean, default: false },
    paid_demo_mode: Number,
    expired_at: Date,
    created_at: Date,
    updated_at: Date,
    last_logged: Date,
    del: { type: Boolean, default: false },
    admin_loggin: Boolean,
    guest_loggin: Boolean,
    sub_domain: String,
    social_link: {
      facebook: String,
      twitter: String,
      linkedin: String,
    },
    company: { type: String, default: system_settings.COMPANY.DEFAULT },
    affiliate: {
      id: String,
      link: String,
      paypal: String,
    },
    parent_affiliate_id: String,
    smtp_connected: Boolean,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const User = mongoose.model('user', UserSchema);

module.exports = User;
