'use strict';

const Boom = require('boom');
const Code = require('code');
const Hapi = require('hapi');
const Lab = require('lab');
const Plugin = require('../lib');

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

function prepareServer (callback) {
  const server = new Hapi.Server();

  server.connection();
  server.register([Plugin], (err) => {
    if (err) {
      return callback(err);
    }

    server.auth.scheme('test', function (server, options) {
      return {
        authenticate (request, reply) {
          const header = request.headers[options.header];

          if (header === options.value) {
            const credentials = options.credentials !== undefined ?
                                options.credentials : {
                                  [options.header]: options.value,
                                  scope: options.scope
                                };

            return reply.continue({ credentials });
          }

          reply(Boom.unauthorized());
        }
      };
    });

    server.auth.scheme('failScheme', function (server, options) {
      return {
        authenticate (request, reply) {
          server.app.failed = true;
          reply(Boom.internal());
        }
      };
    });

    server.auth.strategy('fooAuth', 'test', { header: 'foo', value: 42 });
    server.auth.strategy('barAuth', 'test', { header: 'bar', value: 53 });
    server.auth.strategy('bazAuth', 'test', { header: 'baz', value: 64, scope: ['baz', 'foo'] });
    server.auth.strategy('badCreds', 'test', { header: 'bad', value: 99, credentials: null });
    server.auth.strategy('fail', 'failScheme');

    server.auth.strategy('fooOnly', 'nuisance', {
      strategies: ['fooAuth']
    });
    server.auth.strategy('fooBar', 'nuisance', {
      strategies: ['fooAuth', 'barAuth']
    });
    server.auth.strategy('fooBarBaz', 'nuisance', {
      strategies: ['fooAuth', { name: 'barAuth' }, 'bazAuth']
    });
    server.auth.strategy('fooBadCreds', 'nuisance', {
      strategies: ['fooAuth', 'badCreds']
    });
    server.auth.strategy('fooFail', 'nuisance', {
      strategies: ['fooAuth', 'fail']
    });

    function handler (request, reply) {
      reply(request.auth);
    }

    server.route([
      {
        method: 'GET',
        path: '/foo',
        config: {
          auth: 'fooOnly',
          handler
        }
      },
      {
        method: 'GET',
        path: '/foo/bar',
        config: {
          auth: 'fooBar',
          handler
        }
      },
      {
        method: 'GET',
        path: '/foo/bar/baz',
        config: {
          auth: 'fooBarBaz',
          handler
        }
      },
      {
        method: 'GET',
        path: '/foo/badCreds',
        config: {
          auth: 'fooBadCreds',
          handler
        }
      },
      {
        method: 'GET',
        path: '/foo/fail',
        config: {
          auth: 'fooFail',
          handler
        }
      }
    ]);

    callback(null, server);
  });
}

describe('Nuisance', () => {
  it('authenticates multiple strategies at once', (done) => {
    prepareServer((err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo/bar/baz',
        headers: {
          foo: 42,
          bar: 53,
          baz: 64
        }
      }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.include({
          isAuthenticated: true,
          credentials: {
            fooAuth: { foo: 42 },
            barAuth: { bar: 53 },
            bazAuth: { baz: 64 },
            scope: ['baz', 'foo']
          },
          strategy: 'fooBarBaz',
          mode: 'required',
          error: null
        });
        done();
      });
    });
  });

  it('authenticates fails if any strategies fail', (done) => {
    prepareServer((err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo/bar/baz',
        headers: {
          foo: 42,
          bar: 53,
          baz: 63 // fails
        }
      }, (res) => {
        expect(res.statusCode).to.equal(401);
        expect(res.result).to.equal({
          statusCode: 401,
          error: 'Unauthorized'
        });
        done();
      });
    });
  });

  it('does not expose scope if none of the strategies set it', (done) => {
    prepareServer((err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo/bar',
        headers: {
          foo: 42,
          bar: 53
        }
      }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.include({
          isAuthenticated: true,
          credentials: {
            fooAuth: { foo: 42 },
            barAuth: { bar: 53 }
          },
          strategy: 'fooBar',
          mode: 'required',
          error: null
        });

        expect(res.result.credentials.scope).to.be.undefined();
        done();
      });
    });
  });

  it('handles credentials that are not objects', (done) => {
    prepareServer((err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo/badCreds',
        headers: {
          foo: 42,
          bad: 99
        }
      }, (res) => {
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.include({
          isAuthenticated: true,
          credentials: {
            fooAuth: { foo: 42 },
            badCreds: null
          },
          strategy: 'fooBadCreds',
          mode: 'required',
          error: null
        });
        done();
      });
    });
  });

  it('stops after first failing strategy', (done) => {
    prepareServer((err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo/fail',
        headers: {
          foo: 1 // fails
        }
      }, (res) => {
        expect(res.statusCode).to.equal(401);
        expect(res.result).to.equal({
          statusCode: 401,
          error: 'Unauthorized'
        });
        expect(server.app.failed).to.not.exist();
        done();
      });
    });
  });
});
