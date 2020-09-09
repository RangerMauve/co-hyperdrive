const { MultiHyperdrive } = require('multi-hyperdrive')
const { AuthType, AuthRequest, Writers } = require('./messages.js')

const DEFAULT_OPTS = {
  headerSubtype: 'co-hyperdrive',
  sparse: true,
  onAuth: DEFAULT_AUTH
}

const WRITERS_KEY = '.writers'

function DEFAULT_AUTH (key, peer, onAuthorized) {
  onAuthorized(false)
}

const AUTH_EXTENSION = 'co-hyperdrive-auth-1'

const AUTH_TIMEOUT = 60 * 1000

class CoHyperdrive extends MultiHyperdrive {
  constructor (getDrive, key, opts) {
    const {
      onAuth,
      authTimeout = AUTH_TIMEOUT,
      ...finalOpts
    } = { ...DEFAULT_OPTS, ...(opts || {}) }
    const primary = getDrive(key, finalOpts)

    super(primary)

    this._getDrive = getDrive
    this._onready = []
    this._isReady = false

    this.opts = finalOpts
    this.onAuth = onAuth
    this.authTimeout = authTimeout

    // Start loading the co-hyperdrive
    this.primary.ready(() => {
      this.authExt = this.primary.registerExtension(AUTH_EXTENSION, {
        encoding: AuthRequest,
        onmessage: (message, peer) => this._handleExtension(message, peer)
      })
      this._loadWriters((err) => {
        this._isReady = true
        for (const cb of this._onready) cb(err)
        if (err) this.emit('error', err)
      })
    })
  }

  _handleExtension ({ key, type }, peer) {
    if (type === AuthType.REQUEST) {
      if (this.writer) {
        this.onAuth(key, peer, (authorized) => {
          if (authorized) {
            this.authorize(key, (err) => {
              if (err) this.authExt.send({ key, type: AuthType.DENY }, peer)
              else this.authExt.send({ key, type: AuthType.ALLOW }, peer)
            })
          } else {
            this.authExt.send({ key, type: AuthType.DENY }, peer)
          }
        })
      } else {
        // We're not a writer
        this.authExt.send({ key, type: AuthType.IGNORE }, peer)
      }
    } else this.emit('auth-response', type, peer)
  }

  ready (cb) {
    if (this._isReady) process.nextTick(cb)
    this._onready.push(cb)
  }

  authorize (key, cb) {
    this.ready(() => {
      this._setWriterStatus(key, true, cb)
    })
  }

  deauthorize (key, cb) {
    this.ready(() => {
      this._setWriterStatus(key, false, cb)
    })
  }

  requestAuthorization (key, cb) {
    this.ready(() => {
      if (this.writer) {
        return this.authorize(key, (err) => {
          if (err) return cb(err, false)
          cb(null, true)
        })
      }

      let handled = false
      this.authExt.broadcast({ key, type: AuthType.REQUEST })

      this.on('auth-response', handleResponse)

      setTimeout(() => {
        if (handled) return
        handled = true
        cb(new Error('Auth request timed out'), false)
      }, this.authTimeout || AUTH_TIMEOUT)

      function handleResponse (type, peer) {
        if (handled) return
        if (type === AuthType.ALLOW) {
          this.removeListener('auth-response', handleResponse)
          handled = true
          this._loadWriters((err) => cb(err, key))
        } else if (type === AuthType.DENY) {
          cb(null, false)
          handled = true
          this.removeListener('auth-response', handleResponse)
        }
      }
    })
  }

  resolveLatest (name, cb) {
    this._loadWriters((err) => {
      if (err) return cb(err)
      super.resolveLatest(name, cb)
    })
  }

  _loadWriters (cb) {
    this._getWritersData((err, writers) => {
      if (err) return cb(err)
      const keys = Object.keys(writers)

      if (!keys.length) return cb(null)
      let lastError = null
      const primaryKey = this.primary.key.toString('hex')
      let processed = 0
      for (const key of keys) {
        const { active } = writers[key]
        if (key === primaryKey) {
          next()
        } else if (!active && this.hasDrive(key)) {
          this._unloadWriter(key, (err) => {
            if (err) {
              lastError = err
            }
            next()
          })
        } else if (active && !this.hasDrive(key)) {
          this._loadWriter(key, (err) => {
            if (err) {
              lastError = err
            }
            next()
          })
        } else next()
      }

      function next () {
        processed++
        if (processed === keys.length) cb(lastError)
      }
    })
  }

  _setWriterStatus (key, active, cb) {
    this._getWritersData((err, writers) => {
      if (err) return cb(err)
      const timestamp = Date.now()
      const updated = { [key.toString('hex')]: { active, timestamp } }

      this._setWritersData(updated, cb)
    })
  }

  _getWritersData (cb) {
    this._runAllDBs('get', [WRITERS_KEY, { hidden: true }], (err, results) => {
      if (err) return cb(err)
      const writerDatas = results.filter(({ value }) => value).map(({ value }) => value)
      const result = {}
      for (const { value: raw } of writerDatas) {
        const decoded = Writers.decode(raw)
        const { writers } = decoded
        const writerKeys = Object.keys(writers)
        for (const key of writerKeys) {
          const { active, timestamp } = writers[key]

          if (!result[key]) {
            result[key] = { active, timestamp }
          } else {
            // If there's already an entry, compare it
            // Replace it if this entry is newer
            const existing = result[key]
            if ((existing.timestamp - timestamp) < 0) {
              result[key] = { active, timestamp }
            }
          }
        }
      }

      cb(null, result)
    })
  }

  _setWritersData (writers, cb) {
    const serialized = Writers.encode({ writers })
    this.writerOrPrimary.db.put(WRITERS_KEY, serialized, { hidden: true }, cb)
  }

  _loadWriter (key, cb) {
    try {
      if (this.hasDrive(key)) return cb(null)
      const drive = this._getDrive(key, { ...this.opts, announce: false, lookup: false })
      this.addDrive(drive, cb)
      drive.ready(() => {
        drive.watch('/')
        drive.on('update', () => {
          this._loadWriters((err) => {
            if (err) this.emit('error', err)
          })
        })
      })
    } catch (e) {
      cb(e)
    }
  }

  _unloadWriter (key, cb) {
    const existing = this.sources.get(key.toString('hex'))
    if (!existing) return process.nextTick(cb)

    this.removeDrive(key)
    existing.close(cb)
  }
}

module.exports = function makeCoHyperdrive (getDrive, key, opts) {
  return new CoHyperdrive(getDrive, key, opts)
}

module.exports.CoHyperdrive = CoHyperdrive
