var redis = require('redis');
var multer = require('multer');
var express = require('express');
var fs = require('fs');
var os = require('os');
var request = require('request');
var app = express();

var count = 0;
var hostname = os.hostname();
var recentKey = "recent";
var imageKey = "images";
var serversKey = "servers";
var runningServersKey = "run_servers";
var hostnameURL = "";
var mainServerURL = "";
var startPort = 3000;
var currentServerPort = 3000;

// REDIS
var client = redis.createClient(6379, '127.0.0.1', {});
client.del(serversKey, function (err, reply) {
  if (err) throw err;
});
client.del(runningServersKey, function (err, reply) {
  if (err) throw err;
});

// WEB ROUTES

app.use(function (req, res, next) {
  var url = req.protocol + '://' + req.get('host');
  client.lrange(runningServersKey, 0, -1, function (err, reply) {
    if (err) throw err;
    if (reply && reply.indexOf(url) != -1) {
      client.lrem(runningServersKey, 0, url, function (err, reply) {
        if (err) throw err;
        console.log("Request has been taken up by: " + url + ". Will delete from running list.");
        client.lpush(serversKey, url, function (err, reply) {
          console.log("Server added back to free servers list.");
          if (err) throw err;
        });
      });
      next();
    }
    else {
      client.rpoplpush(serversKey, runningServersKey, function (err, reply) {
        if (reply == null) {
          console.log("No servers to delegate to, will perform myself: " + url);
          next();
        }
        else {
          url = reply + req.originalUrl;
          //http://stackoverflow.com/questions/17612695/expressjs-how-to-redirect-a-post-request-with-parameters
          if (req.method == "GET") {
            request({ url: url }, function (err, remoteResponse, remoteBody) {
              if (err) throw err;
              res.send(remoteBody);
            });
          }
          else if (req.method == "POST") {
            res.redirect(307, url);
          }
        }
      });
    }
  });
});

app.use(function (req, res, next) {
  //http://stackoverflow.com/questions/10183291/how-to-get-the-full-url-in-express
  var url = req.protocol + '://' + req.get('host') + req.originalUrl;
  client.lpush(recentKey, url, function (err, reply) {
    if (err) throw err;
    client.ltrim(recentKey, 0, 4, function (err, reply) {
      if (err) throw err;
      next();
    });
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
        res.send("Uploaded.");
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
  client.set(req.params.key, value, function (err, reply) {
    client.expire(req.params.key, 10);
    res.send("<p>SET operation.<br/><br/>Key: " + req.params.key + "<br/>Value: " + value + "</p>");
  });
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
      res.send("<p>Server spawned at " + url + ".</p>");
    });
  });
});

app.get('/listservers', function (req, res) {
  client.lrange(serversKey, 0, -1, function (err, reply1) {
    var replyMessage = "<p>Main server is at " + mainServerURL + ". <br/>Free servers spawned are:<br/>";
    for (var proxy of reply1) {
      replyMessage += proxy + "<br/>";
    }
    client.lrange(runningServersKey, 0, -1, function (err, reply2) {
      replyMessage += "Busy servers: <br/>";
      for (var proxy of reply2) {
        replyMessage += proxy + "<br/>";
      }
      replyMessage += "</p>";
      res.send(replyMessage);
    });
  });
});

app.get('/destroy', function (req, res) {
  client.llen(serversKey, function (err, reply) {
    if (err) throw err;
    serversCount = parseInt(reply);
    if (serversCount == 0) {
      res.send("<p>Nothing to destroy.</p>");
    }
    else {
      var randomServerIndex = getRandomIntInclusive(0, serversCount - 1);
      client.lindex(serversKey, randomServerIndex, function (err, reply1) {
        if (err) throw err;
        client.lrem(serversKey, 0, reply1, function (err, reply2) {
          res.send("<p>Server at " + reply1 + " destroyed.");
        });
      });
    }
  });
});

//main HTTP server
var server = app.listen(startPort++, hostname, function () {
  var host = server.address().address;
  var port = server.address().port;
  hostnameURL = "http://" + host + ":";
  mainServerURL = "http://" + host + ":" + port;
  console.log('Main app listening at ' + mainServerURL);
});

//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}