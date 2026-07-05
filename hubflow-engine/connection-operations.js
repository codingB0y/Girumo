function createLatestConfigRefresher({ state, isLatest, prepare, commit }) {
  let latestRequestId = 0;
  return async function refresh(sock) {
    const requestId = ++latestRequestId;
    const snapshot = await prepare();
    if (requestId !== latestRequestId || !isLatest(sock)) return false;
    commit(state, snapshot);
    return true;
  };
}

function createGroupSyncCoordinator({ state, isLatest, send, onResult = () => {}, onError = () => {} }) {
  let tail = Promise.resolve();
  const inFlightBySocket = new WeakMap();

  function isCurrent(sock, payload) {
    return isLatest(sock) && state.lastGroupsPayload === payload;
  }

  return function sync(sock, payload, options = {}) {
    let byPayload = inFlightBySocket.get(sock);
    if (!byPayload) {
      byPayload = new WeakMap();
      inFlightBySocket.set(sock, byPayload);
    }
    const duplicate = byPayload.get(payload);
    if (duplicate) return duplicate;

    const operation = tail.then(async () => {
      if (!isCurrent(sock, payload)) return false;
      let response;
      try {
        response = await send(payload, options);
      } catch (error) {
        if (!isCurrent(sock, payload)) return false;
        state.groupsSynced = false;
        onError({ error, payload, options });
        return false;
      }
      if (!isCurrent(sock, payload)) return false;
      state.groupsSynced = Boolean(response?.ok);
      onResult({ response, payload, options });
      return state.groupsSynced;
    });
    byPayload.set(payload, operation);
    const cleanup = () => {
      if (byPayload.get(payload) === operation) byPayload.delete(payload);
    };
    operation.then(cleanup, cleanup);
    tail = operation.catch(() => {});
    return operation;
  };
}

function createSafeOpenHandler({
  isLatest,
  initialize,
  release,
  close,
  scheduleReconnect,
  reconnectDelay = 0,
  logger = console,
  onSettled = () => {},
}) {
  const log = (message, error) => {
    const write = logger.error ?? logger.log;
    if (typeof write === "function") write.call(logger, message, error);
  };
  const observeClose = (sock) => {
    Promise.resolve()
      .then(() => close(sock))
      .catch((error) => log("connection open cleanup failed", error));
  };

  return function handleOpen(sock) {
    const operation = Promise.resolve()
      .then(() => initialize(sock))
      .then((initialized) => {
        if (!initialized) observeClose(sock);
      })
      .catch((error) => {
        if (isLatest(sock) && release(sock)) scheduleReconnect(reconnectDelay);
        observeClose(sock);
        log("connection open initialization failed", error);
      });
    operation
      .then(() => onSettled())
      .catch((error) => log("connection open settlement failed", error));
  };
}

function observePromise(promise, logger = console, message = "asynchronous operation failed") {
  return Promise.resolve(promise).then(
    () => true,
    (error) => {
      const write = logger.error ?? logger.log;
      if (typeof write === "function") write.call(logger, message, error);
      return false;
    },
  );
}

module.exports = {
  createGroupSyncCoordinator,
  createLatestConfigRefresher,
  createSafeOpenHandler,
  observePromise,
};
