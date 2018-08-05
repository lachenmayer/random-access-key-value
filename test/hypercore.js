const test = require('tape')
const hypercore = require('hypercore')
const ram = require('random-access-memory')

const rakv = require('../')

const { leveldb } = require('./_db')

test('data & tree contain the same content after some appends', t => {
  const expected = {}
  const actual = {}
  const expectedFeed = hypercore(file => {
    const storage = ram()
    expected[file] = storage
    return storage
  })
  const db = leveldb()
  const actualFeed = hypercore(file => {
    const storage = rakv(db, file)
    actual[file] = storage
    return storage
  })

  expectedFeed.append('foo')
  actualFeed.append('foo')
  expectedFeed.append('barz')
  actualFeed.append('barz')
  expectedFeed.append('bazzle')
  actualFeed.append('bazzle', err => {
    t.error(err)
    expected.data.read(0, 13, (err, expectedData) => {
      t.error(err)
      actual.data.read(0, 13, (err, actualData) => {
        t.error(err)
        t.deepEqual(expectedData, actualData)
      })
    })
    const expectedTreeSize = 32 + 40 * 5
    expected.tree.read(0, expectedTreeSize, (_err, expectedTree) => {
      actual.tree.read(0, expectedTreeSize, (err, actualTree) => {
        t.error(err)
        t.deepEqual(expectedTree, actualTree)
        t.end()
      })
    })
  })
})

test('append loads', t => {
  const db = leveldb()
  const feed = hypercore(file => rakv(db, file))
  t.plan(10000)
  for (let i = 0; i < 10000; i++) {
    feed.append('boop', err => {
      t.error(err)
    })
  }
})
