const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/authMiddleware')
const UserModel = require('../models/UserModel')
const PostModel = require('../models/PostModel')
const FollowerModel = require('../models/FollowerModel')
const uuid = require('uuid').v4
const {
  newLikeNotification,
  removeLikeNotification,
  newCommentNotification,
  removeCommentNotification,
} = require('../utilsServer/notificationActions')

// CREATE A POST

router.post('/', authMiddleware, async (req, res) => {
  const { text, location, picUrl } = req.body

  if (text.length < 1)
    return res.status(401).send('Text must be atleast 1 character')

  try {
    const newPost = {
      user: req.userId,
      text,
    }
    if (location) newPost.location = location
    if (picUrl) newPost.picUrl = picUrl

    const post = await new PostModel(newPost).save()

    const postCreated = await PostModel.findById(post._id).populate('user')

    return res.json(postCreated)
  } catch (error) {
    console.error(error)
    return res.status(500).send(`Server error`)
  }
})

// Get all Posts
router.get('/', authMiddleware, async (req, res) => {
  const { pageNumber } = req.query

  try {
    const number = Number(pageNumber)
    const size = 8
    const { userId } = req

    const loggedUser = await FollowerModel.findOne({ user: userId }).select(
      '-followers'
    )

    let posts = []
    if (number === 1) {
      if (loggedUser.following.length > 0) {
        posts = await PostModel.find({
          user: {
            $in: [
              userId,
              ...loggedUser.following.map((following) => following.user),
            ],
          },
        })
          .limit(size)
          .sort({ createdAt: -1 })
          .populate('user')
          .populate('comments.user')
      }
      //
      else {
        posts = await PostModel.find({ user: userId })
          .limit(size)
          .sort({ createdAt: -1 })
          .populate('user')
          .populate('comments.user')
      }
    }
    //
    else {
      const skips = size * (number - 1)
      if (loggedUser.following.length > 0) {
        posts = await PostModel.find({
          user: {
            $in: [
              userId,
              ...loggedUser.following.map((following) => following.user),
            ],
          },
        })
          .skip(skips)
          .limit(size)
          .sort({ createdAt: -1 })
          .populate('user')
          .populate('comments.user')
      }
      //
      else {
        posts = await PostModel.find({ user: userId })
          .skip(skips)
          .limit(size)
          .sort({ createdAt: -1 })
          .populate('user')
          .populate('comments.user')
      }
    }

    return res.json(posts)
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

// Get post by Id

router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await PostModel.findById(req.params.postId)
      .populate('user')
      .populate('comments.user')

    if (!post) return res.status(404).send('Post not found')

    return res.json(post)
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

// Delete Post

router.delete('/:postId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req
    const { postId } = req.params

    const post = await PostModel.findById(postId)
    if (!post) return res.status(404).send('Post not found')

    const user = await UserModel.findById(userId)
    if (post.user.toString() !== userId) {
      if (user.role === 'root') {
        await post.remove()
        return res.status(200).send('Post deleted successfully')
      } else {
        return res.status(401).send('unauthorized')
      }
    }

    await post.remove()
    return res.status(200).send('Post delted successfully')
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

// Like a post
router.post('/like/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params
    const { userId } = req

    const post = await PostModel.findById(postId)
    if (!post) return res.status(404).send('Post not found')

    const isLiked =
      post.likes.filter((like) => like.user.toString() === userId).length > 0

    if (isLiked) return res.status(401).send('Post already liked')

    await post.likes.unshift({ user: userId })
    await post.save()

    // dont send notification to self likes
    if (post.user.toString() !== userId) {
      await newLikeNotification(userId, postId, post.user.toString())
    }

    return res.status(200).send('Post liked')
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

// Unlike a post
router.put('/unlike/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params
    const { userId } = req

    const post = await PostModel.findById(postId)
    if (!post) return res.status(404).send('Post not found')

    const isLiked =
      post.likes.filter((like) => like.user.toString() === userId).length === 0

    if (isLiked) return res.status(401).send('Post not liked')

    const index = post.likes.map((like) => like.user.toString).indexOf(userId)

    await post.likes.splice(index, 1)
    await post.save()

    // dont send notification to self likes
    if (post.user.toString() !== userId) {
      await removeLikeNotification(userId, postId, post.user.toString())
    }

    return res.status(200).send('Post unliked')
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

// get all likes

router.get('/like/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params

    const post = await PostModel.findById(postId).populate('likes.user')
    if (!post) return res.status(404).send('Post not found')

    return res.status(200).json(post.likes)
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

// create a comment

router.post('/comment/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params
    const { userId } = req
    const { text } = req.body

    if (text.length < 1)
      return res.status(401).send('Comment should be atleast 1 character')

    const post = await PostModel.findById(postId)
    if (!post) return res.status(404).send('Post not found')

    const newComment = {
      _id: uuid(),
      text,
      user: userId,
      date: Date.now(),
    }

    await post.comments.unshift(newComment)
    await post.save()

    if (post.user.toString() !== userId) {
      await newCommentNotification(
        postId,
        newComment._id,
        userId,
        post.user.toString(),
        text
      )
    }

    return res.status(200).json(newComment._id)
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

// delete a comment

router.delete('/:postId/:commentId', authMiddleware, async (req, res) => {
  try {
    const { postId, commentId } = req.params
    const { userId } = req

    const post = await PostModel.findById(postId)
    if (!post) return res.status(404).send('Post not found')

    const comment = post.comments.find((comment) => comment._id === commentId)
    if (!comment) return res.status(404).send('Comment not found')

    const user = await UserModel.findById(userId)
    if (!user) return res.status(404).send('User not found')

    const deleteComment = async () => {
      const indexOf = post.comments
        .map((comment) => comment._id)
        .indexOf(commentId)

      await post.comments.splice(indexOf, 1)
      await post.save()

      if (post.user.toString() !== userId) {
        await removeCommentNotification(
          postId,
          commentId,
          userId,
          post.user.toString()
        )
      }
      return res.status(200).send('Deleted Successfully')
    }

    if (comment.user.toString() !== userId) {
      if (user.role === 'root') {
        await deleteComment()
      } else {
        return res.status(401).send('Unauthorized')
      }
    }

    await deleteComment()
  } catch (error) {
    console.log(error)
    return res.status(500).send('server error')
  }
})

module.exports = router
