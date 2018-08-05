const toBuffer = require('./to-buffer')

module.exports = class Read {
  constructor({ callback, offset, size, prefix, pageSize, get, getSize }) {
    this.callback = callback
    const start = offset
    this.size = size
    this.end = offset + size
    this.startPage = Math.floor(start / pageSize)
    this.endPage = Math.floor(this.end / pageSize)
    this.prefix = prefix
    this.pageSize = pageSize
    this.get = get
    this.getSize = getSize

    // TODO This makes random-access-test pass, but is this correct?
    if (size === 0) {
      return this.callback(null, Buffer.alloc(0))
    }

    // mutable $tate
    this.$page = this.startPage
    this.$offset = offset % pageSize
    this.$target = null
    this.$targetOffset = 0

    return this.getSize((err, size) => {
      if (err) {
        return this.callback(err)
      }
      if (this.end > size) {
        return this.callback(new Error('length unsatisfiable'))
      }
      this.$target = Buffer.alloc(this.size)
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
      const pageEnd = Math.min(
        value.length,
        this.$offset + Math.min(this.pageSize, this.size)
      )
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
