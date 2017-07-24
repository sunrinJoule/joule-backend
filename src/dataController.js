import * as NetworkActions from './action/network';
import * as QueueActions from './action/queue';

export default class DataController {
  constructor(network, storage) {
    this.network = network;
    this.storage = storage;

    this.network.setDataController(this);

    this.queues = {};
    this.users = {};

    this.userSecrets = {};
  }
  async postNetworkAction(action, userId) {
    // An action is sent; process it.
    // First, check the validity of the action, reject if the request is not
    // coming from right users.
    // Then, change the data - the changed data should be sent to other server
    // nodes and users.
    // Other server nodes should receive full data if the node is interested,
    // or it can be ignored if it's not.
    if (action == null) throw new Error('Action is null');
    return 1;
  }
  updateQueue(queue) {
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
  async [NetworkActions.CONNECT](action) {
    // action.req should contain the socket associated with the action.
    // Also, we have to set the ID.
  },
  async [NetworkActions.DISCONNECT](action) {

  },
  async [QueueActions.CREATE](action) {

  },
  async [QueueActions.DELETE](action) {

  },
  async [QueueActions.UPDATE](action) {

  },
  async [QueueActions.JOIN](action) {

  },
  async [QueueActions.LEAVE](action) {

  },
  async [QueueActions.CREATE_LINE](action) {

  },
  async [QueueActions.RENAME_LINE](action) {

  },
  async [QueueActions.DELETE_LINE](action) {

  },
  async [QueueActions.NEXT](action) {

  },
};
