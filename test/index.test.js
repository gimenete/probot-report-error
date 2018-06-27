const lifeguard = require('../index')
const Context = require('probot/lib/context')

class TestRobot {
  on (event, callback) {
    this.callback = callback
  }

  async _emit (event, context) {
    return this.callback(context)
  }
}
const robot = new TestRobot()

const handlerThatThrows = context => {
  // We throw a string because if we throw an error here
  // the stack may change every time we edit a source file
  // and thus the hash / error code
  throw 'Whoops' // eslint-disable-line
}

describe('lifeguard', () => {
  describe('Ignore issues created or edited by the bot itself', () => {
    const guard = lifeguard()
    let context, event, github

    beforeEach(() => {
      github = {
        issues: {
          edit: jest.fn(),
          create: jest.fn()
        },
        search: {
          issues: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              items: []
            }
          }))
        }
      }

      event = {
        payload: {
          issue: {
            number: 42,
            labels: [
              { name: 'probot-error' }
            ]
          },
          repository: {
            owner: {login: 'foo'},
            name: 'bar'
          },
          installation: {id: 1}
        }
      }

      context = new Context(event, github)
    })

    test('Handler is not called', async () => {
      const handler = jest.fn()
      const appHandler = guard.guardApp(app => {
        app.on('*', handler)
      })
      appHandler(robot)
      await robot._emit('xxx', context)
      expect(handler).not.toHaveBeenCalled()
      expect(github.issues.create).not.toHaveBeenCalled()
      expect(github.issues.edit).not.toHaveBeenCalled()
      expect(github.search.issues).not.toHaveBeenCalled()
    })
  })

  describe('Lifeguard with default arguments', () => {
    const guard = lifeguard()
    let context, event, github

    beforeEach(() => {
      github = {
        issues: {
          edit: jest.fn(),
          create: jest.fn()
        },
        search: {
          issues: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              items: []
            }
          }))
        }
      }

      event = {
        payload: {
          issue: {
            number: 42,
            labels: []
          },
          repository: {
            owner: {login: 'foo'},
            name: 'bar'
          },
          installation: {id: 1}
        }
      }

      context = new Context(event, github)
    })

    test('Guard an app with a handler without failures, and "this" is kept', async () => {
      const obj = {
        message: 'hello',
        async handler (context) {
          return this.message
        }
      }
      const appHandler = guard.guardApp(app => {
        app.on('*', obj.handler.bind(obj))
      })
      appHandler(robot)
      const result = await robot._emit('xxx', context)

      expect(result).toEqual('hello')
      expect(github.issues.create).not.toHaveBeenCalled()
      expect(github.issues.edit).not.toHaveBeenCalled()
      expect(github.search.issues).not.toHaveBeenCalled()
    })

    test('Guard a handler without failures, and "this" is kept', async () => {
      const obj = {
        message: 'hello',
        async handler (context) {
          return this.message
        }
      }
      const appHandler = app => {
        app.on('*', guard.guardHandler(obj.handler.bind(obj)))
      }
      appHandler(robot)
      const result = await robot._emit('xxx', context)

      expect(result).toEqual('hello')
      expect(github.issues.create).not.toHaveBeenCalled()
      expect(github.issues.edit).not.toHaveBeenCalled()
      expect(github.search.issues).not.toHaveBeenCalled()
    })

    test('Guard an app with a handler that throws', async () => {
      const appHandler = guard.guardApp(app => {
        app.on('*', handlerThatThrows)
      })
      appHandler(robot)
      await expect(robot._emit('xxx', context)).rejects.toThrow('Whoops')
      expect(github.search.issues).toHaveBeenCalledWith({
        'q': 'sort:updated-desc is:open label:probot-error 85d8ae40'
      })
      expect(github.issues.create).toHaveBeenCalledWith({
        'body': 'An error occurred\n\n```\nWhoops\n```\n\nOccurrences: 1',
        'labels': ['probot-error'],
        'owner': 'foo',
        'repo': 'bar',
        'title': '[85d8ae40] Probot integration problem'
      })
      expect(github.issues.edit).not.toHaveBeenCalled()
    })
  })

  describe('Edit existing issue', () => {
    const guard = lifeguard()
    let context, event, github

    beforeEach(() => {
      github = {
        issues: {
          edit: jest.fn(),
          create: jest.fn()
        },
        search: {
          issues: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              items: [{
                number: 112,
                body: '... Occurrences: 1',
                state: 'open'
              }]
            }
          }))
        }
      }

      event = {
        payload: {
          issue: {
            number: 42,
            labels: []
          },
          repository: {
            owner: {login: 'foo'},
            name: 'bar'
          },
          installation: {id: 1}
        }
      }

      context = new Context(event, github)
    })

    test('Existing issue is edited', async () => {
      const appHandler = guard.guardApp(app => {
        app.on('*', handlerThatThrows)
      })
      appHandler(robot)
      await expect(robot._emit('xxx', context)).rejects.toThrow('Whoops')
      expect(github.search.issues).toHaveBeenCalledWith({
        'q': 'sort:updated-desc is:open label:probot-error 85d8ae40'
      })
      expect(github.issues.edit).toHaveBeenCalledWith({
        'body': '... Occurrences: 2',
        'number': 112,
        'owner': 'foo',
        'repo': 'bar',
        'state': 'open'
      })
      expect(github.issues.create).not.toHaveBeenCalled()
    })
  })

  describe('Edit and reopen existing issue', () => {
    const guard = lifeguard({ reopen: true })
    let context, event, github

    beforeEach(() => {
      github = {
        issues: {
          edit: jest.fn(),
          create: jest.fn()
        },
        search: {
          issues: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              items: [{
                number: 112,
                body: '... Occurrences: 1',
                state: 'closed'
              }]
            }
          }))
        }
      }

      event = {
        payload: {
          issue: {
            number: 42,
            labels: []
          },
          repository: {
            owner: {login: 'foo'},
            name: 'bar'
          },
          installation: {id: 1}
        }
      }

      context = new Context(event, github)
    })

    test('Existing issue is edited and reopened', async () => {
      const appHandler = guard.guardApp(app => {
        app.on('*', handlerThatThrows)
      })
      appHandler(robot)
      await expect(robot._emit('xxx', context)).rejects.toThrow('Whoops')
      expect(github.search.issues).toHaveBeenCalledWith({
        'q': 'sort:updated-desc label:probot-error 85d8ae40'
      })
      expect(github.issues.edit).toHaveBeenCalledWith({
        'body': '... Occurrences: 2',
        'number': 112,
        'owner': 'foo',
        'repo': 'bar',
        'state': 'open'
      })
      expect(github.issues.create).not.toHaveBeenCalled()
    })
  })

  describe('Customize issue', () => {
    const guard = lifeguard({
      labels: ['custom-label'],
      title: 'Custom title',
      body: 'Custom body'
    })
    let context, event, github

    beforeEach(() => {
      github = {
        issues: {
          edit: jest.fn(),
          create: jest.fn()
        },
        search: {
          issues: jest.fn().mockImplementation(() => Promise.resolve({
            data: {
              items: []
            }
          }))
        }
      }

      event = {
        payload: {
          issue: {
            number: 42,
            labels: []
          },
          repository: {
            owner: {login: 'foo'},
            name: 'bar'
          },
          installation: {id: 1}
        }
      }

      context = new Context(event, github)
    })

    test('Creates a customized issue', async () => {
      const appHandler = guard.guardApp(app => {
        app.on('*', handlerThatThrows)
      })
      appHandler(robot)
      await expect(robot._emit('xxx', context)).rejects.toThrow('Whoops')
      expect(github.search.issues).toHaveBeenCalledWith({
        'q': 'sort:updated-desc is:open label:probot-error 85d8ae40'
      })
      expect(github.issues.create).toHaveBeenCalledWith({
        'body': 'Custom body\n\n```\nWhoops\n```\n\nOccurrences: 1',
        'labels': ['custom-label', 'probot-error'],
        'owner': 'foo',
        'repo': 'bar',
        'title': '[85d8ae40] Custom title'
      })
    })
  })

  describe('#errorToString', () => {
    const guard = lifeguard()

    test('Error with stack', async () => {
      expect(guard.errorToString({ stack: 'foo' })).toEqual('foo')
    })

    test('Error with message', async () => {
      expect(guard.errorToString({ message: 'foo' })).toEqual('foo')
    })

    test('Not a real error', async () => {
      expect(guard.errorToString(Buffer.from('foo'))).toEqual('foo')
    })

    test('Empty error', async () => {
      expect(guard.errorToString('')).toEqual('Unknown error')
    })
  })

  describe('#hash', () => {
    const guard = lifeguard()

    test('Hash a string', async () => {
      expect(guard.hash('Whoops')).toEqual('85d8ae40')
    })
  })
})
