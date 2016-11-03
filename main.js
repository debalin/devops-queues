var redis = require('redis');
var multer = require('multer');
var express = require('express');
var fs = require('fs');
var os = require('os');
var app = express();

var count = 0;
var hostname = os.hostname();
var recentKey = "recent";
var imageKey = "images";
var serversKey = "servers";
var mainServerURL = "";
var serversCount = 0;
var startPort = 3000;

// REDIS
var client = redis.createClient(6379, '127.0.0.1', {});
client.del(serversKey, function (err, reply) {
  if (err) throw err;
});

// WEB ROUTES

// Add hook to make it easier to get all visited URLS.
app.use(function (req, res, next) {
  console.log(req.method, req.url);
  //http://stackoverflow.com/questions/10183291/how-to-get-the-full-url-in-express
  var url = req.protocol + '://' + req.get('host') + req.originalUrl;
  client.lpush(recentKey, url, function (err, reply) {
    if (err)
      console.log("Some error in building recent: " + err);
    else
      client.ltrim(recentKey, 0, 4, redis.print);
    next();
  });
});

app.get('/recent', function (req, res) {
  client.lrange("recent", 0, -1, function (err, reply) {
    var replyMessage = "<p>Most recent 5 URLs visited are:<br/><br/>";
    for (var site of reply) {
      replyMessage += site + "<br/>";
    }
    replyMessage += "</p>";
    res.send(replyMessage);
  });
});

app.post('/upload', [multer({ dest: './uploads/' }), function (req, res) {
  if (req.files.image) {
    fs.readFile(req.files.image.path, function (err, data) {
      if (err) throw err;
      var img = new Buffer(data).toString('base64');
      client.lpush(imageKey, img, function (err, reply) {
        if (err) throw err;
        res.status(204).end();
      });
    });
  }
}]);

app.get('/meow', function (req, res) {
  client.lpop(imageKey, function (err, reply) {
    if (err) throw err;
    if (reply) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write("<h1>\n<img src='data:my_pic.jpg;base64," + reply + "'/>");
      res.end();
    }
    else {
      res.send("<p>No pictures to show. Use /upload more.</p>");
    }
  });
});

app.get('/set/:key', function (req, res) {
  var value = "This message will self-destruct in 10 seconds.";
  client.set(req.params.key, value, redis.print);
  client.expire(req.params.key, 10);
  res.send("<p>SET operation.<br/><br/>Key: " + req.params.key + "<br/>Value: " + value + "</p>");
});

app.get('/get/:key', function (req, res) {
  client.get(req.params.key, function (err, reply) {
    if (err) throw err;
    res.send("<p>GET operation.<br/><br/>Key: " + req.params.key + "<br/>Value: " + reply + "</p>");
  });
});

app.get('/spawn', function (req, res) {
  var server = app.listen(startPort++, hostname, function () {
    var host = server.address().address;
    var port = server.address().port;
    var url = "http://" + host + ":" + port;
    console.log('Another app listening at ' + url + '.');
    client.rpush(serversKey, url, function (err, reply) {
      if (err) throw err;
      serversCount++;
      res.send("<p>Server spawned at " + url + ".</p>");
    });
  });
});

app.get('/listservers', function (req, res) {
  client.lrange(serversKey, 0, -1, function (err, reply) {
    var replyMessage = "<p>Main server is at " + mainServerURL + ". <br/>Other servers spawned are:<br/>";
    for (var proxy of reply) {
      replyMessage += proxy + "<br/>";
    }
    res.send(replyMessage);
  });
});

app.get('/destroy', function (req, res) {
  if (serversCount == 0) {
    res.send("<p>Nothing to destroy.</p>");
  }
  else {
    var randomServerIndex = getRandomIntInclusive(0, serversCount - 1);
    client.lindex(serversKey, randomServerIndex, function (err, reply1) {
      if (err) throw err;
      client.lrem(serversKey, randomServerIndex, reply1, function (err, reply2) {
        serversCount--;
        res.send("<p>Server at " + reply1 + " destroyed.");
      });
    });
  }
});

//HTTP SERVER
var server = app.listen(startPort++, hostname, function () {
  var host = server.address().address;
  var port = server.address().port;
  mainServerURL = "http://" + host + ":" + port;
  console.log('Main app listening at ' + mainServerURL);
});

//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}