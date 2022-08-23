const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const FolderSchema = new Schema(
  {
    title: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'video' }],
    pdfs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'pdfs' }],
    images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'images' }],
    created_at: Date,
    updated_at: Date,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const Folder = mongoose.model('folder', FolderSchema);

module.exports = Folder;
