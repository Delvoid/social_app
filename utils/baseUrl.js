const baseUrl =
  process.env.Node_ENV !== 'production'
    ? 'http://localhost:3000'
    : 'https://delv-social-media.herokuapp.com'

module.exports = baseUrl
