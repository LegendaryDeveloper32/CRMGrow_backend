const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const LogSchema = new Schema(
  {
    user: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    content: String,
    type: Number,
    contact: [{ type: mongoose.Schema.Types.ObjectId, ref: 'contact' }],
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const PhoneLog = mongoose.model('phone_log', LogSchema);

module.exports = PhoneLog;
