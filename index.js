const crypto = require('crypto')

/**
 * Calculate a string representation of the error with as much information as possible
 * @param {*} err
 */
const errorToString = (err) => {
  return err.stack || err.message || String(err) || 'Unknown error'
}

/**
 * Calculate a hash of the string representation of the error in order to
 * not create multiple issues for the same problem. The hash will be in the title
 * of the issue according to the requirements
 * @param {*} string
 */
const hash = (string) => {
  return crypto.createHash('sha256')
    .update(string)
    .digest('hex')
    .substring(0, 8)
}

/**
 * Core functionality for handling an error
 * @param {*} context
 * @param {*} err
 */
const reportError = async (context, err, opts) => {
  const options = {
    title: 'Probot integration problem',
    body: 'An error occurred',
    labels: [],
    reopen: false,
    ...opts
  }
  // I decided not to support passing a milestone or assignees
  // since that opens the door for errors when creating the issue if the data provided is wrong
  // and for an error reporting tool it is an important requirement not to fail
  // when reporting an error :)


  const params = context.repo()
  const {owner, repo} = params

  const errString = errorToString(err)
  const errCode = hash(errString)
  const title = `[${errCode}] ${options.title}`

  // If the webhook event is due to the current issue, ignore it
  // Example: an app listens to issues.opened events, it fails, we create an issue
  // because of that crash, then the app receives that new event, and crashes again.
  // That could potentially create an infinite loop between the app and GitHub
  if (context.payload.issue && context.payload.issue.title === title) return

  // Look for an existing issue with the same error hash/code
  const q = [
    'sort:updated-desc',
    options.reopen ? '' : 'is:open',
    errCode
  ]
  .filter(Boolean)
  .join(' ')
  const result = await context.github.search.issues({ q })
  const issue = result.data.items[0]

  if (issue) {
    // If the issue exists we update the occurrences counter and also that updates
    // the updated_at date. Useful for sorting the issues in the UI or API
    const { number } = issue
    let { body } = issue
    body = body
      .replace(/(Occurrences:\s*)(\d+)/, (match, label, value) => label + String(+value + 1))
    // If reopen is set to true and the issue is closed, reopen it
    const state = issue.state === 'closed' && options.reopen ? 'open' : issue.state
    await context.github.issues.edit({ owner, repo, number, body, state })
  } else {
    const body = [
      options.body,
      '```\n' + errString + '\n```',
      'Occurrences: 1'
    ].join('\n\n')
    await context.github.issues.create({owner, repo, title, body, labels: options.labels})
  }
}

class Lifeguard {
  constructor (options) {
    this.options = options
  }

  /**
   * Common functionality for invoking the original callback
   * @param {*} context
   * @param {*} callback
   * @param {*} context
   */
  async invokeCallback (context, callback, that) {
    try {
      return await callback.apply(that, arguments)
    } catch (err) {
      await reportError(context, err, this.options)
      // Throw it again so it is handled by probot and logs it with bunyan
      throw err
    }
  }

  /**
   * Use this mehtod to wrap the whole bot application. It overrides the
   * robot.on() method to make sure all the event handlers are safely wrapped
   * to catch any errors.
   *
   * This is implemented in a way that "this" is kept even after wrapping the handler.
   *
   * All the probot examples use arrow functions, but if you pass
   * a regular function binded to an object and you invoke the function
   * then the "this" reference is kept. The same should happen in our
   * library, the ABI should not change when using probot-lifeguard
   * @param {*} handler
   */
  guardApp (handler) {
    const self = this
    return app => {
      const original = app.on.bind(app)
      app.on = function (event, callback) {
        return original(event, async function (context) {
          return self.invokeCallback(context, callback, this)
        })
      }
      handler(app)
    }
  }

  /**
   * Use this method to wrap just one event handler
   * @param {*} callback
   */
  guardHandler (callback) {
    const self = this
    return async function (context) {
      return self.invokeCallback(context, callback, this)
    }
  }
}

module.exports = {
  reportError,
  hash,
  errorToString,
  lifeguard: (options) => new Lifeguard(options)
}
