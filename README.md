Crinolo's SWGoH stat calculator
------------

Installation:
------------
`npm install crinolo-swgoh-stat-calc`

Usage:
------------
```js
const crinolo = require('crinolo-swgoh-stat-calc');

const roster = [...];

const data = await crinolo.stats(roster, ["gameStyle"]);
```
`roster` is an object formatted the same as the objects returned by [api.swgoh.help](https://api.swgoh.help/swgoh). 

Check Crinolo\'s website for available flags.


Based on [Crinolo's API](https://swgoh-stat-calc.glitch.me/)
-------------------
