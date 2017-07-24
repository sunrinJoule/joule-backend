import randToken from 'rand-token';

import * as NetworkActions from './action/network';
import * as QueueActions from './action/queue';

import VisibleError from './util/visibleError';
import { sanitizeQueueUser, sanitizeQueueManager } from './schema';
import overwrite from './util/overwrite';

export default class DataController {
  constructor(network, storage) {
    this.network = network;
    this.storage = storage;

    this.network.setDataController(this);

    this.queues = {};
    this.users = {};
  }
  async postNetworkAction(action, userId) {
    // An action is sent; process it.
    // First, check the validity of the action, reject if the request is not
    // coming from right users.
    // Then, change the data - the changed data should be sent to other server
    // nodes and users.
    // Other server nodes should receive full data if the node is interested,
    // or it can be ignored if it's not.
    if (action == null) throw new VisibleError('Action is null');
    let handler = HANDLERS[action.type];
    if (handler == null) {
      throw new VisibleError('Server doesn\'t understand the action.');
    }
    return handler.call(this, action, userId);
  }
  updateQueue(id, queue) {
    // We need to send the update to users associated with the user, users
    // before the queue has changed, users after the queue has changed. Since
    // other users doesn't even have to know about it - it'll be fine.
    // In other words, listeners = (beforeUsers | afterUsers) & onlineUsers
    // Notification should be sent to previous user in the queue - but that
    // should be done in the action routine.
  }
  updateUser(user) {
    // Obviously if the user has changed, send the event to that user.
  }
}

const HANDLERS = {
  async [NetworkActions.CONNECT](action, reqUserId) {
    // action.req should contain the socket associated with the action.
    // Also, we have to set the ID.
    // We have to load the user from the persistent storage. But that's
    // a luxury - let's just use the RAM.
    let userId;
    if (this.users[reqUserId] != null) {
      userId = reqUserId;
    } else {
      userId = randToken.suid(24);
      this.users[userId] = {
        id: userId,
        queues: [],
        managingQueues: [],
        notification: null,
      };
    }
    let user = this.users[userId];
    // Pour queue data into the soon-to-be-sent-to-the-client data.
    let pouredData = Object.assign({}, user, {
      queues: user.queues.map(queue => sanitizeQueueUser(queue, user)),
      managingQueues: user.managingQueues.map(queue =>
        sanitizeQueueManager(queue, user)),
    });
    return pouredData;
  },
  async [NetworkActions.DISCONNECT](action) {
    // Don't do anything - since the user record needs to be present to send
    // the push notification, we can't delete them. They might come back later!
  },
  async [QueueActions.CREATE](action, userId) {
    const { name = '대기열', otp = true, useLanes = true, useBells = false,
      lanes = ['창구 1'] } = action.payload || {};
    let queue = {
      id: randToken.suid(6),
      name,
      otp,
      otpSecret: randToken.uid(80),
      useLanes,
      useBells,
      processedUsers: 0,
      processedTime: 0,
      manageUsers: [userId],
      queues: [],
      lanes: lanes.map(name => ({
        name, date: 0, user: null,
      })),
      bells: [],
      // Only 10 users are saved
      bellsProcessed: [],
      // This is for the internal representation.
      userData: {},
      date: Date.now(),
    };
    let user = this.users[userId];
    // TODO Queue ID may conflict
    this.updateQueue(queue.id, queue);
    return sanitizeQueueManager(queue, user);
  },
  async [QueueActions.DELETE](action, userId) {
    // Check the user's validity.
    let queue = this.queues[action.payload.id];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!queue.manageUsers.includes(userId)) {
      throw new VisibleError('Forbidden');
    }
    // :/
    this.updateQueue(queue.id, undefined);
    return undefined;
  },
  async [QueueActions.UPDATE](action, userId) {
    // Check the user's validity.
    let queue = this.queues[action.payload.id];
    let user = this.users[userId];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!queue.manageUsers.includes(userId)) {
      throw new VisibleError('Forbidden');
    }
    const { name, otp, useLanes, useBells } = action.payload || {};
    let newQueue = overwrite(queue, { name, otp, useLanes, useBells });
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueManager(newQueue, user);
  },
  async [QueueActions.JOIN](action) {

  },
  async [QueueActions.LEAVE](action) {

  },
  async [QueueActions.CREATE_LANE](action) {

  },
  async [QueueActions.RENAME_LANE](action) {

  },
  async [QueueActions.DELETE_LANE](action) {

  },
  async [QueueActions.NEXT](action) {

  },
};
