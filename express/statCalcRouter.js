// init express Router
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const dataBuilder = require(__dirname + '/../statCalc/dataBuilder.js');
const statCalculator = require(__dirname + '/../statCalc/statCalculator.js');
const ApiSwgohHelp = require('api-swgoh-help');
const swapi = new ApiSwgohHelp({
	"username":process.env.SWGOH_HELP_UNAME,
	"password":process.env.SWGOH_HELP_PASS
});
var gameData;
const maxValues = {
  char: {
    rarity: 7,
    level: process.env.MAX_LEVEL,
    gear: process.env.MAX_GEAR_LEVEL,
    equipped: "all"
  },
  ship: {
    rarity: 7,
    level: process.env.MAX_LEVEL
  },
  crew: {
    rarity: 7,
    level: process.env.MAX_LEVEL,
    gear: process.env.MAX_GEAR_LEVEL,
    equipped: "all",
    skills: "max",
    modRarity: process.env.MAX_MOD_PIPS,
    modLevel: 15
  }
};

const ready = startup();


async function startup() {
  gameData = await dataBuilder.loadData(__dirname + '/../statCalcData/');
  statCalculator.setGameData(gameData);
  // statCalculator.setMaxValues( +process.env.MAX_LEVEL, +process.env.MAX_GEAR_LEVEL, +process.env.MAX_MOD_PIPS);
  console.log("gameData acquired.  Server Ready.");
}





// html options for web-viewable descriptions/documentation:
router.get('/',(req,res) => {
  res.sendFile(__dirname + '/statCalc.html');
});


// ******************************
// ***** All Express Routes *****
// ******************************

// ensure proper support for CORS
router.options("/api/*", function(req, res, next){
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.sendStatus(204);
});

router.use(express.static('statCalcData'));

// add incoming timestamp
router.use((req,res,next) => {req.timestamp = new Date(); next();});

// make sure setup is complete
router.use( (req,res,next) => {
  ready.then( next, err => {
    console.error(err);
    throw new Error("Failed to load Game Data.");
  }).catch( next );
});

// parse query into 'options' object
router.use((req,res,next) => {
  // flags for data control
  let flags = req.query.flags ? req.query.flags.split(',') : [];
  req.options = {};
  flags.forEach(flag => req.options[flag] = true);
  
  // useValues definition
  if (req.query.useValues) {
    function addJSONtoObj(text, obj) {
      let propPattern = /(\w+)"?:"?(?:(\d+?)|(\w+?)|(\[.*\]))"?[,}]/g,
          match;
      while ( ( match = propPattern.exec(text) ) !== null) {
        obj[ match[1] ] = +match[2] || match[3] || JSON.parse[ match[4] ]; // Only array option should be an array of ints, which doesn't use quotes
      }
    }
    
    let groupPattern = /(char|ship|crew)"?:({.*?})/g;
    let match;
    req.options.useValues = {};
    while ( ( match = groupPattern.exec(req.query.useValues) ) !== null) {
      addJSONtoObj(match[2], req.options.useValues[ match[1] ] = {})
    }
    
    if (!Object.keys(req.options.useValues).length) { // no sub-objects defined -- just overall parameters
      let obj = {};
      addJSONtoObj(req.query.useValues, obj);
      req.options.useValues = {
        char: {
          rarity: obj.rarity,
          level: obj.level,
          gear: obj.gear,
          equipped: obj.equipped
        },
        ship: {
          rarity: obj.rarity,
          level: obj.level
        },
        crew: {
          rarity: obj.rarity,
          level: obj.level,
          gear: obj.gear,
          equipped: obj.equipped,
          skills: obj.skills,
          modRarity: obj.modRarity,
          modLevel: obj.modLevel
        }
      };
    }
  }
  
  // useMax flag creates (and overwrites) a useValues object in options
  if (req.options.useMax)
    req.options.useValues = Object.assign({}, maxValues);
  
  // set language
  if (!req.options.statIDs) { // 'statIDs' flag will leave stats without a language
    let file = __dirname + "/../statCalcData/lang/";
    if (req.options.enums) {
      file += "statEnum.json";
    } else {
      file += (req.query.language || "eng_us").toLowerCase() + ".json";
    }
    req.options.language = require(file);
  }
  
  
  next();
});

// ******************************
// ******* POST Endpoints *******
// ******************************

// rosterType enum object
const rosterType = {
  PLAYER: '/player',          // .help's /player endpoint's full player profile (array of players)
  P_ROSTER: '/player.roster', // .help's /player endpoint's 'roster' property (array of units)
  UNITS: '/units',            // .help's /units endpoint (object of arrays indexed by base ID)
  ROSTER: '/roster'           // .help's /roster endpoint (array of objects from /units)
};

// parse out POST body, determine roster type, and define stat options
//   -req.rosterType = rosterType enum for the POST body
//   -req.options = options object for statCalculator
router.post(['/api','/api/characters','/api/ships'], bodyParser.json({limit:'100mb'}), async (req, res, next) => {
  if (req.body.constructor === Array) {
    if (req.body[0].roster) { // first object in array is a player profile
      req.rosterType = rosterType.PLAYER;
    } else if (req.body[0].defId) { // first object in array is a unit
      req.rosterType = rosterType.P_ROSTER;
    } else { // only other accepted array type is .help's /roster format -- asserted to be true if here
      req.rosterType = rosterType.ROSTER;
    }
  } else { // only accepted non-array format is from .help's /units -- asserted to be true if here
    req.rosterType = rosterType.UNITS;
  }
  req.calcTime = new Date();
  next();
});

// return stats for all units in roster
router.post('/api', (req, res, next) => {
  let stats;
  try {
    switch (req.rosterType) {
      case rosterType.P_ROSTER:
      case rosterType.UNITS:  // both formats directly accepted by statCalculator
        res.count = statCalculator.calcRosterStats(req.body, req.options);
        break;
      case rosterType.PLAYER:
        res.count = statCalculator.calcPlayerStats(req.body, req.options);
        break;
      case rosterType.ROSTER:
        let count = 0;
        res.roster = req.body.forEach( roster => {
          count += statCalculator.calcRosterStats(roster, req.options);
        });
        res.count = count;
        break;
      default:
        res.status(400);
        throw new Error('Unsupported object type');
    }
    res.roster = req.body;
    next();
  } catch (e) {
    throw new Error(`Error calculating stats:\n${e.message}`);
  }
});

// return stats for all characters in roster
router.post('/api/characters', async (req, res, next) => {
  let promises = [];
  try {
    switch (req.rosterType) {
      case rosterType.P_ROSTER:
        addRosterCalcPromises(promises, req.body, req.options);
        break;
      case rosterType.UNITS:
        addUnitsCalcPromises(promises, req.body, req.options);
        break;
      case rosterType.PLAYER:
        req.body.forEach( player => addRosterCalcPromises(promises, player.roster, req.options) );
        break;
      case rosterType.ROSTER:
        req.body.forEach( units => addUnitsCalcPromises(promises, units, req.options) );
        break;
      default:
        res.status(400);
        return next( new Error('Unsupported object type') );
    }
    for (let i = promises.length-1; i >= 0; i--) {
      await promises[i];
    }
    res.roster = req.body;
    res.count = promises.length;
    next();
  } catch (e) {
    next( new Error(`Error parsing stats:\n${e.message}`) );
  }
  
  function addRosterCalcPromises(promiseArray, roster, options) {
    roster.forEach( unit => {
      if (gameData.unitData[unit.defId].combatType == 1) {
        promiseArray.push(new Promise( (resolve, reject) => {
          unit.stats = statCalculator.calcCharStats(unit, options);
          resolve(unit);
        }) );
      }
    });
  }
  function addUnitsCalcPromises(promiseArray, units, options) {
    Object.keys(units).forEach( id => {
      if (gameData.unitData[ id ].combatType == 1) {
        units[ id ].forEach( unit => {
          promiseArray.push(new Promise( (resolve, reject) => {
            unit.stats = statCalculator.calcCharStats( {
              defId: id,
              rarity: unit.starLevel,
              level: unit.level,
              gear: unit.gearLevel,
              equipped: unit.gear.map( gearID => { return {equipmentId: gearID}; }),
              mods: unit.mods
            }, options);
            resolve(unit);
          }) );
        });
      }
    });
  }
  
});

// return stats for all ships in roster
router.post('/api/ships', async (req, res, next) => {
  let promises = [];
  try {
    switch (req.rosterType) {
      case rosterType.P_ROSTER:
        addRosterCalcPromises(promises, req.body, req.options);
        break;
      case rosterType.PLAYER:
        req.body.forEach( player => addRosterCalcPromises(promises, player.roster, req.options) );
        break;
      case rosterType.UNITS:
      case rosterType.ROSTER:
        res.status(400);
        return next( new Error(`Ship stats not supported with .help's ${req.rosterType} format`) );
        break;
      default:
        res.status(400);
        return next( new Error('Unsupported object format') );
    }
    for (let i = promises.length-1; i >= 0; i--) {
      await promises[i];
    }
    res.roster = req.body;
    res.count = promises.length;
    next();
  } catch (e) {
    return next( new Error(`Error parsing stats:\n${e.message}`) );
  }
  
  function addRosterCalcPromises(promiseArray, roster, options) {
    let crew = {};
    roster.forEach( unit => crew[ unit.defId ] = unit );
    roster.forEach( unit => {
      if (gameData.unitData[unit.defId].combatType == 2) {
        promiseArray.push(new Promise( (resolve, reject) => {
          unit.stats = statCalculator.calcShipStats(unit, gameData.unitData[unit.defId].crew.map(id => crew[id]), options);
          resolve(unit);
        }) );
      }
    });
  }
  
});

// Send response and report log of request
//   -res.roster = processed object to send
//   -res.count = count of processed units in res.roster
//   -res.error = object with error data if request errored -- expected format like { code: errorCode, err: error object}
router.post(['/api','/api/characters','/api/ships'], async (req, res, next) => {
  res.json(res.roster);
  res.timestamp = new Date();
  let calcTime = res.timestamp - req.calcTime;
  req.log = `${decodeURI(req.originalUrl)} processed ${res.count} unit${res.count == 1 ? '':'s'} in ${req.rosterType} format.\n\t${res.timestamp - req.timestamp} - ${calcTime} - ${calcTime / res.count}`;
  next();
});


// *****************************
// ******* GET Endpoints *******
// *****************************

// testing endpoint for convenience
// no production-level purpose
router.get('/test', (req, res, next) => {
  console.log(`testQuery found: ${JSON.stringify(req.query)}`);
  if (req.query.useValues) {
    let obj = JSON.parse(req.query.useValues);
    console.log(JSON.stringify(obj))
  }
  console.log(`Before response sent, res.status = ${res.statusCode}`);
  res.json(req.query);
  console.log(`After response sent, res.status = ${res.statusCode}`);
  req.log = `Successfully sent ${res.statusCode}: ${req.method} ${decodeURI(req.originalUrl)}`;
  next();
});


// Confirm that requested 'baseID' is a valid unit ID, throw error if not.
router.param('baseID', (req, res, next) => {
  if (!gameData.unitData[ req.params.baseID ]) {
    res.status(403);
    throw new Error(`${req.params.baseID} is not a valid/known unit ID`);
  }
  next();
});

/*************** Generic GET Endpoints ***************/

// ensure 'options.useValues' is fully defined
router.get(['/api','/api/characters','/api/characters/:baseID','/api/ships','/api/ships/:baseID'], (req, res, next) => {
  if (!req.options.useValues) // ensure 'useValues' exists
    req.options.useValues = {};
  Object.keys(maxValues).forEach( unitType => { // for each unit type (char, ship, crew)
    if (!req.options.useValues[ unitType ]) // ensure 'useValues' sub-object exists
      req.options.useValues[ unitType ] = {};
    Object.keys( maxValues[ unitType ] ).forEach( param => { // for each parameter
      req.options.useValues[ unitType ][ param ] = req.options.useValues[ unitType ][ param ] || maxValues[ unitType ][ param ];
    });
  });
  
  next();
});

router.get('/api', (req, res, next) => {
  req.units = [];
  Promise.all( Object.keys(gameData.unitData).map( baseID => {
    return new Promise( (resolve, reject) => {
      resolve(gameData.unitData[baseID].combatType == 1 ? 
              statCalculator.calcCharStats({defId: baseID}, req.options) :
              statCalculator.calcShipStats({defId: baseID}, gameData.unitData[ baseID ].crew.map( charID => { return {defId: charID}; }), req.options)
             );
    }).then( stats => {
      return {defId: baseID, stats: stats};
    }, error => {
      return {defId: baseID, stats: {error: error.message}};
    }).then( unit => {
      req.units.push(unit);
    });
  })).then(vals => {res.count = req.units.length; next()}, next);
});

router.get('/api/characters', (req, res, next) => {
  req.units = [];
  Promise.all( Object.keys(gameData.unitData).map( baseID => {
    return new Promise( (resolve, reject) => {
      resolve( gameData.unitData[baseID].combatType == 1 ? statCalculator.calcCharStats({defId: baseID}, req.options) : undefined );
    }).then( stats => {
      if (stats)
        req.units.push( {defId: baseID, stats: stats} );
    }, error => {
      req.units.push( {defId: baseID, stats: {error: error.message}} );
    });
  })).then(vals => {res.count = req.units.length; next()}, next);
});

router.get('/api/ships', (req, res, next) => {
  req.units = [];
  Promise.all( Object.keys(gameData.unitData).map( baseID => {
    return new Promise( (resolve, reject) => {
      resolve( gameData.unitData[baseID].combatType == 1 ? undefined : statCalculator.calcShipStats({defId: baseID}, gameData.unitData[ baseID ].crew.map( charID => { return {defId: charID}; }), req.options) );
    }).then( stats => {
      if (stats)
        req.units.push( {defId: baseID, stats: stats} );
    }, error => {
      req.units.push( {defId: baseID, stats: {error: error.message}} );
    });
  })).then(vals => {res.count = req.units.length; next()}, next);
});

router.get('/api/characters/:baseID', (req, res, next) => {
  if (gameData.unitData[req.params.baseID].combatType == 1) {
    req.unit = { defId: req.params.baseID, stats: statCalculator.calcCharStats({defId: req.params.baseID}, req.options) };
    res.count = 1;
    next();
  } else {
    res.status(403);
    throw new Error(`${req.params.baseID} is not a valid/known character ID`);
  }
});

router.get('/api/ships/:baseID', (req, res, next) => {
  if (gameData.unitData[req.params.baseID].combatType == 2) {
    console.log(JSON.stringify(req.options.useValues));
    req.unit = { defId: req.params.baseID, stats: statCalculator.calcShipStats({defId: req.params.baseID}, gameData.unitData[ req.params.baseID ].crew.map( charID => { return {defId: charID}; }), req.options ) };
    res.count = 1;
    next();
  } else {
    res.status(403);
    throw new Error(`${req.params.baseID} is not a valid/known ship ID`);
  }
});

// send result (should be in req.units)
router.get(['/api','/api/characters','/api/characters/:baseID','/api/ships','/api/ships/:baseID'], (req, res, next) => {
  res.json( req.units || req.unit );
  res.timestamp = new Date();
  req.log = `${decodeURI(req.originalUrl)} processed ${res.count} unit${res.count == 1 ? '':'s'}.\n  useValues: ${JSON.stringify(req.options.useValues)}\n\t${res.timestamp - req.timestamp} - ${ (res.timestamp - req.timestamp) / res.count}`;
  next()
});



// ******************************
// *** All Routes Logs/Errors ***
// ******************************

// log request
router.use( (req, res, next) => {
  if (req.log) {
    console.log(req.log);
  } else {
    console.error(`Log Entry missing for ${decodeURI(req.originalUrl)}\n\t${(res.timestamp || new Date()) - req.timestamp} ms`);
  }
  next();
});

// handle errors
router.use( (err, req, res, next) => {
  if (res.headersSent) { // error while sending -- fall back on default express error handler
    console.error(`Error after sending response to ${decodeURI(req.originalUrl)}`);
    return next(err)
  } else {
    if (res.statusCode == 200) res.status(500); // general error
    res.send(err.message);
    console.error(`Error code ${res.statusCode}: ${req.method} ${decodeURI(req.originalUrl)}\nmessage: ${err.message}\nstack: ${err.stack}`);
  }
});




module.exports = router;