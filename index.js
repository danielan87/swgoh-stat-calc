const dataBuilder = require(__dirname + '/statCalc/dataBuilder.js');
const statCalculator = require(__dirname + '/statCalc/statCalculator.js');
let gameData;

function init() {
  gameData = dataBuilder.loadData(__dirname + '/statCalcData/');
  statCalculator.setGameData(gameData);
}

init();

const MAX_LEVEL = 85;
const MAX_GEAR_LEVEL = 13;
const MAX_MOD_PIPS = 6;
const maxValues = {
  char: {
    rarity: 7,
    level: MAX_LEVEL,
    gear: MAX_GEAR_LEVEL,
    equipped: "all"
  },
  ship: {
    rarity: 7,
    level: MAX_LEVEL
  },
  crew: {
    rarity: 7,
    level: MAX_LEVEL,
    gear: MAX_GEAR_LEVEL,
    equipped: "all",
    skills: "max",
    modRarity: MAX_MOD_PIPS,
    modLevel: 15
  }
};

// rosterType enum object
const rosterType = {
  PLAYER: '/player',          // .help's /player endpoint's full player profile (array of players)
  P_ROSTER: '/player.roster', // .help's /player endpoint's 'roster' property (array of units)
  UNITS: '/units',            // .help's /units endpoint (object of arrays indexed by base ID)
  ROSTER: '/roster'           // .help's /roster endpoint (array of objects from /units)
};
  
exports.stats = function(obj, flags, useValues = null) {
  const options = parseOptions(flags, useValues);
  const objRosterType = determineRostertype(obj);
  switch (objRosterType) {
    case rosterType.P_ROSTER:
    case rosterType.UNITS:  // both formats directly accepted by statCalculator
      statCalculator.calcRosterStats(obj, options);
      break;
    case rosterType.PLAYER:
      statCalculator.calcPlayerStats(obj, options);
      break;
    case rosterType.ROSTER:
      obj.roster = obj.forEach( roster => {
        statCalculator.calcRosterStats(roster, options);
      });
      break;
    default:
      throw new Error('Unsupported object type');
  }
  return obj;
}

exports.statsCharacters = async function(obj, flags, useValues = null) {
  let promises = [];
  const options = parseOptions(flags, useValues);
  const objRosterType = determineRostertype(obj);
  
  try {
    switch (objRosterType) {
      case rosterType.P_ROSTER:
        addRosterCalcPromises(promises, obj, options);
        break;
      case rosterType.UNITS:
        addUnitsCalcPromises(promises, obj, options);
        break;
      case rosterType.PLAYER:
        obj.forEach( player => addRosterCalcPromises(promises, player.roster, options) );
        break;
      case rosterType.ROSTER:
        obj.forEach( units => addUnitsCalcPromises(promises, units, options) );
        break;
      default:
        throw new Error('Unsupported object type');
    }
    for (let i = promises.length-1; i >= 0; i--) {
      await promises[i];
    }
    return obj;
  } catch (e) {
    throw new Error(`Error parsing stats:\n${e.message}`);
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
}

exports.statsShips = async function(obj, flags, useValues = null) {
  let promises = [];
  const options = parseOptions(flags, useValues);
  const objRosterType = determineRostertype(obj);
  
  try {
    switch (objRosterType) {
      case rosterType.P_ROSTER:
        addRosterCalcPromises(promises, obj, options);
        break;
      case rosterType.PLAYER:
        obj.forEach( player => addRosterCalcPromises(promises, player.roster, options) );
        break;
      case rosterType.UNITS:
      case rosterType.ROSTER:
        throw new Error(`Ship stats not supported with .help's ${req.rosterType} format`);
      default:
        throw new Error('Unsupported object format');
    }
    for (let i = promises.length-1; i >= 0; i--) {
      await promises[i];
    }
    return obj;
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
}

function determineRostertype(obj) {
  let type;
  if (!obj) {
    throw Error("No object received.");
  }
  if (obj.constructor === Array) {
    if (obj[0].roster) { // first object in array is a player profile
      type = rosterType.PLAYER;
    } else if (obj[0].defId) { // first object in array is a unit
      type = rosterType.P_ROSTER;
    } else { // only other accepted array type is .help's /roster format -- asserted to be true if here
      type = rosterType.ROSTER;
    }
  } else { // only accepted non-array format is from .help's /units -- asserted to be true if here
    type = rosterType.UNITS;
  }
  return type;
}

function parseOptions(flags, useValues = null, language = 'eng_us') {
  if (!Array.isArray(flags)) {
    flags = flags.split(',');
  }
 // flags for data control
  const options = {};
  flags.forEach(flag => options[flag] = true);
  
  // useValues definition
  if (useValues) {
    function addJSONtoObj(text, obj) {
      let propPattern = /(\w+)"?:"?(?:(\d+?)|(\w+?)|(\[.*\]))"?[,}]/g,
          match;
      while ( ( match = propPattern.exec(text) ) !== null) {
        obj[ match[1] ] = +match[2] || match[3] || JSON.parse[ match[4] ]; // Only array option should be an array of ints, which doesn't use quotes
      }
    }
    
    let groupPattern = /(char|ship|crew)"?:({.*?})/g;
    let match;
    options.useValues = {};
    while ( ( match = groupPattern.exec(useValues) ) !== null) {
      addJSONtoObj(match[2], options.useValues[ match[1] ] = {})
    }
    
    if (!Object.keys(options.useValues).length) { // no sub-objects defined -- just overall parameters
      let obj = {};
      addJSONtoObj(useValues, obj);
      options.useValues = {
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
  if (options.useMax)
    options.useValues = Object.assign({}, maxValues);
  
  // set language
  if (!options.statIDs) { // 'statIDs' flag will leave stats without a language
    let file = __dirname + "/statCalcData/lang/";
    if (options.enums) {
      file += "statEnum.json";
    } else {
      file += (language || "eng_us").toLowerCase() + ".json";
    }
    options.language = require(file);
  }
  return options;
}