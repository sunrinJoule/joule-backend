function pick(input, keys) {
  let output = {};
  keys.forEach(key => output[key] = input[key]);
  return output;
}

export function sanitizeQueueUser(queue, user) {
  let result = pick(queue, ['id', 'name', 'otp', 'useLanes', 'useBells',
    'date']);
  result.processTimeAvg = queue.processedTime / queue.processedUsers;
  result.queueUsers = queue.queues.length;
  let queuePos = queue.queues.indexOf(user.id);
  let lanePos = queue.lanes.findIndex(lane => lane.user === user.id);
  let bellPos = queue.bells.indexOf(user.id);
  result.queueBefore = Math.max(queuePos, 0);
  result.queueAfter = queue.queues.length - result.queueBefore - 1;
  result.userDisplayName = (queue.userAliases[user.id] || {}).displayName;
  result.lanes = queue.lanes.map(lane => Object.assign({}, lane, {
    user: (queue.userData[user] || {}).displayName,
  }));
  result.position = (() => {
    if (queuePos !== -1) return 'queue';
    if (lanePos !== -1) return 'lane';
    if (bellPos !== -1) return 'bell';
    return 'complete';
  })();
  if (result.position === 'lane') {
    result.lanePosition = lanePos;
  }
  return result;
}

export function sanitizeQueueManager(queue, user) {
  return Object.assign({}, queue, {
    processTimeAvg: queue.processedTime / queue.processedUsers,
    manageUsers: undefined,
    queues: queue.queues.map(id => queue.userData[id].displayName),
    lanes: queue.lanes.map(lane => Object.assign({}, lane, {
      user: (queue.userData[user] || {}).displayName,
    })),
    bells: queue.bells.map(bell => (queue.userData[user] || {})),
    bellsProcessed: queue.bellsProcessed.map(bell =>
      (queue.userData[user] || {}).displayName),
    userData: undefined,
  });
}
