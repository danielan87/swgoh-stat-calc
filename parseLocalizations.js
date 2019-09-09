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

const [node,script,...args] = process.argv;
const fs = require('fs');
args.forEach( lang => {
  var buffer = fs.createReadStream(`./localizations/Loc_${lang.toUpperCase()}.txt`)
  let data = {}, versions = {};
  readLines(buffer, line => {
    if (/UnitStat_/.test(line)) {
      let [stat, text] = line.split('|');
      // stat = stat.replace(/^(.*)(?<!Rating)_TU(\d+)[^_]*$/, (m,p1,p2) => { // leaves older "Rating" names that changed later to "Chance"
      stat = stat.replace(/^(.*)_TU(\d+)[^_]*$/, (m,p1,p2) => { // sticks with current definitions -- "Chance" instead of "Rating"
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
    var arr = require("./statCalcData/lang/statEnum.json"),
        obj = {};
    arr.forEach( (name, i) => { obj[ i ] = (data[ name ] || name); });
    fs.writeFileSync(`./statCalcData/lang/${lang.toLowerCase()}.json`, JSON.stringify(obj, null, 2) );
    console.log(`Wrote Localization file for ${lang}:\n${JSON.stringify(obj, null, 2)}`);
  });
});