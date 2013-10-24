/*
 * Serve content over a socket
 */

var config = require('../config');
var rdb = config.rdb;
var rdbLogger = config.rdbLogger;
var io = config.io;
var maxReports = config.maxReports;
var banExpiration = config.banExpiration;

var db = require('../db');
var Reported = db.Reported;

var logger = require('../logger');

module.exports = function (socket) {

  // Add socket to session
  if (!isSocketValid(socket)) {
    emitError(socket);
    return;
  }
  var user = socket.handshake.user;

  rdb.sadd('chat:online', socket.id, rdbLogger);
  logger.info('socket',
              'New socket, ' + socket.id + ' ' + user.username
             );

  // Looking for a new stranger.
  socket.on('stranger:req', function (data) {
    logger.info('socket',
                'Socket requested, ' + socket.id + ' ' + user.username
               );

    if (isLoggedIn(socket)) {
      var res;
      rdb.srandmember('chat:waiting', function (err, reply) {
        if (err) {
          socket.emit('stranger:err',
                      {err: 'Something happened when looking up for strangers.'}
                     );
          logger.err('socket',
                     'Error when getting a random member of waiting list.');
        } else {
          res = getStrangerSocket(socket);

          if (res.ok) {
            res.strangerSocket.set('strangerSID', '');
            //res.strangerSocket.set('lastStrangerIp', socket.handshake.sw.s().ip);
            socket.set('strangerSID', '');
            res.strangerSocket.emit('stranger:disconnected');
          }

          if (!reply) {
            rdb.sadd('chat:waiting', socket.id);
          } else {
            rdb.srem('chat:waiting', reply);
            logger.info('socket', 'Stranger found, ' + reply);

            var strangerSocket = io.sockets.socket(reply);
            if (isSocketValid(strangerSocket)) {
              if (!isSocketValid(socket)) {
                emitError(socket);
                return;
              }
              socket.set('strangerSID', reply);
              strangerSocket.set('strangerSID', socket.id);

              user.update({ $inc: {chatCount: 1} });
              strangerSocket.handshake.user.update({ $incr: {chatCount: 1} });

              socket.emit('stranger:res', {
                fullName: strangerSocket.handshake.user.username,
              });

              strangerSocket.emit('stranger:res', {
                fullName: user.username,
              });
            } else {
              if (typeof strangerSocket.id !== 'undefined') {
                rdb.srem('chat:online', strangerSocket.id, rdbLogger);
                strangerSocket.disconnect('Weird Socket');
              }
              rdb.sadd('chat:waiting', socket.id);
              logger.err('socket', 'Found stranger has no handshake. Still looking.');
              //logger.err('socket', strangerSocket);
            }
          }
        }
      });
    } else {
      emitError(socket);
      return;
    }
  });

  socket.on('stranger:report', function (data) {
    if (isLoggedIn(socket)) {
      if (data.noStranger) {
        socket.get('lastStrangerIp', function (err, ip) {
          if (err || !ip) {
            logger.err('socket', 'No last stranger available.');
            if (err) logger.err('socket', err);
          } else {
            Reported.findOne({ip: ip}, function (err, reported) {
              if (err) {
                logger.err('socket', 'in reporting: ' + err);
              } else if (!reported){
                var reported = new Reported({ip: ip});
                reported.reporters.push(socket.handshake.sw.s().ip);
                reported.save(function (err, reported) {
                  if (err) {
                    logger.err('socket', 'Error in saving report: ' + err);
                  }
                });
              } else {
                if (reported.reporters.indexOf(socket.handshake.sw.s().ip) === -1) {
                  if (reported.reporters.length >= maxReports - 1) {
                    Banned.findOne({ip: ip}, function (err, banned) {
                      if (err) {
                      } else if (!banned) {
                        var banned = new Banned(
                          {ip: ip, expires: new Date(Date.now() + banExpiration)}
                        );
                        banned.save(function (err, banned) {
                          if (err) {
                            logger.err('socket', 'Error in saving a banned user.');
                          }
                        });
                        reported.remove(function (err) {
                          if (err) {
                            logger.err('socket', 'Error in removing the reported person after ban.');
                          }
                        });
                        //socket.handshake.sw.destroy();
                        //emitError(socket);
                      } else {
                      }
                    });
                  } else {
                    reported.update(
                      {$push: {reporters: ip}},
                      function (err, reported) {
                        if (err) {
                          logger.err('socket', 'Could not add reporter ip.');
                        }
                      }
                    );
                  }
                }
              }
           });
          }
        });
      } else {
        var res = getStrangerSocket(socket);

        if (res.ok) {
          if (res.strangerSocket.handshake.sw.s().ip) {
            var ip = res.strangerSocket.handshake.sw.s().ip;
            Reported.findOne({ip: ip}, function (err, reported) {
              if (err) {
                logger.err('socket', "in reporting: " + err);
              } else if (!reported) {
                var reported = new Reported({
                  ip: ip
                });
                reported.reporters.push(socket.handshake.sw.s().ip);
                reported.save(function (err, reported) {
                  if (err) {
                    logger.err('socket', 'Error while saving report: ' + err);
                  }
                });
              } else {
                if (reported.reporters.indexOf(socket.handshake.sw.s().ip) === -1) {
                  if (reported.reporters.length >= maxReports - 1) {
                    Banned.findOne({ip: ip}, function (err, banned) {
                      if (err) {
                      } else if (!banned) {
                        var banned = new Banned(
                          {ip: ip, expires: new Date(Date.now() + banExpiration)}
                        );
                        banned.save(function (err, banned) {
                          if (err) {
                            logger.err('socket', 'Error in saving a banned user.');
                          }
                        });
                        reported.remove(function (err) {
                          if (err) {
                            logger.err('socket', 'Error in removing the reported person after ban.');
                          }
                        });
                        res.strangerSocket.handshake.sw.destroy();
                        res.strangerSocket.emit('system:error');
                      } else {
                      }
                    });
                  } else {
                    reported.update(
                      {$push: {reporters: ip}},
                      function (err, reported) {
                        if (err) {
                          logger.err('socket', 'Could not add reporter ip.');
                        }
                      }
                    );
                  }
                }
              }
           });
          } else {
            logger.err('socket', 'stranger socket has no ip for report.');
          }
        } else {
          logger.err('socket', 'Getting stranger socket for report failed.');
        }
      }
    } else {
      socket.handshake.sw.destroy();
      emitError(socket);
    }
  });

  // New message to be sent
  socket.on('msg:send', function (data) {
    if (isLoggedIn(socket)) {
      var msg = '';
      if (typeof data.msg === 'string') {
        msg = data.msg;
      } else {
        logger.err('socket',
                   'Message being sent is not string.'
                  );
        logger.err('socket',
                   String(data.msg)
                  );

        if (typeof data.msg.text === 'string') {
          msg = data.msg.text;
        }
      }
      if (msg.trim()) {
        user.update({ $inc: {msgCount: 1} });
        var res = getStrangerSocket(socket);

        if (res.ok) {
          msg = {text: msg};
          msg.from = 'stranger';
          res.strangerSocket.emit('msg:recv', {msg: msg});
        }
      } else {
        logger.err('socket',
                   'Message was not sent. ' + msg
                  )
        socket.emit('msg:failed');
      }
    }
  });

  // Typing status
  socket.on('msg:typing', function (data) {
    if (isLoggedIn(socket)) {
      var res = getStrangerSocket(socket);

      if (res.ok) {
        res.strangerSocket.emit('msg:strangerTyping', data);
      }
    }
  });

  // Socket disconnected.
  socket.on('disconnect', function () {
    logger.info('socket', 'Socket disconnected, ' +
                socket.id + ' ' + user.username);
    rdb.srem('chat:online', socket.id, rdbLogger);
    rdb.srem('chat:waiting', socket.id, rdbLogger);
    var res = getStrangerSocket(socket);

    if (res.ok) {
      logger.info('socket', 'Stranger disconnected, ' + res.strangerSocket.id);
      res.strangerSocket.set('strangerSID', '');
      // TODO: Somehow keep their ips even if their session is destroyed.
      /*if (typeof socket.handshake.sw !== 'undefined') {
        if (typeof socket.handshake.sw.s() !== 'undefined') {
          res.strangerSocket.set('lastStrangerIp', socket.handshake.sw.s().ip);
        }
      }*/
      socket.set('strangerSID', '');
      res.strangerSocket.emit('stranger:disconnected');
    }
  });
};

function getStrangerSocket(socket) {
  var ok = true
    , strangerSocket = null
    , err = null;

  socket.get('strangerSID', function (err_, sid) {
    if (err_ || !sid) {
      //socket.emit('msg:err');
      err = err_;
      ok = false;
    } else {
      strangerSocket = io.sockets.socket(sid);
    }
  });

  if (!isSocketValid(strangerSocket)) {
    ok = false;
    if (strangerSocket) {
      strangerSocket.emit('system:error');
    }
  }
  return {ok: ok, strangerSocket: strangerSocket, err: err};
}

function isLoggedIn(socket) {
  if (isSocketValid(socket)) {
    return true;
  }
  logger.info('socket', 'Socket is not logged in.');
  return false;
}

function emitError(socket) {
  if (typeof socket !== 'undefined') {
    if (typeof socket.handshake !== 'undefined') {
      if (typeof socket.handshake.sw !== 'undefined') {
        if (typeof socket.handshake.sw.s() !== 'undefined') {
          logger.err('socket', 'Emitting error for socket.');
          logger.err('socket', socket.handshake.sw.s());
        } else {
          logger.err('socket', 'Socket has no session.');
          //logger.err('socket', socket.handshake);
        }
      } else {
        logger.err('socket', 'Socket handshake has no session wrapper.');
        logger.err('socket', socket.handshake);
      }
    } else {
      logger.err('socket', 'Socket has no handshake data.');
      //logger.err('socket', socket);
    }
    socket.emit('system:error');
  } else {
    logger.err('socket', 'User has no socket to emit error, weird!');
  }
}

function isSocketValid(socket) {
  if (typeof socket !== 'undefined' && socket !== null) {
    if (typeof socket.handshake !== 'undefined') {
      if (typeof socket.handshake.user !== 'undefined') {
        if (socket.handshake.user) {
          return true;
        }
      }
    }
  }

  return false;
}
