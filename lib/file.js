const CallbackQueue = require('./callback-queue')
const toBuffer = require('./to-buffer')
const uint64be = require('uint64be')
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
    this.queue = new CallbackQueue()
  }

  read(req) {
    const self = this
    if (req.size === 0) {
      return req.callback(null, Buffer.alloc(0))
    }
    const start = req.offset
    const end = req.offset + req.size
    const startPage = Math.floor(start / this.pageSize)
    const endPage = Math.floor(end / this.pageSize)
    const offsetInPage = req.offset % this.pageSize
    return this.getSize((err, size) => {
      if (err) {
        return req.callback(err)
      }
      if (end > size) {
        return req.callback(new Error('length unsatisfiable'))
      }

      const target = Buffer.alloc(req.size)
      return readPages(startPage, offsetInPage, 0)

      function readPages(page, offsetInPage, targetOffset) {
        function next() {
          return readPages(
            page + 1,
            0,
            targetOffset + (self.pageSize - offsetInPage)
          )
        }
        if (page > endPage) {
          return req.callback(null, target)
        }

        const key = self.prefix + '/' + page
        return self.db.get(key, (err, value) => {
          if ((err && err.notFound) || value == null) {
            return next()
          } else if (err) {
            return req.callback(err)
          }
          value = toBuffer(value)
          const pageEnd = offsetInPage + Math.min(self.pageSize, req.size)
          value.copy(target, targetOffset, offsetInPage, pageEnd)
          return next()
        })
      }
    })
  }

  write(req) {
    const write = callback =>
      new Write({
        callback,

        prefix: this.prefix,
        data: req.data,
        offset: req.offset,
        size: req.size,

        pageSize: this.pageSize,
        get: this.db.get.bind(this.db),
        batch: this.db.batch.bind(this.db),
        grow: this.grow.bind(this),
      })

    this.queue.push(write, err => req.callback(err))
  }

  // We need to write the size so that we can differentiate between reads past
  // the end (=> unsatisfiable length) and reads in empty pages (=> return \0s).

  // cb: (err, size in bytes)
  getSize(cb) {
    return this.db.get(this.sizeKey, (err, value) => {
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
  grow(size, cb) {
    return this.getSize((err, oldSize) => {
      if (err) {
        return cb(err)
      }
      if (size > oldSize) {
        return this.db.put(this.sizeKey, uint64be.encode(size), err => {
          return cb(err)
        })
      }
      return cb(null)
    })
  }
}

function normalizeKey(path) {
  const match = path.match(new RegExp('^(/?)(.*?)(/?)$'))
  const slashesTrimmed = match[2]
  return slashesTrimmed.trim()
}
