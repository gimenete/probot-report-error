const {lifeguard, errorToString, hash, reportError} = require('../index')
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

describe('probot-report-error', () => {
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
            labels: [],
            title: '[85d8ae40] Probot integration problem'
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

    test('No issues are created or edited', async () => {
      const appHandler = guard.guardApp(app => {
        app.on('*', handlerThatThrows)
      })
      appHandler(robot)
      await expect(robot._emit('xxx', context)).rejects.toThrow('Whoops')
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
            labels: [],
            title: ''
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
        'q': 'sort:updated-desc is:open 85d8ae40'
      })
      expect(github.issues.create).toHaveBeenCalledWith({
        'body': 'An error occurred\n\n```\nWhoops\n```\n\nOccurrences: 1',
        'labels': [],
        'owner': 'foo',
        'repo': 'bar',
        'title': '[85d8ae40] Probot integration problem'
      })
      expect(github.issues.edit).not.toHaveBeenCalled()
    })
  })

  describe('Report an error manually', () => {
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
            labels: [],
            title: ''
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

    test('It creates the issue', async () => {
      await reportError(context, 'Whoops')
      expect(github.search.issues).toHaveBeenCalledWith({
        'q': 'sort:updated-desc is:open 85d8ae40'
      })
      expect(github.issues.create).toHaveBeenCalledWith({
        'body': 'An error occurred\n\n```\nWhoops\n```\n\nOccurrences: 1',
        'labels': [],
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
                state: 'open',
                title: '[ef52c642] Probot integration problem'
              }]
            }
          }))
        }
      }

      event = {
        payload: {
          issue: {
            number: 42,
            labels: [],
            title: ''
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
        'q': 'sort:updated-desc is:open 85d8ae40'
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
                state: 'closed',
                title: '[ef52c642] Probot integration problem'
              }]
            }
          }))
        }
      }

      event = {
        payload: {
          issue: {
            number: 42,
            labels: [],
            title: ''
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
        'q': 'sort:updated-desc 85d8ae40'
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
            labels: [],
            title: ''
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
        'q': 'sort:updated-desc is:open 85d8ae40'
      })
      expect(github.issues.create).toHaveBeenCalledWith({
        'body': 'Custom body\n\n```\nWhoops\n```\n\nOccurrences: 1',
        'labels': ['custom-label'],
        'owner': 'foo',
        'repo': 'bar',
        'title': '[85d8ae40] Custom title'
      })
    })
  })

  describe('#errorToString', () => {
    test('Error with stack', async () => {
      expect(errorToString({ stack: 'foo' })).toEqual('foo')
    })

    test('Error with message', async () => {
      expect(errorToString({ message: 'foo' })).toEqual('foo')
    })

    test('Not a real error', async () => {
      expect(errorToString(Buffer.from('foo'))).toEqual('foo')
    })

    test('Empty error', async () => {
      expect(errorToString('')).toEqual('Unknown error')
    })
  })

  describe('#hash', () => {
    test('Hash a string', async () => {
      expect(hash('Whoops')).toEqual('85d8ae40')
    })
  })
})
