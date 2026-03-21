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
  babele.registerConverters({
    safeTableResultsCollection,
  });

  babele.register({
    module: MODULE_ID,
    lang: 'cn',
    dir: 'compendium/cn',
  });
});
