const fetch = require('node-fetch');
const ApiSwgohHelp = require('api-swgoh-help');
const swapi = new ApiSwgohHelp({
	"username":process.env.SWGOH_HELP_UNAME,
	"password":process.env.SWGOH_HELP_PASS
});

function compareStats(statsA, statsB) {
  if (!statsA && !statsB)
    return;
  if (!statsA) {
    return statsB;
  } else if (!statsB) {
    return statsA;
  }
  
  let diff;
  ["base","gear","mods","final"].forEach( statType => {
    if (!statsA[ statType ] && !statsB[ statType ])
      return;
    if (!statsA[ statType ]) {
      diff = diff || {};
      diff[ statType ] = statsB[ statType ];
      return;
    } else if (!statsB[ statType ]) {
      diff = diff || {};
      diff[ statType ] = statsA[ statType ];
      return;
    }
    
    let keysB = Object.keys(statsB[ statType ]);
    Object.keys(statsA[ statType ]).forEach( stat => {
      let diffVal = statsA[statType][stat] - statsB[statType][stat];
      if (diffVal && !(statType == "mods" && (stat == "Armor" || stat == "Resistance") )) {
        diff = diff || {};
        diff[ statType ] = diff[ statType ] || {};
        diff[ statType ][ stat ] = [ statsA[statType][stat], statsB[statType][stat], diffVal ];
      }
    });
    
  });
  
  return diff;
}

function unitToString(unit) {
  return `${unit.defId} ${unit.rarity}*G${unit.gear}L${unit.level}`;
}

// let roster = require(__dirname + "/sampleRoster.json");
// fetch("https://crinolo-swgoh-beta.glitch.me/statCalc/api/",{method:'POST',body:JSON.stringify(roster),headers: { 'Content-Type': 'application/json' }}).then(res => { try {
//   res.json();
// } catch(e) {
//   console.log(res);
// } }).then(json => console.log(json));

// fetch("https://crinolo-swgoh-beta.glitch.me/statCalc/api",{method:'POST',body:JSON.stringify(roster),headers: { 'Content-Type': 'application/json' }}).then(res => res.json()).then(data => console.log(data));

test();

async function test() {
  let roster = require(__dirname + "/sampleRoster.json");
  
  let v4Data = fetch("https://crinolo-swgoh-beta.glitch.me/statCalc/api/characters?flags=gameStyle",{method:'POST',body:JSON.stringify(roster),headers: {'Content-Type':'application/json'}}).then(res => res.json());
  let v3Data = fetch("https://crinolo-swgoh.glitch.me/testCalc/api/characters?flags=withModCalc,gameStyle",{method:'POST',body:JSON.stringify(roster),headers: {'Content-Type':'application/json'}}).then(res => res.json());
  v4Data = await v4Data;
  v3Data = await v3Data;
  
  v4Data.forEach( unitA => {
    let unitB = v3Data.find(unit => unit.defId == unitA.defId);
    let diff = compareStats(unitA.stats, unitB.stats);
    if (diff && !diff.error) { console.log(`******************************\n\tUnit: ${unitToString(unitA)}\n\tDiff:\n${JSON.stringify(diff,null,2)}`); }
  });
}