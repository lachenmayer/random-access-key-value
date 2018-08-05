const test = require('random-access-test')

const randomAccess = require('../')

const { leveldb } = require('./_db')

const db = leveldb()

test(
  function(name, options, callback) {
    callback(randomAccess(db, name, options))
  },
  {
    reopen: true,
    content: false,
    del: false,
    writable: true,
    size: false,
  }
)
