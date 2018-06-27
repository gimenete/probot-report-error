# probot-report-error

![Lifeguard](help.png "Icon made by https://www.flaticon.com/authors/pixel-buddha from www.flaticon.com ")

Use `probot-report-error` to catch errors in your probot app. `probot-report-error` will open
an issue on your repo if something fails. For example if your app tries to load a config file
and it is malformed.

## Installing

```
npm install gimenete/probot-report-error
```

## Usage

You can either wrap your entire app, just a single handler, or call the library manuall when there's
an error. Wrapping the entire app is the easiest way but it internally modifies the probot instance
which is not the most elegant solution, but it works perfectly.

### Wrapping the entire app

Just wrap your app in a call to `guard.guardApp()`. Example:

```js
// before
module.exports = app => {
  app.on('*', async context => {
    app.log('Hey!')
    await context.config('welcome.yml')
  })
};

// after
const { lifeguard } = require('probot-report-error')
const guard = lifeguard({/* options here */})

module.exports = guard.guardApp(app => {
  app.on('*', async context => {
    app.log('Hey!')
    await context.config('welcome.yml')
  })
});
```

### Wrapping only one handler

Just wrap your handler in a call to `guard.guardHandler()`. Example:

```js
const { lifeguard } = require('probot-report-error')
const guard = lifeguard({/* options here */})

module.exports = app => {
  app.on('*', guard.guardHandler(async context => {
    app.log('Hey!')
    await context.config('welcome.yml')
  }))
});
```

### Calling the library directly

Just call `reportError(context, error, [options])`.

```js
const { reportError } = require('probot-report-error')

module.exports = app => {
  app.on('*', async context => {
    try {
      app.log('Hey!')
      await context.config('welcome.yml')
    } catch (err) {
      return reportError(context, err, {/* options here */})
    }
  })
});
```

## Options

Both the `lifeguard()` function and the `reportError` function support a few options. All of them are optional:

| Option | Description | Default value | Example |
| ------ | ----------- | ------------- | ------- |
| `reopen`  | Lifeguard always checks if there's an existing issue for the error catched. If this option is set to `false` it looks for open issues and if there's not an open issue with the catched error it will create a new one. If set to `true` it will look for any issue and if it finds one but it's closed, it will reopen it | `false` | `true` |
| `title`  | The title of the issue. It is always prefixed with a hash code that identifies the error | `Probot integration problem` | `Error while checking for stale issues` |
| `body`  | The body of the issue. Besides this text the issue will contain more information about the error (e.g. the stacktrace if available) and the number of occurrences of the error | `An error occurred` | `Check the syntax of...` |
| `labels`  | Array of labels to put in the issue. | `['devops']` | `[]` |
