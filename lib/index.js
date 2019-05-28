'use strict';

const Joi = require('@hapi/joi');

const schema = Joi.object({
  strategies: Joi.array().items(
    Joi.object().keys({
      name: Joi.string().description('strategy name'),
      failureCredentials: Joi.func().arity(1).optional().description('function that sets credentials on failed auth')
    }).description('strategy information'),
    Joi.string().description('strategy name')
  ).min(1).required().description('strategies to aggregate')
});


function register (server, options) {
  server.auth.scheme('nuisance', function nuisanceScheme (server, options) {
    Joi.assert(options, schema);

    return {
      authenticate: async function (request, h) {
        const credentials = {};
        let scope = [];

        for (let i = 0; i < options.strategies.length; i++) {
          let strategy = options.strategies[i];
          let failureCredentials = null;

          if (typeof strategy === 'object') {
            failureCredentials = strategy.failureCredentials;
            strategy = strategy.name;
          }

          let creds = null;

          try {
            creds = (await server.auth.test(strategy, request)).credentials;
          } catch (err) {
            if (failureCredentials) {
              creds = failureCredentials(request);
            } else {
              return h.unauthenticated(err);
            }
          }

          credentials[strategy] = creds;

          if (typeof creds === 'object' && creds.scope) {
            scope = scope.concat(creds.scope);
          }
        }

        if (scope.length !== 0) {
          credentials.scope = scope;
        }

        return h.authenticated({ credentials });
      }
    };
  });
}

module.exports.plugin = {
  register,
  requirements: {
    hapi: '>=18.0.0'
  },
  pkg: require('../package.json')
};
