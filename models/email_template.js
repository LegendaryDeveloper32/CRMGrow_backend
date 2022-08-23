const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const EmailSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    title: String,
    subject: String,
    content: String,
    role: String,
    type: String,
    default: { type: Boolean, default: false },
    category: String,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const EmailTemplate = mongoose.model('email_template', EmailSchema);

module.exports = EmailTemplate;
