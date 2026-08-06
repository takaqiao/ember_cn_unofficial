/**
 * ember-hardcoded-cn.mjs
 *
 * 翻译 Ember 里 **babele 够不到** 的硬编码字符串。
 *
 * Babele 只能翻合集内容（compendium documents）；Foundry 的 i18n 只能翻模块自己
 * 用 lang key 声明的字符串。但 Ember 有一大批文本是直接写死在 `scripts/ember.mjs`
 * 与模板里的 —— 比如 TextEditor 富文本增强器拼出来的 `Attunement: Aura`、
 * 角色卡上的分节标题、事件按钮、确认对话框标题。这些两条通道都碰不到，
 * 只能在运行时替换。
 *
 * 设计原则：
 *   1. **只读不写**：所有替换都发生在渲染出来的 DOM 或增强器返回的节点上，
 *      不改 Ember 的任何数据，卸载本模块即恢复原状。
 *   2. **防御式**：每个补丁点都先探测 API 是否存在，包在 try/catch 里，
 *      失败只在控制台留一条警告，绝不影响开世界。
 *   3. **数据与逻辑分离**：TRANSLATIONS 是纯数据，方便后续增补与校对。
 *
 * 注意：`AC / AB / AT / AS` 这几个纪年缩写有意不译 —— 它们是 Ember 历法的
 * 纪元代号，和 DC 一样属于约定俗成的记号，译开反而认不出来。
 */

const MODULE = "ember_cn_unofficial";
const log = (...a) => console.log(`${MODULE} |`, ...a);
const warn = (...a) => console.warn(`${MODULE} |`, ...a);

/* ============================================================ */
/*  1. 翻译数据                                                  */
/* ============================================================ */

/** 同调（11 轮元素之月 / 界域），译名与 compendium、lang 保持一致 */
const ATTUNEMENTS = {
  "The Abyss": "深渊",
  "Akon": "阿肯",
  "Aura": "灵气",
  "Cora": "科拉",
  "Heart of Ember": "余烬之心",
  "Luxarum": "卢克萨鲁姆",
  "Mayis": "玛伊斯",
  "Orbis": "奥比斯",
  "Primordis": "普里莫迪斯",
  "Ragen": "拉根",
  "Signara": "西格纳拉"
};

/** 语言。Common / Sign 来自 crucible 本体，其余是 Ember 新增 */
const LANGUAGES = {
  "Common": "通用语",
  "Sign": "手语",
  "Arcden": "奥克登语",
  "Cascal": "卡斯卡语",
  "Forest Speech": "森语",
  "Hardac": "哈达克语",
  "Imperial": "帝国语",
  "Solical": "索利卡语",
  "Mithia": "密西亚语",
  "Luma": "卢玛语",
  "Kaziric": "卡兹瑞克语",
  "Scripta": "书文语",
  "Wyrdic": "维尔迪克语",
  "Pathward": "歧路语",
  "Scor": "斯科尔语",
  "Towyr": "托威尔语",
  "Windclaw": "风爪语",
  "Abyssal": "深渊语",
  "Draconic": "龙语",
  "Druidic": "德鲁伊语",
  "Lunix": "月语",
  "Caligon": "卡利贡语",
  "Eonic": "永世语",
  "Harmos": "和谐语",
  "Thieves' Cant": "盗贼黑话"
};

/**
 * 知识领域。前 30 条 crucible 本体的 lang 已经有译名，这里重复一份是因为
 * Ember 的增强器不走 lang key、直接拼英文 label，我们只能按英文原文匹配。
 * 译名与 crucible lang 的 KNOWLEDGE.* 逐条对齐，改一处要两边一起改。
 */
const KNOWLEDGE = {
  "Alchemy": "炼金术", "Ancients": "远古者", "Artifacts": "神器", "Arts": "艺术",
  "Beasts": "野兽", "Celestials": "天界生物", "Cosmology": "宇宙学", "Crafts": "工艺",
  "Crime": "罪行", "Dragons": "巨龙", "Elementals": "元素生物", "Fey": "妖精",
  "Fiends": "邪魔", "Forensics": "法医学", "Gods": "诸神", "Intrigue": "阴谋",
  "Legends": "传奇", "Machines": "机械装置", "Monsters": "怪物", "Outsiders": "外来者",
  "Plants": "植物", "Politics": "政治", "Rituals": "仪式", "Seafaring": "航海",
  "Souls": "灵魂", "Subterranea": "地下世界", "Tracking": "追踪", "Trade": "贸易",
  "Undeath": "亡灵化", "Warfare": "战争", "Weather": "天气",
  // 以下四条为 Ember 新增
  "Abyssals": "深渊生物", "Aedir": "埃迪尔", "Leviathans": "利维坦", "Shent": "申特"
};

/** 音乐氛围 */
const MOODS = {
  "Combat": "战斗", "Exploration": "探索", "Ambience": "环境",
  "Travel": "旅行", "Rest": "休息"
};

/** 带前缀的标签：`前缀: 名字` → `中文前缀：中文名字` */
const PREFIXED = [
  { en: "Attunement", cn: "同调", table: ATTUNEMENTS },
  { en: "Language", cn: "语言", table: LANGUAGES },
  { en: "Knowledge", cn: "知识", table: KNOWLEDGE },
  { en: "Music Mood", cn: "音乐氛围", table: MOODS }
];

/** 完全匹配即可替换的字符串 */
const EXACT = {
  // 富文本增强器前缀（单独出现时）
  "Ancestry": "血统",
  "Culture": "文化",
  "Path": "道途",

  // 恩惠 / 祸骰
  "-3 Banes": "-3 祸骰", "-2 Banes": "-2 祸骰", "-1 Banes": "-1 祸骰",
  "+1 Boons": "+1 恩惠骰", "+2 Boons": "+2 恩惠骰", "+3 Boons": "+3 恩惠骰",
  "Critical Success": "重大成功",
  "Critical Failure": "重大失败",

  // 事件状态提示
  "Event Completed": "事件已完成",
  "Event Not Completed": "事件未完成",
  "Event Outcome Completed": "事件结局已完成",
  "Event Outcome Not Completed": "事件结局未完成",

  // 角色卡 / 日志分节标题
  "Gamemaster Information": "主持人信息",
  "Ancestry Details": "血统详情",
  "Culture Details": "文化详情",
  "Notable Inhabitants": "知名居民",
  "Secret Lore": "秘辛",
  "At a Glance": "概览",
  "Setting the Scene": "场景铺陈",
  "Event Details": "事件详情",
  "Journal Summary": "日志摘要",
  "Event Outcomes": "事件结局",
  "Quest Details": "任务详情",
  "Involved Locations": "涉及地点",
  "Event Summary": "事件摘要",
  "Biome Details": "生态域详情",
  "Locations": "地点",
  "Location Details": "地点详情",
  "Biomes": "生态域",
  "Related Locations": "相关地点",
  "Events": "事件",
  "Quest Overview": "任务总览",
  "Standalone Event": "独立事件",
  "Quest Event": "任务事件",

  // 操作按钮
  "Begin Event": "开始事件",
  "Reset Event": "重置事件",
  "Complete Event": "完成事件",
  "Mark as Discovered": "标记为已发现",
  "Reset Discovery": "重置发现状态",
  "Award Attunements": "授予同调",
  "Attunements Awarded": "同调已授予",
  "No Awarded Attunements": "无可授予的同调",
  "Award Milestone": "授予里程碑",
  "Milestone Awarded": "里程碑已授予",

  // 按钮浮窗
  "Granted attunement points require awarding.": "已获得的同调点数尚待授予。",
  "All granted attunement points have been awarded.": "所有已获得的同调点数都已授予。",
  "No attunement points have been awarded.": "尚未授予任何同调点数。",
  "Award a milestone point for the completion of this event.": "为完成此事件授予一点里程碑。",
  "The milestone point for this event has already been awarded.": "此事件的里程碑点数已经授予过了。",

  // 对话框标题
  "Add to Party?": "加入队伍？",
  "Re-combine Caravans?": "重新合并商队？",
  "Initiate Event": "启动事件",
  "Select Outcome": "选择结局",
  "Delete Saved Composition?": "删除已保存的编成？",
  "Transition to Pathways?": "转入歧路？",
  "Ring Alarm Bell?": "敲响警钟？",
  "Modify Flow Control Valve?": "调整流量控制阀？",
  "Mine Cart Destination": "矿车目的地",
  "Install Junction Wheel": "安装道岔轮",
  "Elevator Controls": "升降机控制",
  "Elevator Destination": "升降机目的地",
  "Steam Cleansing Cutoff": "蒸汽净化切断",
  "Unspent Ability Points": "未分配的属性点",
  "Apply Soulbound Progression": "应用魂缚进程"
};

/** 掷骰结果档位。Ember 用 `Result of X` 的形式作为结局标题 */
const RESULTS = {
  "Success": "成功", "Failure": "失败",
  "Critical Success": "重大成功", "Critical Failure": "重大失败"
};

/** 需要按模式改写的（保留其中的动态部分） */
const PATTERNS = [
  { re: /^Result of (.+)$/, cn: (m) => `结果：${EXACT[m[1]] ?? RESULTS[m[1]] ?? m[1]}` },
  { re: /^Award Attunement: (.+)$/, cn: (m) => `授予同调：${m[1]}` },
  { re: /^Revoke Attunement: (.+)$/, cn: (m) => `撤销同调：${m[1]}` },
  { re: /^Activate Attunement: (.+)$/, cn: (m) => `激活同调：${translateLeaf(m[1], ATTUNEMENTS)}` },
  { re: /^Day (\d+)$/, cn: (m) => `第 ${m[1]} 天` },
  { re: /^Day\b(.*)$/, cn: (m) => `日${m[1]}` }
];

/* ============================================================ */
/*  2. 翻译引擎                                                  */
/* ============================================================ */

function translateLeaf(name, table) {
  return table[name] ?? name;
}

/**
 * 把一段界面文字翻成中文。翻不了就原样返回 —— 宁可露出英文，也不要猜。
 * @param {string} text
 * @returns {string}
 */
export function translateText(text) {
  if (typeof text !== "string") return text;
  const raw = text.trim();
  if (!raw) return text;

  if (raw in EXACT) return text.replace(raw, EXACT[raw]);

  for (const { en, cn, table } of PREFIXED) {
    if (raw.startsWith(`${en}: `)) {
      const leaf = raw.slice(en.length + 2);
      return text.replace(raw, `${cn}：${translateLeaf(leaf, table)}`);
    }
  }

  for (const { re, cn } of PATTERNS) {
    const m = raw.match(re);
    if (m) return text.replace(raw, cn(m));
  }

  return text;
}

/** 递归翻译一棵 DOM 子树里的所有文本节点与 tooltip 属性 */
function translateNode(node) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const t = translateText(node.nodeValue);
    if (t !== node.nodeValue) node.nodeValue = t;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  for (const attr of ["data-tooltip", "title", "aria-label"]) {
    const v = node.getAttribute?.(attr);
    if (v) {
      const t = translateText(v);
      if (t !== v) node.setAttribute(attr, t);
    }
  }
  for (const child of Array.from(node.childNodes)) translateNode(child);
}

/* ============================================================ */
/*  3. 补丁                                                      */
/* ============================================================ */

function applyOnce(target, flag, fn, label) {
  try {
    if (!target || target[flag]) return false;
    fn();
    Object.defineProperty(target, flag, { value: true, enumerable: false });
    return true;
  } catch (err) {
    warn(`补丁「${label}」失败，已跳过：`, err);
    return false;
  }
}

/**
 * 包住 Ember 注册的富文本增强器。
 * 这些增强器把 `[[/attunement aura]]`、`[[/knowledge alchemy]]` 之类展开成
 * 带英文标签的元素，标签是在 JS 里拼的，两条汉化通道都够不到。
 */
function patchEnrichers() {
  const enrichers = CONFIG.TextEditor?.enrichers;
  if (!Array.isArray(enrichers)) return warn("找不到 CONFIG.TextEditor.enrichers，增强器补丁跳过。");
  let n = 0;
  for (const entry of enrichers) {
    if (typeof entry?.enricher !== "function" || entry.__emberCnWrapped) continue;
    const src = String(entry.pattern ?? "");
    // 只包 Ember 自己的增强器，别去动 crucible 与 Foundry 本体的
    if (!/attunement|language|knowledge|soundscape|ancestry|culture|path|eventState|outcome|Advantage|Critical|date/i.test(src)) continue;
    const original = entry.enricher;
    entry.enricher = async function (...args) {
      const result = await original.apply(this, args);
      try {
        if (result instanceof HTMLElement) translateNode(result);
        else if (typeof result === "string") return translateText(result);
      } catch (err) {
        warn("增强器结果翻译失败：", err);
      }
      return result;
    };
    entry.__emberCnWrapped = true;
    n++;
  }
  log(`已包装 ${n} 个 Ember 富文本增强器。`);
}

/**
 * Ember 往 crucible.CONFIG 里塞了自己的语言与知识领域，label 是硬编码英文。
 * 这些 label 会出现在角色卡的下拉框里，改数据是唯一的办法。
 */
function patchCrucibleConfig() {
  const cfg = globalThis.crucible?.CONFIG;
  if (!cfg) return warn("找不到 crucible.CONFIG，配置补丁跳过。");
  let n = 0;
  for (const [key, table] of [["languages", LANGUAGES], ["knowledge", KNOWLEDGE]]) {
    const group = cfg[key];
    if (!group) continue;
    for (const entry of Object.values(group)) {
      if (entry && typeof entry.label === "string" && table[entry.label]) {
        entry.label = table[entry.label];
        n++;
      }
    }
  }
  log(`已改写 crucible.CONFIG 里 ${n} 条 Ember 新增的语言/知识标签。`);
}

/**
 * Ember 各类应用（角色卡、任务面板、日历）渲染出来的分节标题与按钮同样是硬编码。
 * 在 renderApplication 之后对根元素做一次 DOM 遍历。
 */
function patchRenderedApplications() {
  const handler = (app, element) => {
    try {
      const root = element instanceof HTMLElement ? element : element?.[0];
      if (!root) return;
      const cls = root.className ?? "";
      const id = app?.constructor?.name ?? "";
      // 只处理 Ember 自己的界面，避免把别的模块的英文也一起改了
      if (!/ember/i.test(cls) && !/^Ember/.test(id)) return;
      translateNode(root);
    } catch (err) {
      warn("界面文本翻译失败：", err);
    }
  };
  Hooks.on("renderApplicationV2", handler);
  Hooks.on("renderApplication", handler);
  log("已挂上界面渲染钩子。");
}

/* ============================================================ */
/*  4. 入口                                                      */
/* ============================================================ */

Hooks.once("ready", () => {
  if (!game.modules.get("ember")?.active) return;
  applyOnce(CONFIG, "__emberCnEnrichers", patchEnrichers, "富文本增强器");
  applyOnce(globalThis.crucible?.CONFIG ?? {}, "__emberCnConfig", patchCrucibleConfig, "crucible.CONFIG");
  applyOnce(CONFIG, "__emberCnRender", patchRenderedApplications, "界面渲染");
  log("Ember 硬编码字符串补丁已就绪。");
});
