const MODULE_ID = 'ember_cn_unofficial';

// Safe fallback converter for Adventure tables.
// It translates table name/description and leaves table results untouched.
function safeTableResultsCollection(collection, translations) {
  if (!Array.isArray(collection) || !translations) return collection;

  return collection.map((data) => {
    const translation = translations?.[data.name];
    if (!translation) return data;

    return foundry.utils.mergeObject(data, {
      name: translation.name ?? data.name,
      description: translation.description ?? data.description,
      translated: true,
    });
  });
}

/**
 * Translate Journal pages including custom page.system fields:
 * overview / exposition / summary / coverview / gamemaster
 *
 * collection: original pages array
 * translations: entry.pages object from translation json
 */
function emberPages(collection, translations) {
  if (!Array.isArray(collection) || !translations) return collection;

  const readTranslated = (obj, key) => {
    if (!obj) return undefined;
    if (obj[key] !== undefined) return obj[key];

    const legacyKey = `s${key}`;
    if (obj[legacyKey] !== undefined) return obj[legacyKey];

    return undefined;
  };

  return collection.map((page) => {
    const t = translations?.[page.name];
    if (!t) return page;

    const overview = readTranslated(t, 'overview');
    const exposition = readTranslated(t, 'exposition');
    const summary = readTranslated(t, 'summary');
    const coverview = readTranslated(t, 'coverview');
    const gamemaster = readTranslated(t, 'gamemaster');

    const patch = {
      name: t.name ?? page.name,
      translated: true,
    };

    // Standard page fields (same spirit as Babele pages converter)
    if (t.text !== undefined) patch.text = { ...(page.text ?? {}), content: t.text };
    if (t.src !== undefined) patch.src = t.src;
    if (t.caption !== undefined) patch.image = { ...(page.image ?? {}), caption: t.caption };
    if (t.width !== undefined || t.height !== undefined) {
      patch.video = {
        ...(page.video ?? {}),
        ...(t.width !== undefined ? { width: t.width } : {}),
        ...(t.height !== undefined ? { height: t.height } : {}),
      };
    }

    // Custom Crucible fields on page.system
    if (
      overview !== undefined ||
      exposition !== undefined ||
      summary !== undefined ||
      coverview !== undefined ||
      gamemaster !== undefined
    ) {
      const contentPatch = {
        ...(coverview !== undefined ? { overview: coverview } : {}),
        ...(gamemaster !== undefined ? { gamemaster } : {}),
      };

      patch.system = {
        ...(page.system ?? {}),
        ...(overview !== undefined ? { overview } : {}),
        ...(exposition !== undefined ? { exposition } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(Object.keys(contentPatch).length
          ? {
            content: {
              ...(page.system?.content ?? {}),
              ...contentPatch,
            },
          }
          : {}),
      };
    }

    return foundry.utils.mergeObject(page, patch);
  });
}

/**
 * Translate journals inside adventures.
 * collection: adventure.journal array
 * translations: entry.journals object
 */
function emberAdventureJournals(collection, translations) {
  if (!Array.isArray(collection) || !translations) return collection;

  return collection.map((journal) => {
    const jTrans = translations?.[journal.name];
    if (!jTrans) return journal;

    const patch = {
      name: jTrans.name ?? journal.name,
      translated: true,
    };

    if (Array.isArray(journal.pages) && jTrans.pages) {
      patch.pages = emberPages(journal.pages, jTrans.pages);
    }

    return foundry.utils.mergeObject(journal, patch);
  });
}

Hooks.once('babele.init', (babele) => {
  // Guard against malformed RollTable result translations that can crash
  // Babele's internal _tableResults converter on some adventure entries.
  const patchTableResults = (target, label) => {
    if (!target || typeof target._tableResults !== 'function') return false;
    if (target._tableResults.__emberSafePatched) return true;

    const original = target._tableResults;
    const patched = function patchedTableResults(collection, translations, ...args) {
      try {
        return original.call(this, collection, translations, ...args);
      } catch (error) {
        console.warn(`${MODULE_ID} | Falling back from Babele _tableResults converter (${label})`, error);
        return safeTableResultsCollection(collection, translations);
      }
    };

    patched.__emberSafePatched = true;
    target._tableResults = patched;
    return true;
  };

  const internalConverters = babele?.converters;
  const constructorPrototype = babele?.Converters?.prototype;
  const globalPrototype = globalThis?.Babele?.Converters?.prototype;

  patchTableResults(internalConverters, 'instance');
  patchTableResults(constructorPrototype, 'babele.Converters.prototype');
  patchTableResults(globalPrototype, 'globalThis.Babele.Converters.prototype');

  babele.registerConverters({
    // Extra safety: override converter name used by internal mappings when possible.
    _tableResults: function safeRegisteredTableResults(collection, translations, ...args) {
      try {
        if (internalConverters && typeof internalConverters._tableResults === 'function') {
          return internalConverters._tableResults.call(this, collection, translations, ...args);
        }
      } catch (error) {
        console.warn(`${MODULE_ID} | Registered _tableResults fallback`, error);
      }

      return safeTableResultsCollection(collection, translations);
    },
    safeTableResultsCollection,
    emberPages,
    emberAdventureJournals,
  });

  babele.register({
    module: MODULE_ID,
    lang: 'cn',
    dir: 'compendium/cn',
  });
});