const mongoose = require('mongoose')
const Schema = mongoose.Schema

const NotificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'user' },
  notifications: [
    {
      type: { type: String, enum: ['newLike', 'newComment', 'newFollower'] },
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      post: { type: Schema.Types.ObjectId, ref: 'Post' },
      commentId: { type: String },
      text: { type: String },
      date: { type: Date, defaule: Date.now },
    },
  ],
})

module.exports = mongoose.model('Notification', NotificationSchema)
