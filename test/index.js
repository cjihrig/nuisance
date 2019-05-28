'use strict';

const Boom = require('@hapi/boom');
const Code = require('@hapi/code');
const Hapi = require('@hapi/hapi');
const Lab = require('@hapi/lab');
const Plugin = require('../lib');

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

async function prepareServer () {
  const server = new Hapi.Server();
  await server.register(Plugin);

  server.auth.scheme('test', function (server, options) {
    return {
      authenticate (request, h) {
        const header = request.headers[options.header];

        if (header === options.value) {
          const credentials = options.credentials !== undefined ?
            options.credentials : {
              [options.header]: options.value,
              scope: options.scope
            };

          return h.authenticated({ credentials });
        }
        throw Boom.unauthorized();
      }
    };
  });

  server.auth.scheme('failScheme', function (server, options) {
    return {
      authenticate (request, h) {
        server.app.failed = true;
        throw Boom.internal();
      }
    };
  });

  server.auth.strategy('fooAuth', 'test', { header: 'foo', value: 42 });
  server.auth.strategy('barAuth', 'test', { header: 'bar', value: 53 });
  server.auth.strategy('bazAuth', 'test', { header: 'baz', value: 64, scope: ['baz', 'foo'] });
  server.auth.strategy('stringCreds', 'test', { header: 'bad', value: 99, credentials: 'creds' });
  server.auth.strategy('fail', 'failScheme');

  server.auth.strategy('fooOnly', 'nuisance', {
    strategies: ['fooAuth']
  });
  server.auth.strategy('fooWithDefaults', 'nuisance', {
    strategies: [
      {
        name: 'fooAuth',
        failureCredentials (request) {
          return { path: request.path };
        }
      }
    ]
  });
  server.auth.strategy('fooBar', 'nuisance', {
    strategies: ['fooAuth', 'barAuth']
  });
  server.auth.strategy('fooBarBaz', 'nuisance', {
    strategies: ['fooAuth', { name: 'barAuth' }, 'bazAuth']
  });
  server.auth.strategy('fooStringCreds', 'nuisance', {
    strategies: ['fooAuth', 'stringCreds']
  });
  server.auth.strategy('fooFail', 'nuisance', {
    strategies: ['fooAuth', 'fail']
  });
  server.auth.strategy('fooBarBazString', 'nuisance', {
    strategies: ['fooAuth', 'barAuth', 'bazAuth', 'stringCreds']
  });

  function handler (request, h) {
    return request.auth;
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
      path: '/foo/with/defaults',
      config: {
        auth: 'fooWithDefaults',
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
      path: '/foo/stringCreds',
      config: {
        auth: 'fooStringCreds',
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

  return server;
}

describe('Nuisance', () => {
  it('authenticates multiple strategies at once', async () => {
    const server = await prepareServer();
    const res = await server.inject({
      method: 'GET',
      url: '/foo/bar/baz',
      headers: {
        foo: 42,
        bar: 53,
        baz: 64
      }
    });
    expect(res.statusCode).to.equal(200);
    expect(res.result).to.include({
      isAuthenticated: true,
      credentials: {
        fooAuth: { foo: 42, scope: undefined },
        barAuth: { bar: 53, scope: undefined },
        bazAuth: { baz: 64, scope: ['baz', 'foo'] },
        scope: ['baz', 'foo']
      },
      strategy: 'fooBarBaz',
      mode: 'required',
      error: null
    });
  });

  it('authenticates fails if any strategies fail', async () => {
    const server = await prepareServer();
    const res = await server.inject({
      method: 'GET',
      url: '/foo/bar/baz',
      headers: {
        foo: 42,
        bar: 53,
        baz: 63 // fails
      }
    });
    expect(res.statusCode).to.equal(401);
    expect(res.result).to.equal({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Unauthorized'
    });
  });

  it('does not expose scope if none of the strategies set it', async () => {
    const server = await prepareServer();
    const res = await server.inject({
      method: 'GET',
      url: '/foo/bar',
      headers: {
        foo: 42,
        bar: 53
      }
    });
    expect(res.statusCode).to.equal(200);
    expect(res.result).to.include({
      isAuthenticated: true,
      credentials: {
        fooAuth: { foo: 42, scope: undefined },
        barAuth: { bar: 53, scope: undefined }
      },
      strategy: 'fooBar',
      mode: 'required',
      error: null
    });

    expect(res.result.credentials.scope).to.be.undefined();
  });

  it('handles credentials that are not objects', async () => {
    const server = await prepareServer();
    const res = await server.inject({
      method: 'GET',
      url: '/foo/stringCreds',
      headers: {
        foo: 42,
        bad: 99
      }
    });
    expect(res.statusCode).to.equal(200);
    expect(res.result).to.include({
      isAuthenticated: true,
      credentials: {
        fooAuth: { foo: 42, scope: undefined },
        stringCreds: 'creds'
      },
      strategy: 'fooStringCreds',
      mode: 'required',
      error: null
    });
  });

  it('allows failure credentials to be set', async () => {
    const server = await prepareServer();
    const res = await server.inject({
      method: 'GET',
      url: '/foo/with/defaults',
      headers: { foo: 100 }
    });
    expect(res.statusCode).to.equal(200);
    expect(res.result).to.include({
      isAuthenticated: true,
      credentials: { fooAuth: { path: '/foo/with/defaults' } },
      strategy: 'fooWithDefaults',
      mode: 'required',
      error: null
    });
  });

  it('stops after first failing strategy', async () => {
    const server = await prepareServer();
    const res = await server.inject({
      method: 'GET',
      url: '/foo/fail',
      headers: {
        foo: 1 // fails
      }
    });

    expect(res.statusCode).to.equal(401);
    expect(res.result).to.equal({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Unauthorized'
    });
    expect(server.app.failed).to.not.exist();
  });
});
