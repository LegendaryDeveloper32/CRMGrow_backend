const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const PaidDemoSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    demo_mode: Number,
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const PaidDemo = mongoose.model('paid_demo', PaidDemoSchema);

module.exports = PaidDemo;
