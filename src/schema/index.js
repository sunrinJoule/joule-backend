function pick(input, keys) {
  let output = {};
  keys.forEach(key => output[key] = input[key]);
  return output;
}

export function listQueueUser(queue) {
  // Hmm
  let users = (queue.queues || []).slice();
  (queue.bells || []).forEach(v => users.push(v));
  (queue.bellsProcessed || []).forEach(v => users.push(v));
  (queue.lanes || []).forEach(lane => lane.user && users.push(lane.user));
  return users;
}

export function removeQueueUser(queue, user) {
  let result = Object.assign({}, queue);
  let queuePos = queue.queues.indexOf(user.id);
  let lanePos = queue.lanes.findIndex(lane => lane.user === user.id);
  let bellPos = queue.bells.indexOf(user.id);
  let bellProcessPos = queue.bellsProcessed.indexOf(user.id);
  if (queuePos !== -1) {
    result.queues = queue.queues.filter(v => v !== user.id);
  } else if (lanePos !== -1) {
    result.lanes = queue.lanes.filter(v => v.user !== user.id);
  } else if (bellPos !== -1) {
    result.bells = queue.bells.filter(v => v !== user.id);
  } else if (bellProcessPos !== -1) {
    result.bellsProcessed = queue.bellsProcessed.filter(v => v !== user.id);
  }
  return result;
}

export function sanitizeQueueUser(queue, user) {
  let result = pick(queue, ['id', 'name', 'otp', 'useBells',
    'date']);
  result.processTimeAvg =
    (queue.processedTime / queue.processedUsers) || 0;
  result.queueUsers = queue.queues.length;
  let queuePos = queue.queues.indexOf(user.id);
  let lanePos = queue.lanes.findIndex(lane => lane.user === user.id);
  let bellPos = queue.bells.indexOf(user.id);
  let bellProcessPos = queue.bellsProcessed.indexOf(user.id);
  result.queueBefore = Math.max(queuePos, 0);
  result.queueAfter = queue.queues.length - result.queueBefore - 1;
  result.userDisplayName = (queue.userAliases[user.id] || {}).displayName;
  result.lanes = queue.lanes.map(lane => Object.assign({}, lane, {
    user: (queue.userData[lane.user] || {}).displayName,
  }));
  result.position = (() => {
    if (queuePos !== -1) return 'queue';
    if (lanePos !== -1) return 'lane';
    if (bellPos !== -1) return 'bell';
    if (bellProcessPos !== -1) return 'bellProcessed';
    return 'complete';
  })();
  if (result.position === 'lane') {
    result.lanePosition = lanePos;
  }
  return result;
}

export function sanitizeQueueManager(queue) {
  return Object.assign({}, queue, {
    processTimeAvg: (queue.processedTime / queue.processedUsers) || 0,
    manageUsers: undefined,
    queues: queue.queues.map(id => queue.userData[id].displayName),
    lanes: queue.lanes.map(lane => Object.assign({}, lane, {
      user: (queue.userData[lane.user] || {}).displayName,
    })),
    bells: queue.bells.map(bell => (queue.userData[bell] || {})),
    bellsProcessed: queue.bellsProcessed.map(bell =>
      (queue.userData[bell] || {}).displayName),
    userData: undefined,
  });
}
