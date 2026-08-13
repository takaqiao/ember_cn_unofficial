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
const MIGRATION_SETTINGS = {
  legacyDescription: 'legacyDescriptionMigrated',
  legacyCausticPhial: 'legacyCausticPhialMigrated',
};

/**
 * ⚠ crucible 的 `system.description` 是**多态**的，不能靠「值是不是字符串」来判断形状。
 *
 * crucible 0.10.1 里只有 `CruciblePhysicalItem` 的 description 是
 * `SchemaField{public, private}`；talent / spell / ancestry / archetype / background /
 * taxonomy / loot / schematic / spellcraftRune / spellcraftGesture 这**十类**都是裸
 * `HTMLField`（即普通字符串，`HTMLField extends StringField`）。
 *
 * 早先这里用 `typeof description === 'string'` 当「旧版脏数据」的判据，等于把这十类的
 * **当前正确形状**当成需要修的目标：转成对象后交给 `StringField._cast()` → `String(value)`
 * → 落库变成字面量 `"[object Object]"`，描述原文永久丢失，且不抛错不提示。
 *
 * 唯一可靠的判据是**问 schema 本身**。
 *
 * @param {object} doc  一个 Document 实例，或 `{type}` 形态的原始数据
 * @returns {boolean}   该文档的 system.description 是否真的是 SchemaField{public,private}
 */
function descriptionExpectsObject(doc) {
  if (!doc) return false;

  // 1) 有实例：直接问它自己的 schema
  let field = doc?.system?.schema?.fields?.description;

  // 2) 只有原始数据（如冒险导入的 item 载荷）：按 type 查 CONFIG 里注册的数据模型
  if (!field && typeof doc.type === 'string') {
    const model = globalThis.CONFIG?.Item?.dataModels?.[doc.type];
    field = model?.schema?.fields?.description;
  }

  if (!field) return false;

  const SchemaField = foundry?.data?.fields?.SchemaField;
  if (SchemaField && field instanceof SchemaField) return true;

  // 跨 realm 时 instanceof 可能失效，退化为鸭子判断：它得真的有 public 子字段
  return !!field?.fields?.public;
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

  // ⚠ `game.world` 是 `foundry.packages.World`（DataModel），**不是 Document**，
  // 没有 getFlag/setFlag。原先写的 `world?.getFlag?.(...)` 被可选调用静默吞成 undefined，
  // 守卫恒不成立、写回也恒空操作 —— 这个「只跑一次」的迁移其实每次开世界都在跑。
  // 改用 game.settings（world scope）。
  if (game.settings.get(MODULE_ID, MIGRATION_SETTINGS.legacyDescription)) return;

  let updatedWorldItems = 0;
  let updatedActors = 0;
  let updatedEmbeddedItems = 0;

  // 读 **_source**（落库原值）而不是 item.system（已 prepare 的值）：
  // 对 SchemaField 类型的物品，prepare 之后永远是对象，旧版留下的字符串在这里根本看不见 ——
  // 原先读 prepared 值，导致真目标一个也命不中，只误伤本来就正确的那十类。
  for (const item of game.items ?? []) {
    if (!descriptionExpectsObject(item)) continue;
    const description = foundry.utils.getProperty(item, '_source.system.description');
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
    if (descriptionExpectsObject(actor)) {
      const actorDescription = foundry.utils.getProperty(actor, '_source.system.description');
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
    }

    const itemUpdates = [];
    for (const item of actor.items ?? []) {
      if (!descriptionExpectsObject(item)) continue;
      const description = foundry.utils.getProperty(item, '_source.system.description');
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
    await game.settings.set(MODULE_ID, MIGRATION_SETTINGS.legacyDescription, true);
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

/**
 * @param {object} itemData  待改写的载荷（update 的 changes，或导入时的 item 原始数据）
 * @param {object} [doc]     该载荷对应的 Item 文档实例（有就传，用于问 schema）
 */
function sanitizeItemDataShape(itemData, doc) {
  if (!itemData || typeof itemData !== 'object' || Array.isArray(itemData)) return itemData;

  const patch = {};

  const embeddedEffects = sanitizeEmbeddedCollectionArray(itemData.effects);
  if (embeddedEffects !== itemData.effects) {
    patch.effects = embeddedEffects;
  }

  // ⚠ 只有当目标的 schema 真的要求 {public, private} 时才转（见 descriptionExpectsObject）。
  // 拿不到实例就退回用载荷自带的 type 查数据模型；两者都问不出来就**不动** ——
  // 宁可漏修也不能把十类合法的字符串描述写成 "[object Object]"。
  const description = foundry.utils.getProperty(itemData, 'system.description');
  if (typeof description === 'string' && descriptionExpectsObject(doc ?? itemData)) {
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

    // ⚠ 这里**必须**用完整载荷做第一次尝试。
    // 原先写的是 `importMode ? prepareSafeActorUpdatesForImport(sanitized) : sanitized`，
    // 即只要栈里有 Adventure.importContent 就**无条件**把每个 actor 的 items/effects 删掉再提交
    // —— 降级被前置到了 happy path 上，而不是像注释说的那样只在出错时兜底。
    // 后果：世界里已存在的 actor 在重导入时走 toUpdate，其内嵌 items/effects 永远不会被刷新。
    // Ember 的怪物战斗块、天赋、装备全是内嵌 item，等于把上游推送更新的通道关死了一半，且无任何提示。
    try {
      return await original.call(this, sanitized, ...args);
    } catch (error) {
      if (!isKnownUpdateDiffError(error) || !importMode) throw error;

      // 导入专用兜底：逐个 actor 隔离，让某一个 actor 的畸形内嵌数据不至于中断整场导入。
      const results = [];
      for (const update of sanitized) {
        // 先用完整载荷单独重试 —— 绝大多数 actor 在这一步就成功了，items/effects 完整保留
        try {
          const part = await original.call(this, [update], ...args);
          if (Array.isArray(part)) results.push(...part);
          continue;
        } catch (singleError) {
          if (!isKnownUpdateDiffError(singleError)) throw singleError;
        }

        const actorId = update?._id ?? 'unknown';

        // 最后手段：只对**确实失败的那一个** actor 降级（丢掉内嵌集合），并明确告警。
        // 降级从「全体默认」收窄成「个别兜底」，是这次修复的要点。
        try {
          const part = await original.call(this, [degradeActorUpdatePayload(update)], ...args);
          if (Array.isArray(part)) results.push(...part);
          console.warn(
            `${MODULE_ID} | 该 actor 的内嵌 items/effects 无法更新，已降级导入以免中断整场导入`,
            actorId
          );
          continue;
        } catch (degradedError) {
          if (!isKnownUpdateDiffError(degradedError)) throw degradedError;
        }

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

  // 同上：game.world 没有 flag API，原守卫恒空。改用 game.settings。
  if (game.settings.get(MODULE_ID, MIGRATION_SETTINGS.legacyCausticPhial)) return;

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
    await game.settings.set(MODULE_ID, MIGRATION_SETTINGS.legacyCausticPhial, true);
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

Hooks.on('preUpdateItem', (item, changes) => {
  // 把文档实例传进去，才能问它的 schema 判断 description 到底该是什么形状
  sanitizeItemDataShape(changes, item);
});

// ⚠ v10 起 preCreate 钩子里改第二个参数 data 是**无效**的：
// client-backend.mjs 早在钩子之前就用 deepClone(createData) 把文档构造好了，
// 真正下发的是那个已构造的 doc，不是 createData。要在这里改数据必须用 doc.updateSource()。
// 这一处原本就是死代码；现在 description 判据已收紧，即便改活也不会再误伤，
// 但既然它本来什么也没做，就保持不做，避免在创建路径上引入新的行为。
Hooks.on('preCreateItem', (item, data) => {
  const effects = sanitizeEmbeddedCollectionArray(data?.effects);
  if (effects !== data?.effects) item?.updateSource?.({ effects });
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
// 两个迁移的「只跑一次」状态位。必须在 ready（迁移执行）之前注册，放 init 最稳。
Hooks.once('init', () => {
  for (const key of Object.values(MIGRATION_SETTINGS)) {
    game.settings.register(MODULE_ID, key, {
      scope: 'world',
      config: false,
      type: Boolean,
      default: false,
    });
  }
});

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