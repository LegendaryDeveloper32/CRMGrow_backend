const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const CampaignSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'contact' }],
    mail_list: { type: mongoose.Schema.Types.ObjectId, ref: 'mail_list' },
    email_template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'email_template',
    },
    due_start: Date,
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'image' }],
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('campaign', CampaignSchema);
