const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const TrackerSchema = new Schema(
  {
    user: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    contact: [{ type: mongoose.Schema.Types.ObjectId, ref: 'contact' }],
    pdf: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdf' }],
    activity: [{ type: mongoose.Schema.Types.ObjectId, ref: 'activity' }],
    type: { type: String, default: 'review' },
    duration: Number,
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

TrackerSchema.index({ activity: 1 });
const PDFTracker = mongoose.model('pdf_tracker', TrackerSchema);

module.exports = PDFTracker;
