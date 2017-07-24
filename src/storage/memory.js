// Storage implementation. Should be able to hold the current queues while being
// distributed on many many servers. (Or not)

// Internal representation may use various backends, however, the interface is
// combined to one.

// Since this is expected to be complete asynchronous, memory storage also uses
// async interface.

export default class MemoryStorage {
  constructor() {
    // TODO Perform some logic
    this.posts = [];
  }
  async getUser(id) {

  }
  async createUser(data) {

  }
  async updateUser(id, data) {

  }
  async getQueue(id) {

  }
  async createQueue(data) {

  }
  async updateQueue(id, data) {

  }
  async deleteQueue(id) {

  }
  async joinUser(queueId, userId) {

  }
  async leaveUser(queueId, userId) {

  }
  async notifyUser(id, action) {

  }
  async notifyQueue(id, action) {

  }
  async subscribeUser(id) {

  }
  async subscribeQueue(id) {

  }
  async unsubscribeUser(id) {

  }
  async unsubscribeQueue(id) {

  }
}
