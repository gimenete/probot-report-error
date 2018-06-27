# Probot lifeguard

![Lifeguard](help.png "Icon made by https://www.flaticon.com/authors/pixel-buddha from www.flaticon.com ")

Probot lifeguard catches exceptions in your probot app and creates issues on your repo with
as much information as possible.

## Installing

```
npm install gimenete/probot-lifeguard
```

## Usage

You can either wrap your entire app or just a single handler. Wrapping the entire app is
the easiest way but internally modifies the probot instance.

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
const lifeguard = require('lifeguard')
const guard = lifeguard(/* options here */)

module.exports = guard.guardApp(app => {
  app.on('*', async context => {
    app.log('Hey!')
    await context.config('welcome.yml')
  })
});
```

### Wrapping only a handler

Just wrap your handler in a call to `guard.guardHandler()`. Example:

```js
const lifeguard = require('lifeguard')
const guard = lifeguard(/* options here */)

module.exports = app => {
  app.on('*', guard.guardHandler(async context => {
    app.log('Hey!')
    await context.config('welcome.yml')
  })
});
```

## Options

The `lifeguard()` function supports a few options. All of them are optional:

| Option | Description | Default value | Example |
| ------ | ----------- | ------------- | ------- |
| `reopen`  | Lifeguard always checks if there's an existing issue for the error catched. If this option is set to `false` it looks for open issues and if there's not an open issue with the catched error it will create a new one. If set to `true` it will look for any issue and if it finds one but it's closed, it will reopen it | `false` | `true` |
| `title`  | The title of the issue. It is always prefixed with a hash code that identifies the error | `Probot integration problem` | `Error while checking for stale issues` |
| `body`  | The body of the issue. Besides this text the issue will contain more information about the error (e.g. the stacktrace if available) and the number of occurrences of the error | `An error occurred` | `Check the syntax of...` |
| `labels`  | Array of labels to put in the issue. Additionally to these labels `probot-error` will always be added | `['devops']` | `[]` |
