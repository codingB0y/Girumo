function normalizeWelcome(value) {
  return {
    enabled: Boolean(value?.enabled),
    message: value?.message ?? "",
  };
}

function normalizeOptOut(value, onlyDigits) {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .map((entry) => onlyDigits(entry && typeof entry === "object" ? entry.phone : entry))
      .filter(Boolean),
  );
}

async function optionalValue(read, fallback, normalize) {
  try {
    return normalize(await read());
  } catch {
    return normalize(fallback);
  }
}

async function prepareConfigSnapshot({ fetchWelcome, fetchOptOut, onlyDigits, previousState = {} }) {
  const [welcomeCfg, optOutDigits] = await Promise.all([
    optionalValue(fetchWelcome, previousState.welcomeCfg, normalizeWelcome),
    optionalValue(fetchOptOut, [...(previousState.optOutDigits ?? [])], (value) =>
      normalizeOptOut(value, onlyDigits),
    ),
  ]);
  return { welcomeCfg, optOutDigits };
}

async function prepareConnectionSnapshot({
  sock,
  fetchWelcome,
  fetchOptOut,
  isAdminOf,
  myIds,
  onlyDigits,
  previousState = {},
}) {
  const [groups, configSnapshot] = await Promise.all([
    sock.groupFetchAllParticipating(),
    prepareConfigSnapshot({ fetchWelcome, fetchOptOut, onlyDigits, previousState }),
  ]);
  const allGroups = Object.values(groups);
  const mine = myIds(sock);
  const adminGroups = allGroups.filter((group) => isAdminOf(group, mine));
  const adminGroupIds = new Set(adminGroups.map((group) => group.id));
  const groupNames = new Map(allGroups.map((group) => [group.id, group.subject]));
  const groupsPayload = {
    groups: adminGroups.map((group) => ({
      whatsappGroupId: group.id,
      name: group.subject,
      members: (group.participants ?? []).length,
    })),
  };

  return {
    ...configSnapshot,
    adminGroupIds,
    groupNames,
    adminGroups,
    groupsPayload,
  };
}

function commitConfigSnapshot(state, snapshot) {
  state.welcomeCfg = snapshot.welcomeCfg;
  state.optOutDigits = snapshot.optOutDigits;
}

function commitConnectionSnapshot(state, snapshot) {
  commitConfigSnapshot(state, snapshot);
  state.adminGroupIds = snapshot.adminGroupIds;
  state.groupNames = snapshot.groupNames;
  state.lastGroupsPayload = snapshot.groupsPayload;
  state.groupsSynced = false;
}

module.exports = {
  commitConfigSnapshot,
  commitConnectionSnapshot,
  prepareConfigSnapshot,
  prepareConnectionSnapshot,
};
