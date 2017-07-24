import session from 'express-session';
import authConfig from '../../config/auth.config';

export default session({
  secret: authConfig.cookieSecret,
  resave: false,
  saveUninitialized: false,
  // store: sessionStore,
});
