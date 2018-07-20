const test = require('tape')

const CallbackQueue = require('./')

test('it runs some jobs', t => {
  const queue = new CallbackQueue()
  let i = 0
  function increment(cb) {
    process.nextTick(() => {
      i++
      cb(null)
    })
  }
  queue.push(increment, err => {
    t.error(err, 'no error')
    t.is(i, 1, 'incremented once')
  })
  queue.push(increment, err => {
    t.error(err, 'no error')
    t.is(i, 2, 'incremented twice')
  })
  queue.push(increment, err => {
    t.error(err, 'no error')
    t.is(i, 3, 'incremented thrice')
    t.end()
  })
})
