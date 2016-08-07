'use strict';

const Boom = require('boom');
const Insync = require('insync');
const Joi = require('joi');

const schema = Joi.object({
  strategies: Joi.array().items(
    Joi.object().keys({
      name: Joi.string().description('strategy name'),
      failureCredentials: Joi.func().arity(1).optional().description('function that sets credentials on failed auth')
    }).description('strategy information'),
    Joi.string().description('strategy name')
  ).min(1).required().description('strategies to aggregate')
});


module.exports.register = function (server, options, next) {
  server.auth.scheme('nuisance', function nuisanceScheme (server, options) {
    Joi.assert(options, schema);

    return {
      authenticate (request, reply) {
        const credentials = {};
        let scope = [];

        Insync.eachSeries(options.strategies, function eachIterator (strategy, next) {
          let failureCredentials = null;

          if (typeof strategy === 'object') {
            failureCredentials = strategy.failureCredentials;
            strategy = strategy.name;
          }

          server.auth.test(strategy, request, function testCb (err, creds) {
            if (err) {
              if (failureCredentials) {
                creds = failureCredentials(request);
              } else {
                return next(err);
              }
            }

            credentials[strategy] = creds;

            if (creds !== null && typeof creds === 'object' && creds.scope) {
              scope = scope.concat(creds.scope);
            }

            next();
          });
        }, function eachCb (err) {
          if (err) {
            return reply(Boom.unauthorized());
          }

          if (scope.length !== 0) {
            credentials.scope = scope;
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
