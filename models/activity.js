const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ActivitySchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    content: String,
    type: String,
    appointments: { type: mongoose.Schema.Types.ObjectId, ref: 'appointment' },
    follow_ups: { type: mongoose.Schema.Types.ObjectId, ref: 'follow_up' },
    notes: { type: mongoose.Schema.Types.ObjectId, ref: 'note' },
    phone_logs: { type: mongoose.Schema.Types.ObjectId, ref: 'phone_log' },
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    video_trackers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'video_tracker',
    },
    users: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    pdf_trackers: { type: mongoose.Schema.Types.ObjectId, ref: 'pdf_tracker' },
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
    image_trackers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'image_tracker',
    },
    emails: { type: mongoose.Schema.Types.ObjectId, ref: 'email' },
    email_trackers: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'email_tracker',
    },
    texts: { type: mongoose.Schema.Types.ObjectId, ref: 'text' },
    deals: { type: mongoose.Schema.Types.ObjectId, ref: 'deal' },
    team_calls: { type: mongoose.Schema.Types.ObjectId, ref: 'team_call' },
    contacts: { type: mongoose.Schema.Types.ObjectId, ref: 'contact' },
    material_last: Number,
    full_watched: Boolean,
    send_type: Number,
    subject: String,
    description: String,
    status: String,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

ActivitySchema.index({ messsage_sid: 1 });
ActivitySchema.index({ user: 1 });
ActivitySchema.index({ contacts: 1 });
const Activity = mongoose.model('activity', ActivitySchema);

module.exports = Activity;
