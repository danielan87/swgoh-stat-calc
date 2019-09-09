var gameData = {};
const ApiSwgohHelp = require('api-swgoh-help');
const swapi = new ApiSwgohHelp({
	"username":process.env.SWGOH_HELP_UNAME,
	"password":process.env.SWGOH_HELP_PASS
});
const fetch = require('node-fetch');
const fs = require('fs');

// Check for updates, rebuild data if necessary
async function loadData(dataFolder) {
  console.log(`Loading Data from ${dataFolder}gameData.json`);
  try {  
    if (await isUpdateAvailable(dataFolder)) {
      throw new Error("Current Data Outdated");
    }
    gameData = require(dataFolder + 'gameData.json');
  } catch (e) {
    console.error(e.message);
    await buildData(dataFolder);
  }
}

// compare current/saved version info for .help
async function isUpdateAvailable(dataFolder) {
  let version, apiVersion;
  try {
    version = require(dataFolder + 'dataVersion.json');
  } catch (e) {
    return true;
  }
  
  try {
    apiVersion = await (await fetch('https://api.swgoh.help/version')).json();
    console.log(`Starting StatCalc (v4):\ncurVer:${JSON.stringify(version)}\napiVer:${JSON.stringify(apiVersion)}`);

    return (apiVersion.game != version.game ||
            apiVersion.language != version.language);
  } catch(e) {
    console.error(`Error checking for game updates:`);
    console.error(e.stack);
    return false;
  }
}

// Build saved data from .help
async function buildData(dataFolder) {
  console.log("Retrieving new gameData from api.swgoh.help");
  try {
    const [ unitData, gearStats, modSetData, crTables ] = await Promise.all(
      [ getUnitData(), getGearStats(), getModSetData(), getCRTables() ] );
    gameData = {
      unitData: unitData,
      gearData: gearStats,
      modSetData: modSetData,
      crTables: crTables
    }
  } catch (e) {
    console.error(`Failed to build game data.`);
    console.error(e.stack);
    console.log(`Trying to reuse stale data.`);
    gameData = require(dataFolder + 'gameData.json');
    return;
  }
  fs.writeFileSync(dataFolder + 'gameData.json', JSON.stringify(gameData, null, 2) );
  fs.writeFileSync(dataFolder + 'dataVersion.json', JSON.stringify(await (await fetch('https://api.swgoh.help/version')).json()) );
  
  console.log("Saved new copy of gameData.json");
}

async function getUnitData() {
  // retrieve data from api.swgoh.help
  // const [ {result: baseList, error: blError},
  //         {result: unitStatTables, error: ustError} ,
  //         {result: rawStatTables, error: rstError},
  //         {result: skillList, error: sklError} ] = await Promise.all([
  //   swapi.fetchData({collection:"unitsList",
  //                    match:{rarity:1, obtainable:true, obtainableTime:0},
  //                    project:{combatType:1, primaryUnitStat:1, baseId:1, unitTierList:1, crewContributionTableId:1, crewList:1, skillReferenceList:1, baseStat:1}}),
  //   swapi.fetchData({collection:"unitsList",
  //                    match:{obtainable:true, obtainableTime:0},
  //                    project:{rarity:1, baseId:1, statProgressionId:1}}),
  //   swapi.fetchData({collection:"statProgressionList",
  //                    project:{id:1, stat:1}}),
  //   swapi.fetchData({collection:"skillList",
  //                    project:{id:1, tierList:1}})
  // ]).catch( err => {
  //   console.log(err);
  //   console.error("Failed to load unit Data");
  // });
  let response, baseList, unitStatTables, rawStatTables, skillList;
  try {
    response = await swapi.fetchData( {collection:"unitsList",
                                 match:{rarity:1, obtainable:true, obtainableTime:0},
                                 project:{combatType:1, primaryUnitStat:1, baseId:1, unitTierList:1, crewContributionTableId:1, crewList:1, skillReferenceList:1, baseStat:1}} );
    if (response.error) throw new Error(response.error);
    baseList = response.result;
    response = await swapi.fetchData({collection:"unitsList",
                     match:{obtainable:true, obtainableTime:0},
                     project:{rarity:1, baseId:1, statProgressionId:1}});
    if (response.error) throw new Error(response.error);
    unitStatTables = response.result;
    response = await swapi.fetchData({collection:"statProgressionList",
                     project:{id:1, stat:1}});
    if (response.error) throw new Error(response.error);
    rawStatTables = response.result;
    response = await swapi.fetchData({collection:"skillList",
                     project:{id:1, tierList:1}});
    if (response.error) throw new Error(response.error);
    skillList = response.result;
    
  } catch(err) {
    console.error(err);
    console.log("Failed to load unit Data");
  };
  
  // // check for errors
  // [blError, ustError, rstError, sklError].forEach( err => {
  //   if (err) {
  //     let error = new Error(`Error Retrieving data from swgoh.help: ${JSON.stringify(err)}`);
  //     console.error(error);
  //     // return;
  //     throw error;
  //   }
  // });
  
  // parse raw stat tables into easily referencable object
  const statTables = {};
  rawStatTables.forEach( table => {
    if ( /^stattable_/.test(table.id) ) {
      const tableData = {};
      table.stat.statList.forEach(stat => {
        tableData[ stat.unitStatId ] = stat.unscaledDecimalValue;
      });
      statTables[ table.id ] = tableData;
    }
  });
  // parse skill list into easily referencable object
  const skills = {};
  skillList.forEach( skill => {
    skills[ skill.id ] = { id: skill.id, maxTier: skill.tierList.length + 1, isZeta: skill.tierList.slice(-1)[0].powerOverrideTag == "zeta" };
  });
  
  // parse unit data
  const data = {};
  baseList.forEach( unit => {
    if ( unit.combatType == 1 ) { // character
      const tierData = {};
      unit.unitTierList.forEach( gearTier => {
        tierData[ gearTier.tier ] = { gear: gearTier.equipmentSetList, stats: {}}
        gearTier.baseStat.statList.forEach( stat => {
          tierData[ gearTier.tier ].stats[ stat.unitStatId ] = stat.unscaledDecimalValue;
        });
      });
      data[unit.baseId] = { combatType: 1,
                            primaryStat: unit.primaryUnitStat,
                            gearLvl: tierData,
                            growthModifiers: {},
                            skills: unit.skillReferenceList.map( skill => skills[ skill.skillId ] )
                          };
    } else { // ship
      const stats = {}
      unit.baseStat.statList.forEach( stat => {
        stats[ stat.unitStatId ] = stat.unscaledDecimalValue;
      });
      data[unit.baseId] = { combatType: 2,
                            primaryStat: unit.primaryUnitStat,
                            stats: stats,
                            growthModifiers: {},
                            crewStats: statTables[ unit.crewContributionTableId ],
                            crew: unit.crewList.map( crew => crew.unitId)
                          };
    }
  });
  
  // parse stat tables out of unit data
  unitStatTables.forEach( unit => {
    data[ unit.baseId ].growthModifiers[ unit.rarity ] = statTables[ unit.statProgressionId ];
  });
  
  console.log("Finished loading unit Data");
  // return parsed data
  return data;
}

async function getGearStats() {
  // retrieve data from api.swgoh.help
  const {result: list, error: error} = await swapi.fetchData({collection:"equipmentList",project:{id:1,equipmentStat:1}});
  
  if (error) console.log(error);
  
  const data = {};
  list.forEach(gear => {
    const statList = gear.equipmentStat.statList;
    if (statList.length > 0) {
      data[gear.id] = {stats: {}};
      statList.forEach(stat => {
        data[gear.id].stats[ stat.unitStatId ] = stat.unscaledDecimalValue;
      });
    }
  });
  
  console.log("Finished loading gear Data");
  // return parsed data
  return data;
}

async function getModSetData() {
  // retrieve data from api.swgoh.help
  const {result: list, error: error} = await swapi.fetchData({collection:"statModSetList",project:{id:1,completeBonus:1,setCount:1}});
  
  if (error) console.log(error);
  
  const data = {};
  list.forEach(set => {
    data[set.id] = {id: set.completeBonus.stat.unitStatId, count: set.setCount, value: set.completeBonus.stat.unscaledDecimalValue};
  });
  
  console.log("Finished loading modSet Data");
  // return parsed data
  return data;
}

async function getCRTables() {
  // retrieve data from api.swgoh.help
  const [ {result: tList, error: tlError}, {result: xpList, error: xlError} ] = await Promise.all([
    swapi.fetchData({collection:"tableList" }),
    swapi.fetchData({collection:"xpTableList" })
  ]).catch( err => {
    console.log(err);
    console.error("Failed to load crew Data");
  });
  
  // define some enum strings for easy reverse-lookup when parsing certain tables below
  const rarityEnum = {
    "ONE_STAR": 1,
    "TWO_STAR": 2,
    "THREE_STAR": 3,
    "FOUR_STAR": 4,
    "FIVE_STAR": 5,
    "SIX_STAR": 6,
    "SEVEN_STAR": 7
  };
  const numEnum = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7
  }
  
  const data = {};
  tList.forEach( table => {
    const parsedTable = {};
    let id;
    switch ( table.id ) {
      case "galactic_power_modifier_per_ship_crew_size_table": // int key
        id = "crewSizeFactor";
        table.rowList.forEach( row => {
          parsedTable[ row.key ] = +row.value;
        });
        break;
      case "crew_rating_per_unit_rarity": // string key (ONE_STAR, etc)
        id = "crewRarityCR";
        table.rowList.forEach( row => {
          parsedTable[ rarityEnum[row.key] ] = +row.value;
        });
        break;
      case "crew_rating_per_gear_piece_at_tier": // string key (TIER_01, etc)
        id = "gearPieceCR";
        table.rowList.forEach( row => {
          parsedTable[ row.key.match(/TIER_0?(\d+)/)[1] ] = +row.value;
        });
        break;
      case "crew_contribution_multiplier_per_rarity": // string key (ONE_STAR, etc)
        id = "shipRarityFactor";
        table.rowList.forEach( row => {
          parsedTable[ rarityEnum[row.key] ] = +row.value;
        });
        break;
      case "galactic_power_per_tagged_ability_level_table": // string key (zeta, contract_base, etc)
        id = "abilitySpecialCR";
        table.rowList.forEach( row => {
          if ( row.key == "zeta" ) parsedTable[ row.key ] = +row.value;
          else {
            let [ , type, level] = row.key.match(/^(\w+)_\w+?(\d)?$/);
            switch (type) {
              case "contract":
                parsedTable[ type ] = parsedTable[ type ] || {}; // ensure 'contract' table exists
                parsedTable[ type ][ ++level || 1 ] = +row.value;
                break;
              case "reinforcement":
                parsedTable[ "hardware" ] = parsedTable[ "hardware" ] || {1: 0}; // ensure 'hardware' table exists (and counts 0 xp for tier 1)
                parsedTable[ "hardware" ][ (++level) ] = +row.value;
                break;
              default:
                console.log(`Unknown ability type '${row.key}' found.`);
            }
          }
        });
        break;
      default:
        return;
    }
    data[ id ] = parsedTable;
  });
  xpList.forEach( table => {
    const parsedTable = {};
    let match;
    // only need 'xp' tables that start with 'crew_rating'
    if ( /^crew_rating/.test(table.id) ) {
      table.rowList.forEach( row => {
        parsedTable[ row.index + 1 ] = row.xp; // 'index' values are 0-based, data tables will be 1-based
      });
      if (table.id == "crew_rating_per_unit_level" || table.id == "crew_rating_per_ability_level") {
        // unitLevelCR and abilityLevelCR are their own tables
        data[ `${table.id.match(/per_(\w+)_level/)[1]}LevelCR` ] = parsedTable;
        
      } else if ( match = /mod_level_(\w+)_star/.exec(table.id) ) {
        // modRarityLevelCR is 7 tables combined, based on the mod's rarity in the table name
        let id = "modRarityLevelCR";
        data[ id ] = data[ id ] || {}; // ensure 'modRarityLevelCR' table exists in data
        data[ id ][ numEnum[ match[1] ] ] = parsedTable;
        
      }
    }
  });
    
  console.log("Finished loading crew Data");
  // return parsed data
  return data;
}


// module.exports = new Promise( (resolve) => {
//   loadData().then( resolve(gameData) );
// });
module.exports = {
  loadData: async (dataFolder) => {
    await loadData(dataFolder);
    return gameData;
  }
}