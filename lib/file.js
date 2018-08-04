const Queue = require('queue-callbacks')
const debug = require('debug')('random-access-key-value')
const toBuffer = require('./to-buffer')
const uint64be = require('uint64be')

const Read = require('./read')
const Write = require('./write')

// idea:
// write a random-access.json file containing:
//   - this.pageSize: number
//   - this.pageSizeOverride: {number: number}
// reason for this.pageSizeOverride:
// want to write eg. a hypercore tree efficiently.
// tree has a fixed size header (H) & fixed size nodes (N).
// if you make this.pageSize=N, this.pageSizeOverride={0: H}, you can
// write each node to one page exactly.

module.exports = class File {
  constructor(db, prefix, options) {
    if (
      typeof db.get !== 'function' ||
      typeof db.put !== 'function' ||
      typeof db.batch !== 'function'
    ) {
      throw new TypeError('db needs to support get, put, batch.')
    }
    this.db = db
    if (typeof prefix !== 'string') {
      throw new TypeError('prefix needs to be a string')
    }
    this.prefix = normalizeKey(prefix)
    this.options = options || {}
    this.pageSize = 4096 // TODO make configurable
    this.sizeKey = this.prefix + '/size'
    this.queue = new Queue()

    // We need to write the size so that we can differentiate between reads past
    // the end (=> unsatisfiable length) and reads in empty pages (=> return \0s).

    // cb: (err, size in bytes)
    this._getSize = cb => {
      return this._get(this.sizeKey, (err, value) => {
        if ((err && err.notFound) || value == null) {
          return cb(null, 0)
        } else if (err) {
          return cb(err)
        } else {
          return cb(null, uint64be.decode(toBuffer(value)))
        }
      })
    }

    // Sets the size in bytes, but only writes if the new one is bigger.
    this._grow = (size, cb) => {
      return this._getSize((err, oldSize) => {
        debug('grow', this.prefix, size)
        if (err) {
          return cb(err)
        }
        if (size > oldSize) {
          return this._put(this.sizeKey, uint64be.encode(size), cb)
        }
        return cb(null)
      })
    }

    this._get = (key, cb) => {
      debug('get', this.prefix, key)
      return this.db.get(key, cb)
    }

    this._put = (key, value, cb) => {
      debug('put', this.prefix, key, value)
      return this.db.put(key, value, cb)
    }

    this._batch = (ops, cb) => {
      debug('batch', this.prefix, ops)
      return this.db.batch(ops, cb)
    }
  }

  read(req) {
    return new Read({
      req,
      prefix: this.prefix,
      pageSize: this.pageSize,
      get: this._get,
      getSize: this._getSize,
    })
  }

  write(req) {
    return this.queue.push(
      callback =>
        new Write({
          callback,
          data: req.data,
          offset: req.offset,
          size: req.size,
          prefix: this.prefix,
          pageSize: this.pageSize,
          get: this._get,
          batch: this._batch,
          grow: this._grow,
        }),
      req.callback.bind(req)
    )
  }
}

function normalizeKey(path) {
  const match = path.match(new RegExp('^(/?)(.*?)(/?)$'))
  const slashesTrimmed = match[2]
  return slashesTrimmed.trim()
}
