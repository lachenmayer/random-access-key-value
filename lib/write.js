const assert = require('assert')
const toBuffer = require('./to-buffer')

module.exports = class Write {
  // for each page to be written, either...
  // 1. page is fully overwritten
  //   conditions: offset == 0 && size >= this.pageSize
  //   algorithm:
  //     slice buffer to this.pageSize
  //     write the whole thing
  // 2. page is not fully overwritten
  //   conditions: offset > 0 || size < this.pageSize
  //   algorithm:
  //     get page
  //     if found...
  //       write in the correct place in the buffer
  //     else
  //       pad with \0 if offset > 0
  //       write buffer

  constructor({ req, prefix, pageSize, get, batch, grow }) {
    this.req = req
    this.prefix = prefix
    this.pageSize = pageSize
    this.get = get
    this.batch = batch
    this.grow = grow

    this.data = req.data
    const start = req.offset
    this.end = req.offset + req.size
    this.startPage = Math.floor(start / this.pageSize)
    this.endPage = Math.floor(this.end / this.pageSize)

    // mutable $tate
    this.$page = this.startPage
    this.$offset = req.offset % this.pageSize
    this.$remainingBytes = req.size
    this.$ops = []

    return this._loop()
  }

  _next(bytesWritten, op) {
    this.$page += 1
    this.$offset = 0
    this.$remainingBytes -= bytesWritten
    this.$ops.push(op)

    return this._loop()
  }

  _loop() {
    if (this.$page > this.endPage) {
      return this._finish()
    } else if (this.$offset === 0 && this.$remainingBytes >= this.pageSize) {
      return this._writeFullPage()
    } else {
      return this._writePartialPage()
    }
  }

  _finish() {
    assert(this.$remainingBytes === 0, 'should write all bytes')
    return this.batch(this.$ops, err => {
      if (err) {
        return this.req.callback(err)
      }
      return this.grow(this.end, err => {
        return this.req.callback(err)
      })
    })
  }

  _writeFullPage() {
    const relativePage = this.$page - this.startPage
    const start = this.pageSize * relativePage
    const end = this.pageSize * (relativePage + 1)
    const key = this._getKey()
    const value = this.data.slice(start, end)
    const op = { type: 'put', key, value }
    return this._next(this.pageSize, op)
  }

  _writePartialPage() {
    const key = this._getKey()
    return this.get(key, (err, value) => {
      const size = Math.min(this.pageSize, this.$offset + this.$remainingBytes)
      if ((err && err.notFound) || value == null) {
        value = Buffer.alloc(size)
      } else if (err) {
        return this.req.callback(err)
      }
      try {
        value = toBuffer(value)
      } catch (err) {
        return this.req.callback(err)
      }
      const relativePage = this.$page - this.startPage
      const dataStart = relativePage * this.pageSize
      const bytesToWrite = Math.max(
        0,
        Math.min(this.pageSize - this.$offset, this.$remainingBytes)
      )
      const dataEnd = dataStart + bytesToWrite
      const bytesWritten = this.data.copy(
        value,
        this.$offset,
        dataStart,
        dataEnd
      )
      if (bytesWritten < bytesToWrite) {
        // the buffer was not big enough, allocate a new one.
        const newSize = Math.max(
          this.end,
          value.length + bytesToWrite - bytesWritten
        )
        value = Buffer.alloc(newSize, value)
        const retryBytes = this.data.copy(
          value,
          this.$offset,
          dataStart,
          dataEnd
        )
        assert(
          retryBytes === bytesToWrite,
          'should write all bytes in new buffer'
        )
      }
      const op = { type: 'put', key, value }
      return this._next(bytesToWrite, op)
    })
  }

  _getKey() {
    return this.prefix + '/' + this.$page
  }
}
