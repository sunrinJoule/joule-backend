import randToken from 'rand-token';

import * as NetworkActions from './action/network';
import * as QueueActions from './action/queue';

import VisibleError from './util/visibleError';
import { listQueueUser, removeQueueUser, sanitizeQueueUser,
  sanitizeQueueManager } from './schema';
import overwrite from './util/overwrite';
import removeKey from './util/removeKey';

export default class DataController {
  constructor(network, storage) {
    this.network = network;
    this.storage = storage;

    this.network.setDataController(this);

    this.queues = {};
    this.users = {};
  }
  async postNetworkAction(action, userId) {
    console.log(action);
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
  updateQueue(action, id, queue) {
    // We need to send the update to users associated with the user, users
    // before the queue has changed, users after the queue has changed. Since
    // other users doesn't even have to know about it - it'll be fine.
    // In other words, listeners = (beforeUsers | afterUsers) & onlineUsers
    // Notification should be sent to previous user in the queue - but that
    // should be done in the action routine.
    let prevQueue = this.queues[id] || {};
    // Calculate each queue's users.
    let prevUsers = listQueueUser(prevQueue);
    let currentUsers = listQueueUser(queue || {});
    // Calculate union value of the array. Looks inefficient.
    let concatUsers = prevUsers.concat(currentUsers);
    concatUsers.sort();
    let unionUsers = [];
    for (let i = 0; i < concatUsers.length; ++i) {
      if (concatUsers[i] === concatUsers[i - 1]) continue;
      unionUsers.push(concatUsers[i]);
    }
    // OK! Now, calculate 'joining' users and 'departing' users.
    // I'm lazy - let's use O(n^2). Whatever!
    let joinUsers = currentUsers.filter(v => !prevUsers.includes(v));
    let leaveUsers = prevUsers.filter(v => !currentUsers.includes(v));
    // Now, update join / leave users.
    joinUsers.forEach(user => {
      let userRecord = this.users[user];
      userRecord.queues.push(id);
      userRecord.queueRecords[id] = undefined;
    });
    leaveUsers.forEach(user => {
      let userRecord = this.users[user];
      userRecord.queues = userRecord.queues.filter(r => r !== id);
    });
    this.queues[id] = queue;
    unionUsers.forEach(user => {
      let userRecord = this.users[user];
      // Pour queue data into the soon-to-be-sent-to-the-client data.
      let pouredData = Object.assign({}, userRecord, {
        queues: user.queues.map(queue => sanitizeQueueUser(
          this.queues[queue], userRecord)),
        managingQueues: user.managingQueues.map(queue =>
          sanitizeQueueManager(this.queues[queue], user)),
      });
      this.network.notifyUser(user, {
        type: 'state/update',
        payload: pouredData,
      });
      this.network.notifyUser(user, action);
    });
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
        queueResults: {},
        queues: [],
        managingQueues: [],
        notification: null,
      };
    }
    let user = this.users[userId];
    // Pour queue data into the soon-to-be-sent-to-the-client data.
    let pouredData = Object.assign({}, user, {
      queues: user.queues.map(queue => sanitizeQueueUser(
        this.queues[queue], user)),
      managingQueues: user.managingQueues.map(queue =>
        sanitizeQueueManager(this.queues[queue], user)),
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
    this.updateQueue(action, queue.id, queue);
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
    this.updateQueue(action, queue.id, undefined);
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
    this.updateQueue(action, queue.id, newQueue);
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
    this.updateQueue(action, queue.id, newQueue);
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
    this.updateQueue(action, queue.id, newQueue);
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
    this.updateQueue(action, queue.id, newQueue);
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
    this.updateQueue(action, queue.id, newQueue);
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
    const { id, name = '대기열' } = action.payload || {};
    let newQueue = Object.assign({}, queue, {
      lanes: queue.lanes.map((lane, i) => i === id ? Object.assign({}, lane, {
        name,
      }) : lane),
    });
    this.updateQueue(action, queue.id, newQueue);
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
    const { id } = action.payload || {};
    // If there's an user in the lane, send them back to the queue.
    let lane = queue.lanes[id];
    if (lane == null) throw new VisibleError('Unknown lane ID');
    let laneUser = lane.user;
    // TODO Send notification
    let newQueue = Object.assign({}, queue, {
      lanes: queue.lanes.filter((lane, i) => i !== id),
      queues: laneUser == null ? queue.queues : [laneUser].concat(queue.queues),
    });
    this.updateQueue(action, queue.id, newQueue);
    return sanitizeQueueManager(newQueue, user);
  },
  async [QueueActions.NEXT](action, userId) {
    // Check the user's validity.
    let queue = this.queues[action.payload.id];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!queue.manageUsers.includes(userId)) {
      throw new VisibleError('Forbidden');
    }
    const { laneId } = action.payload || {};
    let lane = queue.lanes[laneId];
    if (lane == null) throw new VisibleError('Unknown lane ID');
    // This cannot be used if the lane is not empty.
    if (lane.user != null) throw new VisibleError('User is already present');
    // Pull one user from the queue.
    let user = queue.queues[0];
    if (user == null) throw new VisibleError('Queue is empty');
    // Assign user to it
    let newQueue = Object.assign({}, queue, {
      queues: queue.queues.slice(1),
      lanes: queue.lanes.map((v, i) => i === laneId ? Object.assign({}, v, {
        date: Date.now(),
        user,
      }) : v),
    });
    this.updateQueue(action, queue.id, newQueue);
    return sanitizeQueueManager(newQueue);
  },
  async [QueueActions.CONFIRM](action, userId) {
    // Check the user's validity.
    let queue = this.queues[action.payload.id];
    if (queue == null) throw new VisibleError('Cannot find the queue');
    if (!queue.manageUsers.includes(userId)) {
      throw new VisibleError('Forbidden');
    }
    // We can mark the user that they have succeeded or failed, to try the
    // request again later. If bells are in use, continue the user in the bell
    // mode.
    const { laneId, success, description } = action.payload || {};
    let lane = queue.lanes[laneId];
    if (lane == null) throw new VisibleError('Unknown lane ID');
    let user = lane.user;
    if (user == null) throw new VisibleError('Lane is empty');
    // Update the processedTime / processedUsers metrics.
    let processedTime = queue.processedTime + Date.now() - lane.date;
    // Remove user from the table.
    let newQueue = Object.assign({}, queue, {
      processedTime,
      processedUsers: queue.processedUsers + 1,
      lanes: queue.lanes.map((v, i) => i === laneId ? Object.assign({}, v, {
        user: null,
      }) : v),
    });
    if (queue.useBells && success) {
      // Add the user into the bells.
      newQueue.userData = Object.assign({}, newQueue.userData, {
        [user]: Object.assign({}, newQueue.userData[user], {
          description,
        }),
      });
      newQueue.bells = newQueue.bells.concat(user);
    } else {
      newQueue.userData = removeKey(newQueue.userData, user);
      // Mark the result - set the user's queueResults.
      this.users[user].queueResults[action.payload.id] = {
        success,
        date: Date.now(),
      };
      // Dun
    }
    this.updateQueue(action, queue.id, newQueue);
    return sanitizeQueueManager(newQueue);
  },
};
