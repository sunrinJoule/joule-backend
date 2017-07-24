import * as NetworkActions from '../action/network';
import session from '../middleware/session';

import VisibleError from '../util/visibleError';

export default class WebSocketAdapter {
  // Since the ws's server requires verifyClient option to be present, we
  // can't accept the server here. Instead, let's make the app code call
  // this.
  constructor() {
    // Now, what if the same user connects with same socket? No problem!
    // Sockets object has arrays inside, so the sockets will be stuck in there,
    // broadcasting to all sockets connected to it.
    this.sockets = {};
  }
  setDataController(controller) {
    this.controller = controller;
  }
  verifyClient(info, cb) {
    let resObject = {
      getHeader: () => [],
      setHeader: (name, value) => {
        // Set the info.req's header.
        if (info.req.headersToSet == null) {
          info.req.headersToSet = [];
        }
        info.req.headersToSet.push('Set-Cookie: ' + value);
      },
      writeHead: () => {},
    };
    session(info.req, resObject, () => {
      resObject.writeHead();
      if (info.req.session == null) {
        info.req.session = {};
      }
      cb(true);
    });
  }
  registerServer(server) {
    server.on('headers', (headers, req) => {
      if (req.headersToSet != null) {
        req.headersToSet.forEach(v => headers.push(v));
      }
    });
    server.on('connection', async(client, req) => {
      // Pre-register fallback
      let alive = true;
      client.onerror = (err) => {
        console.error(err.stack);
        alive = false;
      };
      client.onclose = () => {
        alive = false;
      };
      // Notify the data controller.
      // TODO connection action could fail.
      let result = await this.controller.postNetworkAction({
        type: NetworkActions.CONNECT,
        payload: {
          userId: req.session.id,
          // Nothing is required yet. :P
        },
      }, req.session.id);
      // Check aliveness of the socket. This is due to the nature of
      // asynchronous processing... :(
      if (!alive) return;
      let { id: userId } = result;
      this.notifySocket(client, {
        type: 'response/handshake',
        payload: result,
      });
      if (userId !== req.session.id) {
        req.session.id = userId;
        req.session.save(() => {});
      }
      // Register it to the sockets list.
      if (this.sockets[userId] == null) {
        this.sockets[userId] = [client];
      } else {
        this.sockets[userId].push(client);
      }
      // Register onerror / onclose / onmessage
      client.onerror = (err) => {
        console.error(err.stack);
        client.onclose();
      };
      client.onclose = () => {
        // Remove itself from sockets list, send action.
        let sockets = this.sockets[userId] || [];
        sockets = sockets.filter(v => v !== client);
        if (sockets.length === 0) {
          this.sockets[userId] = null;
        } else {
          this.sockets[userId] = sockets;
        }
        this.controller.postNetworkAction({
          type: NetworkActions.DISCONNECT,
          payload: {
            remainingClients: sockets.length,
          },
        }, userId).catch(e => {
          console.error(e);
        });
      };
      client.onmessage = (event) => {
        // Parse the message and do stuff
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          console.error(e);
          client.close(2000, 'JSON parsing error');
          return;
        }
        // Treat it as an action. Deny actions starting with @.
        if (data == null || data.type == null || typeof data.type !== 'string'
        ) {
          // Invalid action.
          return;
        }
        if (data.type[0] === '@') {
          // Forbidden action.
          return;
        }
        let requestOf = (data.meta || {}).requestOf;
        // Okay, send it.
        this.controller.postNetworkAction(data, userId).then(result => {
          if (result != null && result.type != null) {
            this.notifySocket(client, {
              type: 'response/ok',
              payload: result,
              meta: {
                responseOf: requestOf,
              },
            });
          }
        }, e => {
          console.error(e.stack);
          this.notifySocket(client, {
            type: 'response/error',
            payload: {
              message: (e instanceof VisibleError) ? e.message
                : 'A server error has been occurred.',
            },
            meta: {
              responseOf: requestOf,
            },
          });
        });
      };
    });
  }
  notifySocket(socket, data) {
    socket.send(JSON.stringify(data));
  }
  // Used to send push notification if the user is not available.
  hasUser(id) {
    return this.sockets[id] != null;
  }
  notifyUser(id, data) {
    // We don't need an acknowledge from the client - we just have to let them
    // know.
    if (this.sockets[id] == null) return;
    this.sockets[id].forEach(socket => {
      socket.send(JSON.stringify(data));
    });
  }
}
