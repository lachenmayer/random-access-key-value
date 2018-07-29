const toBuffer = require('./to-buffer')

module.exports = class Read {
  constructor({ req, prefix, pageSize, get, getSize }) {
    this.req = req
    this.prefix = prefix
    this.pageSize = pageSize
    this.get = get
    this.getSize = getSize

    // TODO This makes random-access-test pass, but is this correct?
    if (req.size === 0) {
      return this.req.callback(null, Buffer.alloc(0))
    }

    const start = req.offset
    this.size = req.size
    this.end = req.offset + req.size
    this.startPage = Math.floor(start / this.pageSize)
    this.endPage = Math.floor(this.end / this.pageSize)

    // mutable $tate
    this.$page = this.startPage
    this.$offset = req.offset % this.pageSize
    this.$target = null
    this.$targetOffset = 0

    return this.getSize((err, size) => {
      if (err) {
        return this.req.callback(err)
      }
      if (this.end > size) {
        return this.req.callback(new Error('length unsatisfiable'))
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
        return this.req.callback(err)
      }
      value = toBuffer(value)
      const pageEnd = this.$offset + Math.min(this.pageSize, this.size)
      value.copy(this.$target, this.$targetOffset, this.$offset, pageEnd)
      return this._next()
    })
  }

  _finish() {
    return this.req.callback(null, this.$target)
  }

  _getKey() {
    return this.prefix + '/' + this.$page
  }
}
