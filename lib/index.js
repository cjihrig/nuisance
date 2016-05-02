'use strict';

const Assert = require('assert');
const Boom = require('boom');
const Insync = require('insync');


module.exports.register = function (server, options, next) {
  server.auth.scheme('nuisance', function nuisanceScheme (server, options) {
    Assert.strictEqual(Array.isArray(options.strategies), true);

    return {
      authenticate (request, reply) {
        const credentials = {};

        Insync.each(options.strategies, function eachIterator (strategy, next) {
          server.auth.test(strategy, request, function testCb (err, creds) {
            credentials[strategy] = creds;
            next(err);
          });
        }, function eachCb (err) {
          if (err) {
            return reply(Boom.unauthorized());
          }

          reply.continue({ credentials });
        });
      }
    };
  });

  next();
};


module.exports.register.attributes = {
  pkg: require('../package.json')
};
