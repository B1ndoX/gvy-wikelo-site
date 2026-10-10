// Missing supplemental information must not hold back authoritative LIVE facts.
// Existing verified information must not silently disappear during enrichment.
export function localizationGaps(trades, items) {
  const fallback = name => name?.localizationSource === "english_fallback";
  return [
    { code: "trade-localization-fallback", ids: trades.filter(trade => fallback(trade.name)).map(trade => trade.id) },
    { code: "item-localization-fallback", ids: items.filter(item => fallback(item.name)).map(item => item.id) },
    { code: "crafting-ingredient-localization-fallback", ids: items.flatMap(item => (item.crafting?.ingredients ?? [])
      .filter(ingredient => fallback(ingredient.name)).map(ingredient => `${item.id}:${ingredient.id || ingredient.name.en}`)) },
  ].filter(gap => gap.ids.length);
}

export function hasSourcedAcquisition(item) {
  return (item.acquisition ?? []).some(method => method.type !== "unknown" && Boolean(method.sourceUrl));
}

export function supplementalAuditIssues(trades, items, requirements) {
  const errors = [], warnings = localizationGaps(trades, items);
  const fallbackNames = [...trades, ...items, ...items.flatMap(item => item.crafting?.ingredients ?? [])];
  const invalid = fallbackNames.filter(entry => entry.name.localizationSource === "english_fallback" && !entry.name.en?.trim());
  if (invalid.length) errors.push({ code: "missing-english-fallback-name", ids: invalid.map(entry => entry.id) });
  const unknown = requirements.filter(item => !item.acquisition.length || item.acquisition.some(method => method.type === "unknown"));
  if (unknown.length) warnings.push({ code: "unknown-requirement-acquisition", ids: unknown.map(item => item.id) });
  const misleading = items.filter(item => item.acquisition.some(method => method.type === "unknown"
    && (method.label !== "获取方式暂无" || method.location !== "具体获取路径暂无" || method.price !== null || method.currency !== null)));
  if (misleading.length) errors.push({ code: "misleading-unknown-acquisition", ids: misleading.map(item => item.id) });
  const unsourced = requirements.filter(item => item.acquisition.some(method => method.type !== "unknown" && !method.sourceUrl));
  if (unsourced.length) errors.push({ code: "unsourced-requirement-acquisition", ids: unsourced.map(item => item.id) });
  return { errors, warnings };
}

function namesByStableId(trades, items) {
  const names = new Map();
  for (const trade of trades) {
    names.set(`trade:${trade.id}`, trade.name);
    for (const field of ["requirements", "rewards"]) {
      for (const item of trade[field] ?? []) names.set(`trade:${trade.id}:${field}:${item.id}`, item.name);
    }
  }
  for (const item of items) {
    names.set(`item:${item.id}`, item.name);
    for (const ingredient of item.crafting?.ingredients ?? []) {
      names.set(`item:${item.id}:ingredient:${ingredient.id || ingredient.name.en}`, ingredient.name);
    }
  }
  return names;
}

export function detectSupplementRegressions({ previousTrades = [], previousItems = [], trades, items }) {
  const regressions = [];
  const previousNames = namesByStableId(previousTrades, previousItems);
  for (const [id, name] of namesByStableId(trades, items)) {
    const previous = previousNames.get(id);
    if (previous?.localizationSource && previous.localizationSource !== "english_fallback"
      && (name?.localizationSource === "english_fallback" || (previous.zh && !name?.zh))) {
      regressions.push(`Verified localization lost: ${id}`);
    }
  }
  const previousById = new Map(previousItems.map(item => [item.id, item]));
  for (const item of items) {
    const previous = previousById.get(item.id);
    if (!previous) continue; // New items may honestly lack images/routes.
    if (previous.imagePath && !item.imagePath) regressions.push(`Verified image lost: ${item.id}`);
    if (hasSourcedAcquisition(previous) && !hasSourcedAcquisition(item)) regressions.push(`Sourced acquisition lost: ${item.id}`);
    if (previous.descriptionZh && !item.descriptionZh) regressions.push(`Chinese description lost: ${item.id}`);
  }
  return regressions;
}
