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
 * 上游 Ember 有一批界面串**没有 i18n 键**，直接把英文原文写进了
 * `game.settings.register` 的 name/hint、`game.keybindings.register` 的 name/hint、
 * SceneControl 的 title、以及 `element.dataset.tooltip`。
 * （modules/ember/scripts/ember.mjs 的 lang/en.json 里 grep "SETTINGS|KEYBINDINGS" 命中 0。）
 *
 * 这些串走不了两条常规通道：
 *  - **不能写进 lang/cn.json**：`Localization#loadTranslationFile` 对每份 lang JSON 跑
 *    `expandObject(json)`，带句点的 hint 会被拆成嵌套键而查不到；且无点号的顶层键
 *    会打破发版前 flatten_lang.py 的「cn 键数 == en 键数」三数相等。
 *  - **走不了 DOM 兜底**：SettingsConfig / ControlsConfig / SceneControls 的根 class 既不含
 *    `ember`、类名也不以 `Ember` 开头，被 scripts/ember-hardcoded-cn.mjs 的主闸直接放行掉。
 *
 * 可行的是 JS 侧直接往 `game.i18n.translations` 写**扁平顶层键**：
 * `getProperty`（core common/utils/helpers.mjs:824）第一分支就是 `if (key in object) return object[key]`，
 * 而 `Localization#has` / `#localize`（client/helpers/localization.mjs:391/436）都走 getProperty，
 * 所以带空格、带句点的整句作为顶层键**可以**命中。
 * 渲染点：设置 client/applications/settings/config.mjs:126-127 `_loc(setting.name/hint)`；
 * 按键 client/applications/sidebar/apps/controls-config.mjs:154/158；
 * 场景控件 templates/ui/scene-controls-tools.hbs 的 `{{localize tool.title}}`；
 * data-tooltip 在 client/helpers/interaction/tooltip-manager.mjs:261-263 于**悬浮那一刻**
 * 才 `if (game.i18n.has(text)) _loc(text)` —— 所以它能覆盖「播放/停止」这种渲染后才切换的场合，
 * 反倒比 DOM 替换更稳。
 *
 * ⚠ 顶层键是**全局**的（i18n 表跨包合并），所以写入时一律「别人已定义就让给别人」。
 * 唯一一个泛用词 "Remove" 已实测冲突面为 0（本机 modules/ + systems/ + core client/templates
 * 内 `localize("Remove")` / `data-tooltip="Remove"` 只有 Ember 自己那两处），且它的中译
 * 「移除」对任何调用方都成立，故一并收入。
 */
const EMBER_LITERAL_LABELS = {
  // game.settings.register （ember.mjs:129274-129318，均为 config:true）
  'Gazetteer Location Journal Entries': '地名志地点日志条目',
  'Additional Journal Entries which provide custom gazetteer Location pages that should be added to the Ember environment.':
    '额外的日志条目，为余烬环境提供应当加入的自定义地名志地点页面。',
  'Standalone Event Journal Entries': '独立事件日志条目',
  'Additional Journal Entries which contain Standalone Event pages which should be added to the Ember event engine.':
    '额外的日志条目，其中包含应当加入余烬事件引擎的独立事件页面。',
  'Clock Time Format': '时钟时间格式',
  'The clock format used to display the in-world time of day.': '用于显示世界内当日时刻的时钟格式。',
  'Custom Cursors': '自定义光标',
  'Use custom Ember stylized mouse cursors instead of default browser cursors?':
    '使用余烬风格的自定义鼠标光标，而非浏览器默认光标？',

  // game.keybindings.register （ember.mjs:128565-128578）
  'Flip Vista Placement': '翻转远景放置',
  'When placing an asset in the Vista Configuration screen, flip it horizontally':
    '在远景配置界面中放置素材时，将其水平翻转',
  'Lock Vista Placement Elevation': '锁定远景放置高度',
  'When placing an asset in the Vista Configuration screen, lock its elevation so it can be moved vertically.':
    '在远景配置界面中放置素材时锁定其高度，使其可以垂直移动。',

  // SceneControl tool title （ember.mjs:113456，YakoshtaMine 的矿车轨道图例）
  'Show Tracks': '显示轨道',

  // element.dataset.tooltip （ember.mjs:23743 / :51000 / :51003 / :107706 / :114171）
  'Add Hex': '添加六边格',
  'Stop Animation': '停止动画',
  'Play Animation': '播放动画',
  'Remove': '移除',
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
    // ⚠ mergeObject 的 `inplace` 默认是 **true**：原先写法会就地改掉传进来的那个对象。
    // 这个函数同时服务三条链路 —— preUpdateItem 的 changes 载荷、冒险导入的 item 载荷、
    // 以及世界迁移里读出来的 `_source.system.actions` —— 后者是文档的**落库原值对象**，
    // 就地改它等于绕过 update 直接篡改内存里的源数据（且不落库、不触发任何钩子）。
    // 一律返回新对象，让调用方通过 update / setProperty 显式写回。
    return foundry.utils.mergeObject(action, patch, { inplace: false });
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

/**
 * 判断当前这次 Actor.updateDocuments 是否发生在冒险导入流程里。
 *
 * ⚠ 唯一有效的判据就是 `Adventure.importContent` 这一帧：
 * core client/documents/adventure.mjs:165 的 `importContent()` **在自己的帧里**直接
 * `await cls.updateDocuments(updateData, options)`（:195），所以栈里必然出现它。
 * 上游若把那次 updateDocuments 挪进 helper，本兜底即失效 —— 那时要改判据，不是加分支。
 *
 * 原先还 `|| stack.includes('EmberAdventureImporter._processSubmitData')`，那是**恒假**：
 * modules/ember/scripts/ember.mjs:24012 的 `class EmberAdventureImporter` 里根本没有
 * `_processSubmitData`（该方法只出现在 :24005 与 :36801，分属另外两个类），
 * V8 永远产不出这个帧名。留着只会让人误以为还有第二道备份，故删除。
 */
function isAdventureImportInvocation() {
  const stack = String(new Error().stack ?? '');
  return stack.includes('Adventure.importContent');
}

function prepareSafeActorUpdatesForImport(updates) {
  if (!Array.isArray(updates)) return updates;
  return updates.map((update) => degradeActorUpdatePayload(update));
}

/**
 * `globalThis.emberCN.syncOwnedItems()` 的实现，转发给 crucible 自己的同名 API。
 *
 * ⚠ 默认值**必须**与上游一致（crucible-compiled.mjs:48163
 * `{force=false, reload=true, talents=true, spells=true, equipment=false}`）。
 * 这里原先写的是 `force = true, reload = false`，两处都翻了：
 *  - `force=true` 让 :48183 的 `force || isNewerVersion(...)` 恒真 ⇒ `game.actors` 全量进入同步；
 *    而 :48211 的 updateItems 用的是 `{diff:false, recursive:false}`（**整体替换**语义），
 *    等于把本来就是最新的 actor 的天赋 / 标志性法术的本地改动，用合集原版盖掉。
 *  - `reload=false` 又跳过 :48227 的 `debouncedReload()`，而上游把 reload 默认设 true
 *    正是因为整体替换之后客户端状态会不一致。两个翻转互相冲突。
 * 需要强制重拉时由调用方显式传参：`emberCN.syncOwnedItems({ force: true })`。
 */
async function syncCrucibleOwnedItems({ force = false, reload = true, talents = true, spells = true } = {}) {
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

/**
 * 读**落库原值**（`_source.system.actions`）而不是准备后的 `item.system.actions`。
 * 与同文件 :120/:135/:151 的描述迁移口径一致。两个理由：
 *
 * 1) `system.actions` 是 `ArrayField(CrucibleActionField)`，而 `CrucibleActionField extends
 *    EmbeddedDataField`（crucible module/models/fields.mjs:11），准备后拿到的是 CrucibleAction
 *    **实例**；把实例塞回 `item.update()`，clean 阶段 `EmbeddedDataField._cast()` 会先
 *    `value.toObject()`，我们打的补丁被丢掉、diff 恒空 —— 写不进去还照样计数成功。
 * 2) 更要命的是 `CruciblePhysicalItem#prepareAffixActions()`（crucible module/models/item-physical.mjs:225-239）
 *    在准备阶段把**词缀提供的 action** `this.actions.push(action)` 进了准备结果里。
 *    把准备结果当源写回，等于把词缀 action 永久烙进物品的 `system.actions`；
 *    下次准备时 :230-234 会以「与物品级 action 冲突」为由把词缀那份丢掉并告警。
 */
async function migrateLegacyCausticPhialEffects() {
  if (!game.user?.isGM) return;

  // causticPhial 是 crucible 的 action。Ember 同时支持 crucible 与 dnd5e，
  // 没有这道闸的话，dnd5e 世界每次开世界也要把 game.items + 每个 actor 的物品全遍历一遍。
  if (game.system?.id !== 'crucible') return;

  // 同上：game.world 没有 flag API，原守卫恒空。改用 game.settings。
  if (game.settings.get(MODULE_ID, MIGRATION_SETTINGS.legacyCausticPhial)) return;

  let scannedItems = 0;
  let updatedWorldItems = 0;
  let updatedEmbeddedItems = 0;
  let failed = false;

  for (const item of game.items ?? []) {
    const actions = foundry.utils.getProperty(item, '_source.system.actions');
    if (!Array.isArray(actions)) continue;
    scannedItems += 1;

    const sanitized = sanitizeActionEffects(actions);
    if (sanitized === actions) continue;

    try {
      // update() 返回 undefined 表示这次没有任何文档真的落库（diff 为空）。
      // 原先无条件 +1，写没写进去都会打印 "migration complete"，是谎报。
      const updated = await item.update({ 'system.actions': sanitized });
      if (updated) updatedWorldItems += 1;
    } catch (error) {
      failed = true;
      console.warn(`${MODULE_ID} | Failed to migrate world item action effects`, item?.name, error);
    }
  }

  for (const actor of game.actors ?? []) {
    const itemUpdates = [];
    for (const item of actor.items ?? []) {
      const actions = foundry.utils.getProperty(item, '_source.system.actions');
      if (!Array.isArray(actions)) continue;
      scannedItems += 1;

      const sanitized = sanitizeActionEffects(actions);
      if (sanitized === actions) continue;

      itemUpdates.push({
        _id: item.id,
        'system.actions': sanitized,
      });
    }

    if (!itemUpdates.length) continue;

    try {
      const updated = await actor.updateEmbeddedDocuments('Item', itemUpdates);
      updatedEmbeddedItems += Array.isArray(updated) ? updated.length : 0;
    } catch (error) {
      failed = true;
      console.warn(`${MODULE_ID} | Failed to migrate embedded action effects`, actor?.name, error);
    }
  }

  // 无条件留一条计数日志：否则「跑没跑、扫了几条、改了几条」永远没有信号。
  console.debug(
    `${MODULE_ID} | causticPhial migration scan`,
    { scannedItems, updatedWorldItems, updatedEmbeddedItems, failed }
  );

  if (updatedWorldItems || updatedEmbeddedItems) {
    console.info(
      `${MODULE_ID} | Legacy causticPhial effects migration complete`,
      { updatedWorldItems, updatedEmbeddedItems }
    );
  }

  // 有任何一条失败就**不**置位，留着下次开世界重试；
  // 否则一次偶发失败会把这张安全网永久关掉。
  if (failed) {
    console.warn(`${MODULE_ID} | causticPhial 迁移有条目失败，本次不置一次性标记，下次开世界会重试`);
    return;
  }

  try {
    await game.settings.set(MODULE_ID, MIGRATION_SETTINGS.legacyCausticPhial, true);
  } catch (error) {
    console.warn(`${MODULE_ID} | Unable to persist causticPhial migration flag`, error);
  }
}

/**
 * 给 crucible 的 causticPhial `prepare` 钩子加一层防崩：上游
 * crucible-compiled.mjs:8964-8975 直接 `mergeObject(this.effects[0], corroding)`，
 * effects[0] 缺失就抛。
 *
 * ⚠ **必须在 `init` 阶段打**，不能等 `setup`：
 *  - core client/game.mjs:718 `setupGame()` 的顺序是 :730 `initializeDocuments()`
 *    → :740 `Hooks.callAll("setup")`，而 initializeDocuments() 里明写
 *    「Prepare data for all world documents」并对每个文档跑 `_safePrepareData()`；
 *  - CrucibleAction 在 `_initialize()`（crucible-compiled.mjs:19011-19024）里就把
 *    `crucible.api.hooks.action[id]` 的函数拷进一个 `Object.freeze` 的快照
 *    （`#prepareHooks`，:19047-19056），之后 `_callActionHooks` 取的一直是那份快照。
 * 也就是说 setup 时所有 actor 上的 causticPhial action 早已构造并跑过**原始** prepare，
 * 正是这个补丁想保护的那一轮。
 *
 * 在 init 里打是安全的：crucible 的 `crucible.api = {...}` 就建在它自己的 init 监听器里
 * （crucible-compiled.mjs:47205 / :47219），而系统的 esmodule 先于模块的 esmodule 加载
 * （core dist/server/views/view.mjs 里系统 module 优先级 6、普通模块 8），
 * 所以系统的 init 监听器先注册、先触发。
 */
function patchCrucibleCausticPhialHook() {
  const hook = globalThis.crucible?.api?.hooks?.action?.causticPhial;
  const original = hook?.prepare;
  if (!hook || typeof original !== 'function') {
    // 只在 crucible 世界里才算异常；dnd5e 世界下本来就没有这个钩子，不该刷告警。
    if (game.system?.id === 'crucible') {
      console.warn(
        `${MODULE_ID} | 未能给 crucible 的 causticPhial prepare 钩子打补丁（钩子不存在或形状已变），运行时防崩未生效`
      );
    }
    return;
  }
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

// i18nInit 由 Localization#initialize 在 `init` 钩子**之前**触发
// （core client/helpers/localization.mjs:104），而设置 / 按键 / 场景控件的 name·hint·title
// 都是**渲染时**才 localize 的，所以在这里补表足够早。
Hooks.once('i18nInit', () => {
  const translations = game.i18n?.translations;
  if (!translations) return;

  for (const [key, value] of Object.entries(EMBER_LITERAL_LABELS)) {
    // 顶层键是全局的：别人已经定义过就让给别人，宁可露英文也不顶掉。
    if (typeof translations[key] === 'string') continue;
    translations[key] = value;
  }
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

// 两个迁移的「只跑一次」状态位。必须在 ready（迁移执行）之前注册，放 init 最稳。
//
// ⚠ 原先这里写着 "Hook APIs are ready by setup and documents have not finished full
// preparation yet."，与 v14 源码**正相反**：client/game.mjs:718 `setupGame()` 里
// :730 `initializeDocuments()`（内部对每个世界文档跑 `_safePrepareData()`）跑完之后
// 才在 :740 `Hooks.callAll("setup")`。所以 causticPhial 的钩子补丁挪到了这里，
// 详见 patchCrucibleCausticPhialHook 上方的说明。
Hooks.once('init', () => {
  for (const key of Object.values(MIGRATION_SETTINGS)) {
    game.settings.register(MODULE_ID, key, {
      scope: 'world',
      config: false,
      type: Boolean,
      default: false,
    });
  }

  patchCrucibleCausticPhialHook();
});

// patchActorUpdateDocuments 依赖 CONFIG.Actor.documentClass 已被系统改写完毕，
// exposeSyncApi 只是挂全局对象，两者留在 setup 不动。
Hooks.once('setup', () => {
  patchActorUpdateDocuments();
  exposeSyncApi();
});

// Run import/migration compatibility once world is ready.
Hooks.once('ready', async () => {
  await migrateLegacyDescriptionShape();
  await migrateLegacyCausticPhialEffects();
});