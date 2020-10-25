# co-hyperdrive
Share a hyperdrive with others. A multiwriter hyperdrive implementation

## How it works

- Build on top of [multi-hyperdrive](https://github.com/RangerMauve/multi-hyperdrive) for combining drives.
- Every writer has their own hyperdrive, that gets combined with the others.
- Track writers to a given archive under a hidden `/.writers` key
- You can add a writer with `.authorize`, or remove with `.unauthorize`
- Before doing any FS access, resolve all current writers
- Use extension messages to request authorization from peers.

## Difference from multi-hyperdrive

With multi-hyperdrive, you can get a set of hyperdrives and treat them as a single entity. However, there's nothing built in for making sure every peer has the same set of hyperdrives loaded.

e.g. If P1 and P2 load a multi-hyperdrive, when P1 adds a drive, P2 won't know about it unless the application signals it out of band.

co-hyperdrive makes sure that every peer loading the drive have the same set of underlying hyperdrives loaded.

So if P1 is a writer and they authorize a new drive, P2 will see the new drive was added and automatically load it.

## Usage

```
npm i --save co-hyperdrive
```

```javascript
const CoHyperdrive = require('co-hyperdrive')

const drive = CoHyperdrive(getDrive, 'example', {
  onAuth
})

function getDrive(key) {
  // Resolve a key to a hyperdrive instance somehow
}

// When somebody requests to be authorized to write
// Determine whethery they should be allowed
function onAuth(key, peer, sendAuth) {
  sendAuth(true)
}

// If you're already a writer you can add more writers
drive.authorize(key, () => {
  // When you read from `drive` all the files from `key` will also be present
})

// If you're not a writer yet, you can ask to be one
// If nobody is online to grant this request, it'll time out.
drive.requestAuthorization(key, (err, granted) => {
  if(granted) console.log('
})

drive.writeFile('/example.txt', 'Hello world', () => {
  drive.readFile('/example.txt', console.log)
})
```

## API

Check out the [Multi-Hyperdrive](https://github.com/RangerMauve/multi-hyperdrive#api) docs for methods for reading and writing files.

This API will document the specific additions for adding/removing writers.

### `const drive = CoHyperdrive(getDrive, key, {onAuth, authTimeout, ...opts})`

This creates a CoHyperdrive instance.

`getDrive(key, opts)` should be a function that makes a given hyperdrive `key` to a Hyperdrive instance.
This is used to dynamically load and unload Hyperdrives for writers.
An easy implementation here would be to use the [Hyperdrive constructor from Dat-SDK](https://github.com/datproject/sdk#const-archive--hyperdrivekeyorname-opts).
If you're doing your own implementation, make sure you're replicating drives intellgiently.

`key` should be the key passed to `getDrive` to use in initialization.
Every CoHyperdrive needs the key of the primary drive to use for replication and authorization requests.

`onAuth(key, peer, cb(authorized))` is a function that gets invoked whenever a somebody has requested to add themselves as a writer.
You can verify that their `key` meets some criteria, or their `peer` might have a `remotePublicKey` that you've added to an allow-list or something.
You might want to try to load a drive and check it's contents for a proof before adding them for example.
Once you've determined the criteria, invoke `cb` with a boolean indicating whether they should be added as a writer (`true`), or to send them a denial (`false`).
By default, all authorization requests are rejected.

`authTimeout` is a timeout to use internally to time out an authorization request.
Set to 60 seconds by default.

`drive` is a CoHyperdrive instance that should look more or less like an actual Hyperdrive and should be usable in most places that a Hyperdrive is used.

### `drive.authorize(key, cb(err))`

Add another writer to the co-hyperdrive.
This only works if you're able to write to this co-hyperdrive already.

### `drive.deauthorize(key, cb(err))`

Remove an existing writer from the co-hyperdrive.
This only works if you're able to write to this co-hyperdrive already.
Note that there's potential for race conditions if two writers try to remove each other at once.
Once a writer has been removed, they can be added again by another writer.

### `drive.requestAuthorization(key, cb(err, granted))`

Use this if you want an existing writer to add you as a writer.
This requires other writers to be online, and for them to have a custom `onAuth` function that would accept more writers.
If you have been added, you will get `granted` true, else if the request times out or if you've been denied, `granted` will be false.

## TODO:

- Use vector clocks or bloom clocks for writer resolution instead of wall clocks
- Account for when you're not directly connected to a writer, but others are (flooding?)

## Credits

Ce logiciel est une réalisation de Wapikoni Mobile, Uhu Labos Nomades et du Bureau de l’engagement communautaire de l’université Concordia.
Projet financé dans le cadre de l’Entente sur le développement culturel de Montréal conclue entre la Ville de Montréal et gouvernement du Québec.

This project is made possible thanks to the collaboration of Wapikoni mobile and its technical team, Uhu Labos Nomades (Indigenous media arts training project working with Indigenous youth) and Concordia University’s Office of Community Engagement.
This project was funded under the Montreal cultural development agreement between the city of Montreal and the government of Quebec.

[![Wapikoni Mobile](logos/wapikoni.png)](http://www.wapikoni.ca/home)
[![Uhu](logos/uhu.jpg)](https://www.facebook.com/uhulabosnomades/)
[![Concordia University](logos/concordia.png)](http://www.concordia.ca/)
[![Mauve Software Inc.](logos/mauvesoftwareinc.png)](https://software.mauve.moe/)

![Quebec](logos/quebec.png)
![Montreal](logos/montreal.jpg)
