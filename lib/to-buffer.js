module.exports = function toBuffer(bufOrStr) {
  if (Buffer.isBuffer(bufOrStr)) {
    return bufOrStr
  }
  if (typeof bufOrStr === 'string') {
    return Buffer.from(bufOrStr)
  }
  return new TypeError('must be a buffer or a string')
}
