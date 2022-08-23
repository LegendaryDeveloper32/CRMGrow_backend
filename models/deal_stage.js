const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const DealStageSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    role: String,
    title: String,
    priority: Number,
    deals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'deal' }],
    updated_at: Date,
    created_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const DealStage = mongoose.model('deal_stage', DealStageSchema);

module.exports = DealStage;
