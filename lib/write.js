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

  constructor({
    callback,
    data,
    offset,
    size,
    prefix,
    pageSize,
    get,
    batch,
    grow,
  }) {
    this.callback = callback
    this.data = data
    const start = offset
    this.end = offset + size
    this.startPage = Math.floor(start / pageSize)
    this.endPage = Math.floor(this.end / pageSize)
    this.prefix = prefix
    this.pageSize = pageSize
    this.get = get
    this.batch = batch
    this.grow = grow

    // mutable $tate
    this.$page = this.startPage
    this.$offset = offset % pageSize
    this.$bytesWritten = 0
    this.$remainingBytes = size
    this.$ops = []

    return this._loop()
  }

  _next(bytesWritten, op) {
    this.$page += 1
    this.$offset = 0
    this.$bytesWritten += bytesWritten
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
        return this.callback(err)
      }
      return this.grow(this.end, err => {
        return this.callback(err)
      })
    })
  }

  _writeFullPage() {
    const start = this.$bytesWritten
    const end = this.$bytesWritten + this.pageSize
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
        return this.callback(err)
      }
      try {
        value = toBuffer(value)
      } catch (err) {
        return this.callback(err)
      }
      const bytesToWrite = Math.max(
        0,
        Math.min(this.pageSize - this.$offset, this.$remainingBytes)
      )
      const dataEnd = this.$bytesWritten + bytesToWrite
      let bytesWritten = this.data.copy(
        value,
        this.$offset,
        this.$bytesWritten,
        dataEnd
      )
      if (bytesWritten < bytesToWrite) {
        // the buffer was not big enough, allocate a new one.
        const newSize = Math.max(
          this.end,
          value.length + bytesToWrite - bytesWritten
        )
        const newBuffer = Buffer.alloc(newSize)
        value.copy(newBuffer)
        bytesWritten = this.data.copy(
          newBuffer,
          this.$offset,
          this.$bytesWritten,
          dataEnd
        )
        assert(
          bytesWritten === bytesToWrite,
          'should write all bytes in new buffer'
        )
        value = newBuffer
      }
      const op = { type: 'put', key, value }
      return this._next(bytesWritten, op)
    })
  }

  _getKey() {
    return this.prefix + '/' + this.$page
  }
}
