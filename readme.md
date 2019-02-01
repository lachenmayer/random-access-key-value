# random-access-key-value

**⚠️ EXPERIMENTAL ️️️️️️⚠️**

[![Build Status](https://travis-ci.com/lachenmayer/random-access-key-value.svg?branch=master)](https://travis-ci.com/lachenmayer/random-access-key-value)

Create a [random-access-storage](https://github.com/random-access-storage/random-access-storage) instance from any key-value store.

```
npm install random-access-key-value
```

## Why?

This module lets you use any [LevelDB-compatible](https://github.com/Level/awesome) data store as storage backend for any data structure in the [Dat](https://datproject.org) ecosystem, such as [hyperdrive](https://www.npmjs.com/package/hyperdrive) or [hyperdb](https://www.npmjs.com/package/hyperdb).

With a little bit of tweaking, you can use [hyperdb](https://www.npmjs.com/package/hyperdb) as a storage backend for another [hyperdb](https://www.npmjs.com/package/hyperdb).

## Usage

```js
const levelup = require('levelup')
const memdown = require('memdown')
const randomAccessKeyValue = require('random-access-key-value')

const db = levelup(memdown())

const storage = randomAccessKeyValue(db, 'some/path')

storage.write(10, Buffer.from('hello'), function(err) {
  // write a buffer to offset 10
  storage.read(10, 5, function(err, buffer) {
    console.log(buffer) // read 5 bytes from offset 10
  })
})
```

## API

```js
const storage = randomAccessKeyValue(db, prefix, [options])
```

- `db` should be an object that is compatible with a really small subset of the [LevelUP API](https://www.npmjs.com/package/levelup#api). It only needs to support the most basic operations:

    ```typescript
    db.get(key: string, cb: (err: Error | null, value: string | Buffer) => any)
    db.put(key: string, value: Buffer, cb: (err: Error | null) => any)
    db.batch(ops: Array<{ type: 'put', key: string, value: string | Buffer }>, cb: (err: Error | null) => any)

    // optional:
    db.open(cb: (err: Error | null) => any)
    db.close(cb: (err: Error | null) => any)
    ```

    Importantly, the db should return binary data (ie. `Buffer`) unchanged.

    (The requirement for `db.batch` may be dropped at some point, as it would be fairly straightforward to implement this for dbs that don't support this. Open an issue/PR if you'd like this removed.)

- `prefix` is a string - it defines the prefix that all the pages are stored under.

- `options` **not implemented yet**

## How it works

The [`random-access-storage`](https://github.com/random-access-storage/random-access-storage) interface represents a single unbounded buffer that lets you read and write from any offset. This module splits this conceptual buffer into "pages" (currently 4KB, but this should be tuneable), which are stored as values in the key-value store.

## License

MIT © 2018 harry lachenmayer
