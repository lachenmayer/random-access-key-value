const test = require('tape')

const rakv = require('../')

const { leveldb } = require('./_db')

test('write & read over page boundary', t => {
  const db = leveldb()
  const storage = rakv(db, 'page-boundary')
  const buf = Buffer.from('living on the edge')
  storage.write(4090, buf, err => {
    t.error(err)
    storage.read(4090, buf.length, (err, actualBuf) => {
      t.error(err)
      t.deepEqual(actualBuf, buf, 'buffer is not mangled')
      t.end()
    })
  })
})

test('write & read over page boundaries with a full page in between', t => {
  const db = leveldb()
  const storage = rakv(db, 'misaligned')
  const buf = Buffer.alloc(2 + 4096 + 2, '🤔')
  storage.write(4094, buf, err => {
    t.error(err)
    storage.read(4094, buf.length, (err, actualBuf) => {
      t.error(err)
      t.deepEqual(actualBuf, buf, 'buffer is not mangled')
      t.end()
    })
  })
})
