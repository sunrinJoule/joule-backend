import path from 'path';
import http from 'http';
import { Server as WebSocketServer } from 'ws';
import express from 'express';

import serveStatic from 'serve-static';
import morgan from 'morgan';

import apiRouter from './api';
import networkConfig from '../config/network.config';

const production = process.env.NODE_ENV === 'production';

const httpServer = http.createServer();
const webSocketServer = new WebSocketServer({
  server: httpServer,
  // TODO Check if the session exists.
  verifyClient: (info, cb) => cb(true),
});


webSocketServer.on('connection', client => {
  // TODO Send websocket connection to a handler
});

const app = express();

app.set('x-powered-by', false);

app.use(morgan('dev'));
app.use('/api', apiRouter);
app.use(serveStatic(path.resolve(__dirname, '../public')));

app.use(function(err, req, res, next) { // eslint-disable-line
  console.error(err.stack);
  if (!production) {
    res.status(500).json({
      code: 'InternalError',
      message: err.stack,
    });
  } else {
    res.status(500).json({ code: 'InternalError' });
  }
});

httpServer.on('request', app);
httpServer.listen(networkConfig.port, networkConfig.listen, () => {
  console.log('Listening on port ' + networkConfig.port);
});
