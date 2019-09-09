// server.js
// where your node app starts

// init project
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
// app.use(bodyParser.json());
const fetch = require('node-fetch');

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const statRouter = require('./express/statCalcRouter.js');
app.use('/', statRouter);


// ********************
// *** DEFAULT CODE ***
// ********************



// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/express/statCalc.html');
});

app.post("/test",bodyParser.json(),(req,res,next) => {
  let body = req.body;
  res.send(body);
  for (var char of body) {
    char.return = true;
  }
  console.log(JSON.stringify(body));
});

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log(`This app is listening on port ${listener.address().port} for swgoh stat requests.`);
});
