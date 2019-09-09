// var rp = require('request-promise');
// // const obj = require('./testFiles/swgohCollection.json');
// const obj = [{
//               "characterID": "BB8",
//               "starLevel": 7,
//               "level": 85,
//               "gearLevel": 12,
//               "gear": [158,161,159]
//             }];

// rp({
//     method: 'POST',
//     uri: 'http://crinolo-swgoh.glitch.me/statCalc/api',
//     body: [
//             {
//               "characterID": "MAGMATROOPER",
//               "starLevel": 7,
//               "level": 53,
//               "gearLevel": 7,
//               "gear": [101]
//             },
//             {
//               "characterID": "REYJEDITRAINING",
//               "starLevel": 7,
//               "level": 85,
//               "gearLevel": 12,
//               "gear": [160, 159, 158]
//             },
//             {
//               "characterID": "DARTHSION",
//               "starLevel": 6,
//               "level": 85,
//               "gearLevel": 11,
//               "gear": [144, 145, 135]
//             },
//             {
//               "characterID": "HERMIYODA",
//               "starLevel": 5,
//               "level": 85,
//               "gearLevel": 10,
//               "gear": []
//             }
//           ],
//     // body: obj,
//     json: true // Automatically stringifies the body to JSON
// }).then(function (parsedBody) {
//         console.log(parsedBody);
//         // POST succeeded...
//     })
//     .catch(function (err) {
//         console.log(err);
//         // POST failed...
//     });

// var ids;

// rp({uri:'http://crinolo-swgoh.glitch.me/statCalc/api/checkVar/unitData',
//     json:true}).then(units => {
//   ids = Object.keys(units);
//   rp({uri:'http://crinolo-swgoh.glitch.me/statCalc/api/checkVar/gmData',
//       json:true}).then(gms => {
//     let gmIDs = Object.keys(gms);
//     let diff = ids.filter(x => !gmIDs.includes(x));
//     console.log(diff);
//     console.log(diff.length);
//   });
// });

// var obj = {};
// console.log(obj["prop2"] || 0);
// obj["prop2"] = (obj["prop2"] || 0) + 7;
// console.log(obj);
// obj["prop2"] = (obj["prop2"] || 0) + 7;
// console.log(obj);

// obj["stars"] = +obj.stars || "5";
// console.log(obj);
// obj["stars"] = +obj.stars || 7;
// console.log(obj);
// console.log(null || 0);

// let test = 2.8 * 85;
// console.log(test);
// console.log(Math.floor(test));
// test = Number(Math.round(test+'e2')+'e-2')
// console.log(test - 20);
// console.log(Math.floor(test - 20));

// *** Test BaseGMs calculations ***
// const fs = require('fs');
// const dbFile = '.data/swgoh.db';
// const exists = fs.existsSync(dbFile);
// const sqlite3 = require('sqlite3').verbose();
// const db = new sqlite3.Database(dbFile);

// db.all("SELECT * FROM BaseGMs",(err,rows1) => {
//   const wrongValues = [];
//   const baseGMs = {};
//   rows1.map(row => baseGMs[row.baseID] = row);
//   db.all("SELECT * FROM GrowthModifiers", (err,rows2) => {
//     rows2.map(row => {
//       const base = baseGMs[row.baseID]
//       const str = (Math.floor((base.Strength * (row.stars + 1))*10)*0.1).toFixed(1);
//       const agi = (Math.floor((base.Agility * (row.stars + 1))*10)*0.1).toFixed(1);
//       const tac = (Math.floor((base.Intelligence * (row.stars + 1))*10)*0.1).toFixed(1);
      
//       if (row.Strength != str || row.Agility != agi || row.Intelligence != tac) {
//         wrongValues.push({right:row,wrong:{Strength:str,Agility:agi,Intelligence:tac}});
//       }
//     });
//     console.log(`Found ${wrongValues.length} incorrect GMs:`);
//     console.log(wrongValues);
//   });
// });

// console.log(/(\d{2})-(\d{2})-(\d{2})/.exec("08-09-18 13:42:23"));

// var arr = require("./statCalcTest/statEnum.json");
// // arr.forEach( (name, i) => {
// //   if (/^UNIT_STAT.*/.test(name)) arr[i] = name.replace(/UNIT_STAT_/,"UnitStat__").replace(/_([A-Z])([A-Z]+)/g, (m,p1,p2) => `${p1}${p2.toLowerCase()}`);
// // });
// arr.sort();
// console.log(arr);

function readLines(input, func, endFunc) {
  var remaining = '';

  input.on('data', function(data) {
    remaining += data;
    var index = remaining.indexOf('\n');
    var last  = 0;
    while (index > -1) {
      var line = remaining.substring(last, index);
      last = index + 1;
      func(line);
      index = remaining.indexOf('\n', last);
    }

    remaining = remaining.substring(last);
  });

  input.on('end', function() {
    if (remaining.length > 0) {
      func(remaining);
    }
    endFunc();
  });
}

const fs = require('fs');
var buffer = fs.createReadStream('./localizations/Loc_ENG_US.txt')
let data = {}, versions = {};
readLines(buffer, line => {
  if (/UnitStat_/.test(line)) {
    let [stat, text] = line.split('|');
    stat = stat.replace(/^(.*)(?<!Rating)_TU(\d)[^_]*$/, (m,p1,p2) => {
      if (!versions[p1] || versions[p1] < versions[p2]) {
        versions[p1] = p2;
        return p1;
      }
    });
    text = text.replace(/^\[[0-9A-F]*?\](.*)\s+\(([A-Z]+)\)\[-\]$/, (m,p1,p2) => p1);
    data[stat] = text;
  }
}, () => {
  // console.log(Object.keys(data).map( (key) => [ key, data[key], versions[key] || 0 ]));
  var arr = require("./statCalcTest/statEnum.json"),
      obj1 = {}, obj2 = {};
  arr.forEach( (name, i) => {
    if (data[name]) {
      obj1[ name ] = data[ name ];
      obj2[ i ] = data[ name ];
    }
  });
  console.log(obj1);
  console.log(obj2);
  fs.writeFileSync('./statCalcTest/lang/eng_us.json', JSON.stringify(obj2, null, 2) );
});
