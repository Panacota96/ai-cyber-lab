function normalizedMap(toolAvailability = null) {
  return toolAvailability && typeof toolAvailability === 'object' ? toolAvailability : null;
}

function isVisibleLocalEntry(entry = {}, toolAvailability = null, options = {}) {
  if (String(entry?.runtime || '').toLowerCase() === 'external') return true;
  const availability = normalizedMap(toolAvailability);
  if (!availability) return options.hideLocalWhenUnknown !== true;
  const requiredBinary = String(entry?.requiredBinary || '').trim();
  if (!requiredBinary) return true;
  return availability[requiredBinary] === true;
}

export function localCommand(label, command, requiredBinary, availabilityReason = '') {
  return {
    label,
    command,
    runtime: 'local',
    requiredBinary,
    availabilityReason,
  };
}

export function externalCommand(label, command, availabilityReason = '') {
  return {
    label,
    command,
    runtime: 'external',
    availabilityReason,
  };
}

export function localCheatsheetFlag(flag, desc, requiredBinary, availabilityReason = '') {
  return {
    flag,
    desc,
    runtime: 'local',
    requiredBinary,
    availabilityReason,
  };
}

export function externalCheatsheetFlag(flag, desc, availabilityReason = '') {
  return {
    flag,
    desc,
    runtime: 'external',
    availabilityReason,
  };
}

export function filterSuggestionGroups(groups = [], toolAvailability = null, options = {}) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      ...group,
      items: (Array.isArray(group?.items) ? group.items : []).filter((entry) => isVisibleLocalEntry(entry, toolAvailability, options)),
    }))
    .filter((group) => group.items.length > 0);
}

export function filterCheatsheetTools(tools = [], toolAvailability = null, options = {}) {
  return (Array.isArray(tools) ? tools : [])
    .map((tool) => {
      const originalCategories = Array.isArray(tool?.categories) ? tool.categories : [];
      const categories = originalCategories
        .map((category) => ({
          ...category,
          flags: (Array.isArray(category?.flags) ? category.flags : []).filter((entry) => isVisibleLocalEntry(entry, toolAvailability, options)),
        }))
        .filter((category) => category.flags.length > 0);
      return {
        ...tool,
        categories,
        __keepLinkOnlyTool: categories.length === 0 && originalCategories.length === 0 && Boolean(tool?.link),
      };
    })
    .filter((tool) => tool.categories.length > 0 || tool.__keepLinkOnlyTool)
    .map(({ __keepLinkOnlyTool, ...tool }) => tool);
}

export function collectToolRequirements(...collections) {
  const binaries = new Set();

  const collectEntry = (entry) => {
    const runtime = String(entry?.runtime || '').toLowerCase();
    const requiredBinary = String(entry?.requiredBinary || '').trim();
    if (runtime === 'local' && requiredBinary) {
      binaries.add(requiredBinary);
    }
  };

  const collectGroup = (group) => {
    (Array.isArray(group?.items) ? group.items : []).forEach(collectEntry);
    (Array.isArray(group?.categories) ? group.categories : []).forEach((category) => {
      (Array.isArray(category?.flags) ? category.flags : []).forEach(collectEntry);
    });
  };

  collections.flat().forEach(collectGroup);
  return [...binaries].sort((left, right) => left.localeCompare(right));
}
