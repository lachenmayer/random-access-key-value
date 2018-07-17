const assert = require('assert')
const randomAccess = require('random-access-storage')
const uint64be = require('uint64be')

// idea:
// write a random-access.json file containing:
//   - pageSize: number
//   - pageSizeOverride: {number: number}
// reason for pageSizeOverride:
// want to write eg. a hypercore tree efficiently.
// tree has a fixed size header (H) & fixed size nodes (N).
// if you make pageSize=N, pageSizeOverride={0: H}, you can
// write each node to one page exactly.

module.exports = function randomAccessKeyValue(db, prefix, options) {
  if (
    typeof db.get !== 'function' ||
    typeof db.put !== 'function' ||
    typeof db.batch !== 'function'
  ) {
    throw new TypeError('db needs to support get, put, batch.')
  }
  if (typeof prefix !== 'string') {
    throw new TypeError('prefix needs to be a string')
  }
  prefix = normalizeKey(prefix)
  options = options || {}
  const pageSize = 4096 // TODO make configurable

  // We need to write the size so that we can differentiate between reads past
  // the end (=> unsatisfiable length) and reads in empty pages (=> return \0s).

  const sizeKey = prefix + '/size'
  // cb: (err, size in bytes)
  function getSize(cb) {
    return db.get(sizeKey, (err, value) => {
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
  function setSize(size, cb) {
    return getSize((err, oldSize) => {
      if (err) {
        return cb(err)
      }
      if (size > oldSize) {
        return db.put(sizeKey, uint64be.encode(size), err => {
          return cb(err)
        })
      }
      return cb(null)
    })
  }

  return randomAccess({
    read: function(req) {
      if (req.size === 0) {
        return req.callback(null, Buffer.alloc(0))
      }
      const start = req.offset
      const end = req.offset + req.size
      const startPage = Math.floor(start / pageSize)
      const endPage = Math.floor(end / pageSize)
      const offsetInPage = req.offset % pageSize
      return getSize((err, size) => {
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
              targetOffset + (pageSize - offsetInPage)
            )
          }
          if (page > endPage) {
            return req.callback(null, target)
          }

          const key = prefix + '/' + page
          return db.get(key, (err, value) => {
            if ((err && err.notFound) || value == null) {
              return next()
            } else if (err) {
              return req.callback(err)
            }
            value = toBuffer(value)
            const pageEnd = offsetInPage + Math.min(pageSize, req.size)
            value.copy(target, targetOffset, offsetInPage, pageEnd)
            return next()
          })
        }
      })
    },

    write: function(req) {
      // for each page to be written, either...
      // 1. page is fully overwritten
      //   conditions: offset == 0 && size >= pageSize
      //   algorithm:
      //     slice buffer to pageSize
      //     write the whole thing
      // 2. page is not fully overwritten
      //   conditions: offset > 0 || size < pageSize
      //   algorithm:
      //     get page
      //     if found...
      //       write in the correct place in the buffer
      //     else
      //       pad with \0 if offset > 0
      //       write buffer

      const start = req.offset
      const end = req.offset + req.size
      const startPage = Math.floor(start / pageSize)
      const endPage = Math.floor(end / pageSize)
      const offsetInPage = req.offset % pageSize
      const ops = []

      writePages(startPage, offsetInPage, req.size, onwrite)

      function writePages(page, offset, remainingBytes, cb) {
        const relativePage = page - startPage
        function next(bytesWritten) {
          return writePages(page + 1, 0, remainingBytes - bytesWritten, cb)
        }

        if (page > endPage) {
          // all ops have been computed, actually perform the write.
          assert(remainingBytes === 0, 'should write all bytes')
          return db.batch(ops, cb)
        }

        const key = prefix + '/' + page
        if (offset == 0 && remainingBytes >= pageSize) {
          // write a full page.
          ops.push({
            type: 'put',
            key,
            value: req.data.slice(
              pageSize * relativePage,
              pageSize * (relativePage + 1)
            ),
          })
          return next(pageSize)
        } else {
          // write a partial page.
          // the page may contain data already, so we need to get it first.
          return db.get(key, (err, value) => {
            const size = Math.min(pageSize, offset + remainingBytes)
            const bytesToWrite = Math.max(
              0,
              Math.min(pageSize - offset, remainingBytes)
            )
            if ((err && err.notFound) || value == null) {
              value = Buffer.alloc(size)
            } else if (err) {
              return cb(err)
            }
            try {
              value = toBuffer(value)
            } catch (err) {
              return cb(err)
            }
            const start = relativePage * pageSize
            const end = start + bytesToWrite
            const bytesWritten = req.data.copy(value, offset, start, end)
            if (bytesWritten < bytesToWrite) {
              // the buffer was not big enough, allocate a new one.
              value = Buffer.alloc(
                value.length + (bytesToWrite - bytesWritten),
                value
              )
              const retryBytes = req.data.copy(value, offset, start, end)
              assert(retryBytes === bytesToWrite, 'should write all bytes')
            }
            ops.push({
              type: 'put',
              key,
              value,
            })
            return next(bytesToWrite)
          })
        }
      }

      function onwrite(err) {
        if (err) {
          return req.callback(err)
        }
        return setSize(end, err => {
          return req.callback(err)
        })
      }
    },

    open: function(req) {
      if (typeof db.open === 'function') {
        return db.open(err => req.callback(err))
      } else {
        return req.callback(null)
      }
    },

    close: function(req) {
      if (typeof db.close === 'function') {
        return db.close(err => req.callback(err))
      } else {
        return req.callback(null)
      }
    },
  })
}

function toBuffer(bufOrStr) {
  if (Buffer.isBuffer(bufOrStr)) {
    return bufOrStr
  }
  if (typeof bufOrStr === 'string') {
    return Buffer.from(bufOrStr)
  }
  return new TypeError('must be a buffer or a string')
}

function normalizeKey(path) {
  const match = path.match(new RegExp('^(/?)(.*?)(/?)$'))
  const slashesTrimmed = match[2]
  return slashesTrimmed.trim()
}
