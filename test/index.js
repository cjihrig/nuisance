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
            return reply.continue({
              credentials: { [options.header]: options.value }
            });
          }

          reply(Boom.unauthorized());
        }
      };
    });

    server.auth.strategy('fooAuth', 'test', { header: 'foo', value: 42 });
    server.auth.strategy('barAuth', 'test', { header: 'bar', value: 53 });
    server.auth.strategy('bazAuth', 'test', { header: 'baz', value: 64 });

    server.auth.strategy('fooOnly', 'nuisance', {
      strategies: ['fooAuth']
    });
    server.auth.strategy('fooBar', 'nuisance', {
      strategies: ['fooAuth', 'barAuth']
    });
    server.auth.strategy('fooBarBaz', 'nuisance', {
      strategies: ['fooAuth', 'barAuth', 'bazAuth']
    });

    server.route([
      {
        method: 'GET',
        path: '/foo',
        config: {
          auth: 'fooOnly',
          handler: function (request, reply) {
            reply(request.auth);
          }
        }
      },
      {
        method: 'GET',
        path: '/foo/bar',
        config: {
          auth: 'fooBar',
          handler: function (request, reply) {
            reply(request.auth);
          }
        }
      },
      {
        method: 'GET',
        path: '/foo/bar/baz',
        config: {
          auth: 'fooBarBaz',
          handler: function (request, reply) {
            reply(request.auth);
          }
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
        expect(res.result).to.deep.include({
          isAuthenticated: true,
          credentials: {
            fooAuth: { foo: 42 },
            barAuth: { bar: 53 },
            bazAuth: { baz: 64 }
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
        expect(res.result).to.deep.equal({
          statusCode: 401,
          error: 'Unauthorized'
        });
        done();
      });
    });
  });
});
