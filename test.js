const makeCoHyperdrive = require('./')

const test = require('tape')
const SDK = require('dat-sdk')

const FILE = '/example.txt'
const DATA = 'Hello World!'

test('Initialize a co-hyperdrive, read it from another peer', (t) => {
  Promise.all([
    SDK({ persist: false }),
    SDK({ persist: false })
  ]).then(([
    { Hyperdrive: Hyperdrive1, close: close1 },
    { Hyperdrive: Hyperdrive2, close: close2 }
  ]) => {
    const original = makeCoHyperdrive(Hyperdrive1, 'example')

    original.ready(() => {
      t.pass('drive ready after creation')

      original.writeFile(FILE, DATA, (err) => {
        t.error(err, 'able to write file')

        const clone = makeCoHyperdrive(Hyperdrive2, original.key)

        clone.ready(() => {
          t.pass('drive ready after clone')
          t.deepEqual(original.key, clone.key, 'Clone got correct key')
          if (clone.peers.length) verifyFile()
          else clone.once('peer-open', verifyFile)
        })

        function verifyFile () {
          clone.readFile(FILE, 'utf8', (err, data) => {
            t.error(err, 'no error while reading')
            t.deepEqual(data, DATA, 'got data in clone')
            t.end()
            close1()
            close2()
          })
        }
      })
    })
  })
})
test('Authorize a writer, read it from another peer', (t) => {
  Promise.all([
    SDK({ persist: false }),
    SDK({ persist: false })
  ]).then(([
    { Hyperdrive: Hyperdrive1, close: close1 },
    { Hyperdrive: Hyperdrive2, close: close2 }
  ]) => {
    const original = makeCoHyperdrive(Hyperdrive1, 'example')

    const writer = Hyperdrive1('example2')

    writer.writeFile(FILE, DATA, () => {
      original.authorize(writer.key, (err) => {
        t.error(err, 'no error authorizing')

        const clone = makeCoHyperdrive(Hyperdrive2, original.key)

        clone.ready(() => {
          if (clone.peers.length) verifyFile()
          else clone.once('peer-open', verifyFile)
        })

        function verifyFile () {
          clone.readFile(FILE, 'utf8', (err, data) => {
            t.error(err, 'no error while reading')
            t.deepEqual(data, DATA, 'got authorized writer data in clone')
            t.end()
            close1()
            close2()
          })
        }
      })
    })
  })
})
test('Request authorization, get added and read a file', (t) => {
  Promise.all([
    SDK({ persist: false }),
    SDK({ persist: false })
  ]).then(([
    { Hyperdrive: Hyperdrive1, close: close1 },
    { Hyperdrive: Hyperdrive2, close: close2 }
  ]) => {
    const original = makeCoHyperdrive(Hyperdrive1, 'example', { onAuth: allowAll })

    function allowAll (key, peer, sendAuth) {
      sendAuth(true)
    }

    const writer = Hyperdrive2('example2')

    writer.ready(() => {
      const clone = makeCoHyperdrive(Hyperdrive2, original.key, { onAuth: allowAll })

      clone.ready(() => {
        if (clone.peers.length) requestAuth()
        else clone.once('peer-open', requestAuth)
      })

      function requestAuth () {
        clone.requestAuthorization(writer.key, (err) => {
          t.error(err, 'no error authorizing')
          verifyFile()
        })
      }

      function verifyFile () {
        clone.writeFile(FILE, DATA, (err) => {
          t.error(err, 'able to write to clone')
          clone.readFile(FILE, 'utf8', (err, data) => {
            t.error(err, 'no error while reading')
            t.deepEqual(data, DATA, 'got authorized writer data in clone')
            t.end()
            close1()
            close2()
          })
        })
      }
    })
  })
})

test('Authorize a writer, clone, de-authorize, read file', (t) => {
  Promise.all([
    SDK({ persist: false }),
    SDK({ persist: false })
  ]).then(([
    { Hyperdrive: Hyperdrive1, close: close1 },
    { Hyperdrive: Hyperdrive2, close: close2 }
  ]) => {
    const original = makeCoHyperdrive(Hyperdrive1, 'example')

    const writer = Hyperdrive1('example2')

    writer.writeFile(FILE, DATA, () => {
      original.authorize(writer.key, (err) => {
        t.error(err, 'no error authorizing')

        const clone = makeCoHyperdrive(Hyperdrive2, original.key)

        clone.ready(() => {
          if (clone.peers.length) verifyFile()
          else clone.once('peer-open', verifyFile)
        })

        function verifyNoFile () {
          clone.readFile(FILE, 'utf8', (err) => {
            t.ok(err, 'File no longer exists')
            t.end()
            close1()
            close2()
          })
        }

        function verifyFile () {
          clone.readFile(FILE, 'utf8', (err, data) => {
            t.error(err, 'no error while reading')
            t.deepEqual(data, DATA, 'got authorized writer data in clone')
            original.deauthorize(writer.key, (err) => {
              t.error(err, 'no error deauthorizing')
              setTimeout(verifyNoFile, 100)
            })
          })
        }
      })
    })
  })
})
