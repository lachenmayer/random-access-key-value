exports.hypertrie = function hypertrie() {
  const hypertrie = require('hypertrie')
  const ram = require('random-access-memory')
  const db = hypertrie(ram)
  return {
    get: function(key, cb) {
      return db.get(key, (err, node) => {
        if (err) return cb(err)
        return cb(null, node ? node.value : null)
      })
    },
    put: db.put.bind(db),
    batch: db.batch.bind(db),
  }
}

exports.hyperdb = function hyperdb() {
  const hyperdb = require('hyperdb')
  const ram = require('random-access-memory')
  const db = hyperdb(ram, {
    firstNode: true,
  })
  return {
    get: function(key, cb) {
      return db.get(key, (err, node) => {
        if (err) return cb(err)
        return cb(null, node ? node.value : null)
      })
    },
    put: db.put.bind(db),
    batch: db.batch.bind(db),
  }
}

exports.leveldb = function leveldb() {
  const levelup = require('levelup')
  const memdown = require('memdown')
  return levelup(memdown())
}
