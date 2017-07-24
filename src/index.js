import path from 'path';
import http from 'http';
import { Server as WebSocketServer } from 'ws';
import express from 'express';

import bodyParser from 'body-parser';
import expressPromise from 'express-promise';
import session from './middleware/session';

import serveStatic from 'serve-static';
import morgan from 'morgan';
import cors from 'cors';

import DataController from './dataController';
import WebSocketAdapter from './network/webSocket';

import apiRouter from './api';
import networkConfig from '../config/network.config';

const production = process.env.NODE_ENV === 'production';

// TODO
const webSocketAdapter = new WebSocketAdapter();
const dataController = new DataController(webSocketAdapter, null);

const httpServer = http.createServer();
const webSocketServer = new WebSocketServer({
  server: httpServer,
  verifyClient: webSocketAdapter.verifyClient.bind(webSocketAdapter),
});

webSocketAdapter.registerServer(webSocketServer);

const app = express();

app.set('x-powered-by', false);

// TODO Remove in production
app.use(cors({
  origin: (_, callback) => callback(null, true),
  credentials: true,
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session);
app.use(expressPromise());
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
