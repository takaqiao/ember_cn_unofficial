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

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Translate Crucible item actions using legacy flat translation fields:
 * actionname / actiondesc / actioneffectname
 */
function emberActions(actions, _translation, _data, _tc, allTranslations) {
  if (!Array.isArray(actions)) return actions;

  const names = toArray(allTranslations?.actionname);
  const descriptions = toArray(allTranslations?.actiondesc);
  const effectNames = toArray(allTranslations?.actioneffectname);

  let effectCursor = 0;

  return actions.map((action, actionIndex) => {
    const patch = {
      ...(names[actionIndex] !== undefined ? { name: names[actionIndex] } : {}),
      ...(descriptions[actionIndex] !== undefined ? { description: descriptions[actionIndex] } : {}),
    };

    if (Array.isArray(action?.effects) && action.effects.length) {
      patch.effects = action.effects.map((effect) => {
        if (effectNames[effectCursor] === undefined) {
          return effect;
        }

        const translatedEffect = foundry.utils.mergeObject(effect, {
          name: effectNames[effectCursor],
        });

        effectCursor += 1;
        return translatedEffect;
      });
    }

    return foundry.utils.mergeObject(action, patch);
  });
}

/**
 * Patch Babele's importAdventure hook for Foundry payloads where token.delta can be null.
 *
 * Babele 2.7.5 assumes token.delta is always an object and reads token.delta.name directly.
 * Some imported scenes provide null delta, which throws and interrupts Adventure import.
 */
function patchBabeleImportAdventureHook() {
  const events = Hooks?.events;
  const importAdventure = events?.importAdventure;
  if (!Array.isArray(importAdventure)) return;

  for (const entry of importAdventure) {
    const fn = entry?.fn;
    if (typeof fn !== 'function') continue;
    if (fn.__emberBabeleImportPatched) continue;

    // Identify the Babele handler by its distinctive source pattern.
    const source = `${fn}`;
    const looksLikeBabeleImportHook = source.includes('game.scenes.forEach') && source.includes('token.delta.name');
    if (!looksLikeBabeleImportHook) continue;

    const wrapped = function safeBabeleImportAdventureHook(...args) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        const isDeltaNameCrash = error instanceof TypeError && String(error.message).includes("reading 'name'");
        if (!isDeltaNameCrash) throw error;

        console.debug(`${MODULE_ID} | Patched Babele importAdventure hook fallback`, error);

        // Fallback equivalent to Babele's logic, but with null-safe delta access.
        game.scenes.forEach((scene) => {
          scene.tokens.forEach((token) => {
            const actor = game.actors.get(token.actorId);
            if (actor && !token?.delta?.name) {
              token.update({ name: actor.prototypeToken.name });
            }
          });
        });
      }
    };

    wrapped.__emberBabeleImportPatched = true;
    entry.fn = wrapped;
  }
}

function normalizeDescriptionValue(value) {
  if (typeof value === 'string') {
    return {
      public: value,
      private: '',
    };
  }

  if (value && typeof value === 'object') {
    return {
      public: typeof value.public === 'string' ? value.public : '',
      private: typeof value.private === 'string' ? value.private : '',
    };
  }

  return {
    public: '',
    private: '',
  };
}

/**
 * Repair legacy worlds where older translations wrote system.description as a string.
 * Newer Crucible schemas expect an object: { public, private }.
 */
async function migrateLegacyDescriptionShape() {
  if (!game.user?.isGM) return;

  const world = game.world;
  const migratedFlag = world?.getFlag?.(MODULE_ID, 'legacyDescriptionMigrated');
  if (migratedFlag) return;

  let updatedWorldItems = 0;
  let updatedActors = 0;
  let updatedEmbeddedItems = 0;

  for (const item of game.items ?? []) {
    const description = foundry.utils.getProperty(item, 'system.description');
    if (typeof description !== 'string') continue;

    try {
      await item.update({
        'system.description': normalizeDescriptionValue(description),
      });
      updatedWorldItems += 1;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to migrate world item description`, item?.name, error);
    }
  }

  for (const actor of game.actors ?? []) {
    const actorDescription = foundry.utils.getProperty(actor, 'system.description');
    if (typeof actorDescription === 'string') {
      try {
        await actor.update({
          'system.description': normalizeDescriptionValue(actorDescription),
        });
        updatedActors += 1;
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to migrate actor description`, actor?.name, error);
      }
    }

    const itemUpdates = [];
    for (const item of actor.items ?? []) {
      const description = foundry.utils.getProperty(item, 'system.description');
      if (typeof description !== 'string') continue;

      itemUpdates.push({
        _id: item.id,
        'system.description': normalizeDescriptionValue(description),
      });
    }

    if (!itemUpdates.length) continue;

    try {
      await actor.updateEmbeddedDocuments('Item', itemUpdates);
      updatedEmbeddedItems += itemUpdates.length;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to migrate embedded item descriptions`, actor?.name, error);
    }
  }

  if (updatedWorldItems || updatedActors || updatedEmbeddedItems) {
    console.info(
      `${MODULE_ID} | Legacy description migration complete`,
      { updatedWorldItems, updatedActors, updatedEmbeddedItems }
    );
  }

  try {
    await world?.setFlag?.(MODULE_ID, 'legacyDescriptionMigrated', true);
  } catch (error) {
    console.warn(`${MODULE_ID} | Unable to persist migration flag`, error);
  }
}

function sanitizeActionEffects(actions) {
  if (!Array.isArray(actions)) return actions;

  let changed = false;
  const patched = actions.map((action) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return action;

    const patch = {};

    if (action.effects !== undefined && !Array.isArray(action.effects)) {
      patch.effects = [];
      changed = true;
    }

    const effects = Array.isArray(patch.effects) ? patch.effects : (Array.isArray(action.effects) ? [...action.effects] : undefined);
    if (Array.isArray(effects)) {
      let effectChanged = false;
      for (let i = 0; i < effects.length; i += 1) {
        const effect = effects[i];
        if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
          effects[i] = {};
          effectChanged = true;
        }
      }

      if (action.id === 'causticPhial' && !effects[0]) {
        effects[0] = {};
        effectChanged = true;
      }

      if (effectChanged) {
        patch.effects = effects;
        changed = true;
      }
    }

    if (!Object.keys(patch).length) return action;
    return foundry.utils.mergeObject(action, patch);
  });

  return changed ? patched : actions;
}

function sanitizeEmbeddedCollectionArray(value) {
  if (!Array.isArray(value)) return value;

  let changed = false;
  const sanitized = value.filter((entry) => {
    const keep = entry && typeof entry === 'object' && !Array.isArray(entry);
    if (!keep) changed = true;
    return keep;
  });

  return changed ? sanitized : value;
}

function isKnownUpdateDiffError(error) {
  const message = String(error?.message ?? '');
  return message.includes('getFailure') || message.includes('One of original or other are not Objects');
}

function degradeActorUpdatePayload(update) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return update;

  const degraded = foundry.utils.deepClone(update);
  delete degraded.items;
  delete degraded.effects;
  return degraded;
}

function isAdventureImportInvocation() {
  const stack = String(new Error().stack ?? '');
  return stack.includes('Adventure.importContent') || stack.includes('EmberAdventureImporter._processSubmitData');
}

function prepareSafeActorUpdatesForImport(updates) {
  if (!Array.isArray(updates)) return updates;
  return updates.map((update) => degradeActorUpdatePayload(update));
}

async function syncCrucibleOwnedItems({ force = true, reload = false, talents = true, spells = true } = {}) {
  const syncMethod = globalThis.crucible?.api?.methods?.syncOwnedItems;
  if (typeof syncMethod !== 'function') {
    throw new Error('Crucible syncOwnedItems API is unavailable.');
  }

  await syncMethod({ force, reload, talents, spells });
}

async function syncCurrentActorOwnedItems({ talents = true, spells = true } = {}) {
  const actor = game.user?.character;
  if (!actor) throw new Error('No assigned user character to sync.');

  const actorUpdate = { '_stats.systemVersion': game.system.version };
  const batchCreate = [];
  const batchUpdate = [];
  const batchDelete = [];

  if (talents) {
    const { toCreate, toUpdate, toDelete, actorUpdates } = await actor.syncTalents({ performUpdates: false });
    batchCreate.push(...toCreate);
    batchUpdate.push(...toUpdate);
    batchDelete.push(...toDelete);
    Object.assign(actorUpdate, actorUpdates);
  }

  if (spells) {
    const { toCreate, toUpdate, toDelete } = await actor.syncIconicSpells({ performUpdates: false });
    batchCreate.push(...toCreate);
    batchUpdate.push(...toUpdate);
    batchDelete.push(...toDelete);
  }

  const batchOperations = actor.defineBatchOperations(actorUpdate, {
    createItems: { changes: batchCreate, options: { keepId: true } },
    updateItems: { changes: batchUpdate, options: { diff: false, recursive: false, noHook: true } },
    deleteItems: batchDelete,
  });
  await foundry.documents.modifyBatch(batchOperations);
}

function exposeSyncApi() {
  globalThis.emberCN = {
    syncOwnedItems: syncCrucibleOwnedItems,
    syncMyActor: syncCurrentActorOwnedItems,
  };
}

function sanitizeItemDataShape(itemData) {
  if (!itemData || typeof itemData !== 'object' || Array.isArray(itemData)) return itemData;

  const patch = {};

  const embeddedEffects = sanitizeEmbeddedCollectionArray(itemData.effects);
  if (embeddedEffects !== itemData.effects) {
    patch.effects = embeddedEffects;
  }

  const description = foundry.utils.getProperty(itemData, 'system.description');
  if (typeof description === 'string') {
    foundry.utils.setProperty(patch, 'system.description', normalizeDescriptionValue(description));
  }

  const actions = foundry.utils.getProperty(itemData, 'system.actions');
  const sanitizedActions = sanitizeActionEffects(actions);
  if (sanitizedActions !== actions) {
    foundry.utils.setProperty(patch, 'system.actions', sanitizedActions);
  }

  if (!Object.keys(patch).length) return itemData;
  return foundry.utils.mergeObject(itemData, patch);
}

function sanitizeActorUpdatePayload(changes) {
  if (!changes || typeof changes !== 'object') return;

  const actorEffects = sanitizeEmbeddedCollectionArray(changes.effects);
  if (actorEffects !== changes.effects) {
    changes.effects = actorEffects;
  }

  if (Array.isArray(changes.items)) {
    changes.items = changes.items.map((itemUpdate) => sanitizeItemDataShape(itemUpdate));
  }
}

function sanitizeActorDocumentUpdatesArray(updates) {
  if (!Array.isArray(updates)) return updates;

  return updates.map((update) => {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return {};
    sanitizeActorUpdatePayload(update);
    return update;
  });
}

function patchActorUpdateDocuments() {
  const ActorClass = globalThis.CONFIG?.Actor?.documentClass;
  const original = ActorClass?.updateDocuments;
  if (!ActorClass || typeof original !== 'function') return;
  if (original.__emberSafePatched) return;

  const wrapped = async function safeActorUpdateDocuments(updates, ...args) {
    const sanitized = sanitizeActorDocumentUpdatesArray(updates);
    const importMode = isAdventureImportInvocation();
    const initialPayload = importMode ? prepareSafeActorUpdatesForImport(sanitized) : sanitized;

    try {
      return await original.call(this, initialPayload, ...args);
    } catch (error) {
      if (!isKnownUpdateDiffError(error) || !importMode) throw error;

      // Import-specific fallback: isolate updates so malformed embedded data
      // from one actor does not abort the entire Adventure import.
      const results = [];
      for (const update of initialPayload) {
        try {
          const part = await original.call(this, [update], ...args);
          if (Array.isArray(part)) results.push(...part);
          continue;
        } catch (singleError) {
          if (!isKnownUpdateDiffError(singleError)) throw singleError;
        }

        const actorId = update?._id ?? 'unknown';
        console.error(`${MODULE_ID} | Skipped malformed actor update during import`, actorId);
      }

      return results;
    }
  };

  wrapped.__emberSafePatched = true;
  ActorClass.updateDocuments = wrapped;
}

async function migrateLegacyCausticPhialEffects() {
  if (!game.user?.isGM) return;

  const world = game.world;
  const migratedFlag = world?.getFlag?.(MODULE_ID, 'legacyCausticPhialEffectsMigrated');
  if (migratedFlag) return;

  let updatedWorldItems = 0;
  let updatedEmbeddedItems = 0;

  for (const item of game.items ?? []) {
    const actions = foundry.utils.getProperty(item, 'system.actions');
    const sanitized = sanitizeActionEffects(actions);
    if (sanitized === actions) continue;

    try {
      await item.update({ 'system.actions': sanitized });
      updatedWorldItems += 1;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to migrate world item action effects`, item?.name, error);
    }
  }

  for (const actor of game.actors ?? []) {
    const itemUpdates = [];
    for (const item of actor.items ?? []) {
      const actions = foundry.utils.getProperty(item, 'system.actions');
      const sanitized = sanitizeActionEffects(actions);
      if (sanitized === actions) continue;

      itemUpdates.push({
        _id: item.id,
        'system.actions': sanitized,
      });
    }

    if (!itemUpdates.length) continue;

    try {
      await actor.updateEmbeddedDocuments('Item', itemUpdates);
      updatedEmbeddedItems += itemUpdates.length;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to migrate embedded action effects`, actor?.name, error);
    }
  }

  if (updatedWorldItems || updatedEmbeddedItems) {
    console.info(
      `${MODULE_ID} | Legacy causticPhial effects migration complete`,
      { updatedWorldItems, updatedEmbeddedItems }
    );
  }

  try {
    await world?.setFlag?.(MODULE_ID, 'legacyCausticPhialEffectsMigrated', true);
  } catch (error) {
    console.warn(`${MODULE_ID} | Unable to persist causticPhial migration flag`, error);
  }
}

function patchCrucibleCausticPhialHook() {
  const hook = globalThis.crucible?.api?.hooks?.action?.causticPhial;
  const original = hook?.prepare;
  if (!hook || typeof original !== 'function') return;
  if (original.__emberSafePatched) return;

  const wrapped = function safeCausticPhialPrepare(...args) {
    if (!Array.isArray(this.effects)) this.effects = [];

    const first = this.effects[0];
    if (!first || typeof first !== 'object' || Array.isArray(first)) {
      this.effects[0] = {};
    }

    return original.apply(this, args);
  };

  wrapped.__emberSafePatched = true;
  hook.prepare = wrapped;
}

Hooks.on('preUpdateActor', (_actor, changes) => {
  sanitizeActorUpdatePayload(changes);
});

Hooks.on('preUpdateItem', (_item, changes) => {
  sanitizeItemDataShape(changes);
});

Hooks.on('preCreateItem', (_item, data) => {
  sanitizeItemDataShape(data);
});

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
    emberActions,
  });

  babele.register({
    module: MODULE_ID,
    lang: 'cn',
    dir: 'compendium/cn',
  });
});

// Hook APIs are ready by setup and documents have not finished full preparation yet.
Hooks.once('setup', () => {
  patchCrucibleCausticPhialHook();
  patchActorUpdateDocuments();
  exposeSyncApi();
});

// Run import/migration compatibility once world is ready.
Hooks.once('ready', async () => {
  patchBabeleImportAdventureHook();
  await migrateLegacyDescriptionShape();
  await migrateLegacyCausticPhialEffects();
});