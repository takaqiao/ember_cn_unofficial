import { DOCUMENT_MAPPINGS, PROJECT_CONVERTERS } from './babele-mappings.js';

/**
 * ember_cn_unofficial — runtime registration and Foundry/Crucible compatibility
 * shims.
 *
 * Requires Babele >= 2.9.1.
 *
 * Removed in this pass, all of it dead under 2.9.1:
 *
 *  - `emberPages` / `emberAdventureJournals` / `emberActions` hand-written
 *    traversal converters. Babele's built-in recursive `document` converter now
 *    walks Adventure -> journals -> pages and Adventure -> actors -> items, and
 *    the custom Ember page subtypes are expressed declaratively instead (see
 *    babele-mappings.js). Crucially, the built-in path also resolves each
 *    embedded item against its ORIGINAL compendium's translation via
 *    `_stats.compendiumSource` — 82% of Ember's actor-embedded item text is
 *    covered for free that way, which a hand-written traversal cannot do.
 *
 *  - The `_tableResults` patch. That converter no longer exists; RollTable
 *    results are handled by `document` + `documentType: "TableResult"`, keyed by
 *    the `range` identity. The patch had been silently doing nothing, which is
 *    exactly why table results were still 0% translated.
 *
 *  - `patchBabeleImportAdventureHook`. Babele 2.9.1's own `importAdventure`
 *    handler reads `token.delta?.name` with optional chaining, so the crash this
 *    worked around cannot occur.
 *
 * Everything below this point is Crucible/Foundry data-shape defence, unrelated
 * to Babele, and is kept as-is.
 */

const MODULE_ID = 'ember_cn_unofficial';

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
  if (!game.modules.get('babele')?.active) return;

  babele.register({
    module: MODULE_ID,
    lang: 'cn',
    dir: 'compendium/cn',
  });

  babele.registerConverters(PROJECT_CONVERTERS);
  babele.registerMapping(DOCUMENT_MAPPINGS);

  console.log(`${MODULE_ID} | 已注册 Babele 翻译源与文档映射`);
});

// Hook APIs are ready by setup and documents have not finished full preparation yet.
Hooks.once('setup', () => {
  patchCrucibleCausticPhialHook();
  patchActorUpdateDocuments();
  exposeSyncApi();
});

// Run import/migration compatibility once world is ready.
Hooks.once('ready', async () => {
  await migrateLegacyDescriptionShape();
  await migrateLegacyCausticPhialEffects();
});