# nuisance

[![Current Version](https://img.shields.io/npm/v/nuisance.svg)](https://www.npmjs.org/package/nuisance)
[![Build Status via Travis CI](https://travis-ci.org/continuationlabs/nuisance.svg?branch=master)](https://travis-ci.org/continuationlabs/nuisance)
![Dependencies](http://img.shields.io/david/continuationlabs/nuisance.svg)

[![belly-button-style](https://cdn.rawgit.com/continuationlabs/belly-button/master/badge.svg)](https://github.com/continuationlabs/belly-button)

`nuisance` is a hapi plugin that allows multiple authentication strategies to be aggregated into a single strategy. hapi allows you specify multiple strategies on a route, however this approach only requires that a single strategy is successful. `nuisance`, on the other hand, requires that **all** of the strategies are successful.

If all of the authentication strategies are successful, `request.auth.credentials` will be populated with the credentials from each strategy. If any of the strategies fail, an Unauthorized error will be returned.

## Configuration Options

- `strategies` (array) - An array of strings, representing the authentication strategies to be tested.
