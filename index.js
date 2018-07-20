const File = require('./lib/File')
const randomAccess = require('random-access-storage')

module.exports = function randomAccessKeyValue(db, prefix, options) {
  const file = new File(db, prefix, options)
  return randomAccess({
    read: function(req) {
      return file.read(req)
    },
    write: function(req) {
      return file.write(req)
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
