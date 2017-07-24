import randToken from 'rand-token';

import * as NetworkActions from './action/network';
import * as QueueActions from './action/queue';

import VisibleError from './util/visibleError';
import { removeQueueUser, sanitizeQueueUser, sanitizeQueueManager }
  from './schema';
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
    if (action.payload == null) action.payload = {};
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
        queueResults: [],
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
    const { name = '대기열', otp = true, useBells = false,
      lanes = ['창구 1'] } = action.payload || {};
    let queue = {
      id: randToken.suid(6),
      name,
      otp,
      otpSecret: randToken.uid(80),
      managerSecret: randToken.uid(24),
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
      userCount: 0,
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
    const { name, otp, useBells } = action.payload || {};
    let newQueue = overwrite(queue, { name, otp, useBells });
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueManager(newQueue, user);
  },
  async [QueueActions.JOIN](action, userId) {
    // We need to check user's presence in the queue. This can be done by
    // checking the result of sanitizeQueueUser. But let's trust user's data.
    // After all, updateQueue uses diff table to update the user data.
    let queue = this.queues[action.payload.id];
    let user = this.users[userId];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!user.queues.includes(queue.id)) {
      throw new VisibleError('Already joined');
    }
    // TODO Check OTP validity
    // Tada! Add the user to the queue. Assign the user random number too.
    let newQueue = Object.assign({}, queue, {
      userCount: queue.userCount + 1,
      userData: Object.assign({}, queue.userData, {
        [user.id]: {
          date: Date.now(),
          displayName: (queue.userCount + 1) % 1000,
        },
      }),
      queues: queue.queues.concat(user.id),
    });
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueUser(newQueue, user);
  },
  async [QueueActions.LEAVE](action, userId) {
    // Check user's presence in here too.
    let queue = this.queues[action.payload.id];
    let user = this.users[userId];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    // Case 1. User is in the queue - Simply remove them, all good!
    // Case 2. User is in the lane - Set it to null. Done!
    // Case 3. User is in the bell - Since the 'host' is making something at
    // this point, removing it is harmful. Whatever. It's their loss.
    // Case 4. User is in the bellsProcessed - Simply remove it.
    if (!user.queues.includes(queue.id)) {
      throw new VisibleError('Already left');
    }
    // Remove the user. 
    let newQueue = removeQueueUser(queue, user);
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueUser(newQueue, user);
  },
  async [QueueActions.JOIN_MANAGER](action, userId) {
    // Check user's presence in here too.
    let queue = this.queues[action.payload.id];
    let user = this.users[userId];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (queue.managerSecret !== action.payload.secret) {
      throw new VisibleError('Invalid secret code');
    }
    if (user.managingQueues.includes(queue.id)) {
      throw new VisibleError('Already registered as a manager');
    }
    let newQueue = Object.assign({}, queue, {
      manageUsers: queue.manageUsers.concat(user.id),
    });
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueUser(newQueue, user);
  },
  async [QueueActions.LEAVE_MANAGER](action) {
    // TODO Why do we even need this
  },
  async [QueueActions.CREATE_LANE](action, userId) {
    // Check the user's validity.
    let queue = this.queues[action.payload.id];
    let user = this.users[userId];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!queue.manageUsers.includes(userId)) {
      throw new VisibleError('Forbidden');
    }
    const { name = '대기열' } = action.payload || {};
    let newQueue = Object.assign({}, queue, {
      lanes: queue.lanes.concat({
        name, date: 0, user: null,
      }),
    });
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueManager(newQueue, user);
  },
  async [QueueActions.RENAME_LANE](action, userId) {
    // Check the user's validity.
    let queue = this.queues[action.payload.id];
    let user = this.users[userId];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!queue.manageUsers.includes(userId)) {
      throw new VisibleError('Forbidden');
    }
    const { id = 0, name = '대기열' } = action.payload || {};
    let newQueue = Object.assign({}, queue, {
      lanes: queue.lanes.map((lane, i) => i === id ? Object.assign({}, lane, {
        name,
      }) : lane),
    });
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueManager(newQueue, user);
  },
  async [QueueActions.DELETE_LANE](action, userId) {
    // Check the user's validity.
    let queue = this.queues[action.payload.id];
    let user = this.users[userId];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!queue.manageUsers.includes(userId)) {
      throw new VisibleError('Forbidden');
    }
    const { id = 0 } = action.payload || {};
    // If there's an user in the lane, send them back to the queue.
    let lane = queue.lanes[id];
    if (lane == null) throw new VisibleError('Unknown lane ID');
    let user = lane.user;
    // TODO Send notification
    let newQueue = Object.assign({}, queue, {
      lanes: queue.lanes.filter((lane, i) => i !== id),
      queues: user == null ? queue.queues : [user].concat(queue.queues),
    });
    this.updateQueue(queue.id, newQueue);
    return sanitizeQueueManager(newQueue, user);
  },
  async [QueueActions.NEXT](action) {

  },
};
