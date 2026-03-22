const MODULE_ID = 'ember_cn_unofficial';

// Safe fallback converter for Adventure tables.
// It translates table name/description and leaves table results untouched.
function safeTableResultsCollection(collection, translations) {
  if (!translations) {
    return collection;
  }

  return collection.map((data) => {
    const translation = translations[data.name];
    if (!translation) {
      return data;
    }

    return foundry.utils.mergeObject(data, {
      name: translation.name ?? data.name,
      description: translation.description ?? data.description,
      translated: true,
    });
  });
}

Hooks.once('babele.init', (babele) => {
  // Guard against malformed RollTable result translations that can crash
  // Babele's internal _tableResults converter on some adventure entries.
  const internalConverters = babele?.converters;
  const originalTableResults = internalConverters?._tableResults;
  if (typeof originalTableResults === 'function') {
    internalConverters._tableResults = function patchedTableResults(collection, translations, ...args) {
      try {
        return originalTableResults.call(this, collection, translations, ...args);
      } catch (error) {
        console.warn(`${MODULE_ID} | Falling back from Babele _tableResults converter`, error);
        return collection;
      }
    };
  }

  babele.registerConverters({
    safeTableResultsCollection,
  });

  babele.register({
    module: MODULE_ID,
    lang: 'cn',
    dir: 'compendium/cn',
  });
});
