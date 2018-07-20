const fifo = require('fifo')

module.exports = class CallbackQueue {
  constructor() {
    this.queue = fifo()
  }

  push(job, callback) {
    if (job.length !== 1) {
      throw new Error('job needs to take a callback only.')
    }
    this.queue.push({ job, callback: callback || function() {} })
    this.run()
  }

  run() {
    const first = this.queue.shift()
    if (first != null) {
      first.job((err, result) => {
        if (err) {
          return first.callback(err)
        }
        first.callback(err, result)
        this.run()
      })
    }
  }
}
