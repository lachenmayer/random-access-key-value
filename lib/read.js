const toBuffer = require('./to-buffer')

module.exports = class Read {
  constructor(req) {
    this.callback = req.callback

    // TODO This makes random-access-test pass, but is this correct?
    if (req.size === 0) {
      return this.callback(null, Buffer.alloc(0))
    }

    this.prefix = req.prefix
    const start = req.offset
    this.size = req.size
    this.end = req.offset + req.size
    this.startPage = Math.floor(start / req.pageSize)
    this.endPage = Math.floor(this.end / req.pageSize)

    this.pageSize = req.pageSize
    this.get = req.get
    this.getSize = req.getSize

    // mutable $tate
    this.$page = this.startPage
    this.$offset = req.offset % this.pageSize
    this.$target = null
    this.$targetOffset = 0

    return this.getSize((err, size) => {
      if (err) {
        return this.callback(err)
      }
      if (this.end > size) {
        return this.callback(new Error('length unsatisfiable'))
      }
      this.$target = Buffer.alloc(req.size)
      return this._loop()
    })
  }

  _next() {
    this.$page += 1
    this.$targetOffset += this.pageSize - this.$offset
    this.$offset = 0

    return this._loop()
  }

  _loop() {
    if (this.$page > this.endPage) {
      return this._finish()
    }
    const key = this._getKey()
    this.get(key, (err, value) => {
      if ((err && err.notFound) || value == null) {
        return this._next()
      } else if (err) {
        return this.callback(err)
      }
      value = toBuffer(value)
      const pageEnd = this.$offset + Math.min(this.pageSize, this.size)
      value.copy(this.$target, this.$targetOffset, this.$offset, pageEnd)
      return this._next()
    })
  }

  _finish() {
    return this.callback(null, this.$target)
  }

  _getKey() {
    return this.prefix + '/' + this.$page
  }
}
