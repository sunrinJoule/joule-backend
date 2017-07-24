var PRODUCTION = process.env.NODE_ENV === 'production';

if (PRODUCTION) {
  require('./lib');
} else {
  require('babel-register');
  require('./src');
}
