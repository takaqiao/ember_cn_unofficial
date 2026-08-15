/**
 * 汉化自检控制面板（Ember / Crucible 两个汉化模块共用）
 * ===================================================
 *
 * 为什么要有它
 * ------------
 * 「控制台不报错」只说明没崩，**说明不了译文有没有真的用上**。本项目最贵的几次翻车都是
 * 静默的：上游改了一句措辞，硬编码表里的键就再也匹配不上，界面照旧显示英文，
 * 而日志一声不响（第十六轮离线查出过 **31 个键在当时的上游上根本不生效**）。
 *
 * 所以这个面板的设计原则只有一条：
 *
 *   ⚠⚠ **「0 个问题」和「没查到东西」必须分开显示。**
 *
 * 每一档都会报「本次查了多少项」。查不到东西就明说「无从查起」，绝不显示成绿色。
 * 这条原则是从本项目**六种判据空转形态**里换来的：
 *   (a) 判据自己的正则被转义吃掉  (b) 判据压根不读库  (c) 判据读的是旧报告快照
 *   (d) 闸在跑但豁免表已经空了    (e) 输入缺失但判据照跑  (f) 正则失效而主闸照样全绿
 * 六种的共同点都是**报绿**，所以「绿」这个信号本身必须带上「我查了多少」才有意义。
 *
 * 怎么用
 * ------
 * 「配置设置 → 模块设置 → Ember 汉化 → 打开汉化自检面板」。
 * 面板里有「复制报告」，出的是 markdown，可以直接贴给维护者。
 *
 * 各档在查什么
 * ------------
 *  A 环境      两个汉化模块与其上游的版本、Babele、以及 foundry_chn（它决定 Token 的定译）
 *  B Babele    译文文件有没有真的被 babele 认到；**并抽样看合集索引里的名字是不是中文**
 *  C i18n      lang/cn.json 的键在 game.i18n 里取不取得到
 *  D 键活性 ⭐  把硬编码表的每个键拿去**当前安装的上游源码**里核 —— 上游一改措辞就能立刻看出来
 *  E 补丁      运行时补丁装没装上（读 CONFIG 上的幂等标记 + 抽查被改对象的真实值）
 *  F 注入子树  DOM 选择器现在选不选得到（界面没开时报「当前不可见」，不算失败）
 *  G 译文体检  抽样查已废写法有没有回潮（令牌 / 六角格 / 空心之月 …）
 *  H 已知豁免  **故意**留英的东西，免得把有意为之的当 bug
 */

const MOD_ID = "ember_cn_unofficial";
const CRUCIBLE_MOD_ID = "crucible-cn";

/* -------------------------------------------- */
/*  结果模型                                     */
/* -------------------------------------------- */

/**
 * 一条检查的结果。
 * @property {"ok"|"warn"|"fail"|"skip"} status
 *   - ok   查过了，没问题
 *   - warn 有情况，但不一定是缺陷（例如界面没开、上游没这个东西）
 *   - fail 确定的问题
 *   - skip **无从查起** —— 前提不满足，这一项这次根本没查。⚠ 绝不显示成绿色。
 * @property {number} checked 本次实际检查了多少项。**skip 之外的每一条都必须给。**
 */
class Check {
  constructor(section, name, status, checked, detail, items = []) {
    Object.assign(this, { section, name, status, checked, detail, items });
  }
  static ok(s, n, c, d, i) { return new Check(s, n, "ok", c, d, i); }
  static warn(s, n, c, d, i) { return new Check(s, n, "warn", c, d, i); }
  static fail(s, n, c, d, i) { return new Check(s, n, "fail", c, d, i); }
  /** 无从查起：前提不满足。**不是「没问题」。** */
  static skip(s, n, why) { return new Check(s, n, "skip", 0, why, []); }
}

const ICON = { ok: "✅", warn: "⚠️", fail: "❌", skip: "⛔" };
const LABEL = { ok: "通过", warn: "注意", fail: "失败", skip: "无从查起" };

/* -------------------------------------------- */
/*  小工具                                       */
/* -------------------------------------------- */

const CJK = /[一-鿿]/;
const hasCJK = (s) => typeof s === "string" && CJK.test(s);

function mod(id) { return game.modules.get(id); }
function modActive(id) { return !!mod(id)?.active; }

/** 取模块/系统版本，取不到返回 null（**不要返回 "未知" 之类的字符串**，那会掩盖「没查到」）。 */
function versionOf(id, kind = "module") {
  const o = kind === "system" ? (game.system?.id === id ? game.system : null) : mod(id);
  return o?.version ?? null;
}

/**
 * 抓取当前安装的上游源码，用来做键活性检查。
 * ⚠ 抓不到时返回 null —— 调用方必须据此报 skip（无从查起），**不能当成「键都还在」**。
 */
async function fetchText(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch (_) {
    return null;
  }
}

/** 把一段文本编成「出现过哪些字面量」的快速查询集合。上游源码几 MB，逐键 indexOf 太慢。 */
function makeCorpus(text) {
  return {
    text,
    has(s) { return typeof s === "string" && s.length > 0 && this.text.includes(s); }
  };
}

/* -------------------------------------------- */
/*  A · 环境                                     */
/* -------------------------------------------- */

function checkEnvironment() {
  const out = [];
  const S = "A 环境";

  // 两个汉化模块自身
  for (const [id, label] of [[MOD_ID, "Ember 汉化"], [CRUCIBLE_MOD_ID, "Crucible 汉化"]]) {
    const m = mod(id);
    if (!m) { out.push(Check.warn(S, `${label}（${id}）`, 1, "未安装")); continue; }
    out.push(m.active
      ? Check.ok(S, `${label} v${m.version}`, 1, "已启用")
      : Check.fail(S, `${label} v${m.version}`, 1, "**已安装但未启用** —— 译文不会生效"));
  }

  // Babele：本项目全部合集译文都走它
  const babele = mod("babele");
  if (!babele?.active) {
    out.push(Check.fail(S, "Babele", 1,
      "**未启用** —— 合集译文（journal / actor / item 等）全部不会生效，只有界面字符串还在"));
  } else {
    const v = babele.version ?? "";
    const okVer = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
    const good = okVer && (+okVer[1] > 2 || (+okVer[1] === 2 && +okVer[2] >= 9));
    out.push(good
      ? Check.ok(S, `Babele v${v}`, 1, "已启用，版本满足要求（≥ 2.9.1）")
      : Check.warn(S, `Babele v${v}`, 1, "版本低于 2.9.1，`registerMapping` / 源包回退可能不完整"));
  }

  // 上游
  const emberV = versionOf("ember");
  out.push(emberV
    ? Check.ok(S, `上游 Ember v${emberV}`, 1, "已安装")
    : Check.skip(S, "上游 Ember", "未安装或未启用 —— 本模块的绝大多数检查都无从查起"));

  const sysV = game.system?.version ?? null;
  out.push(Check.ok(S, `当前系统 ${game.system?.id} v${sysV}`, 1,
    game.system?.id === "crucible" ? "Crucible 侧译文与补丁生效"
      : "非 crucible 系统 —— crucible 专属的表与补丁按设计不生效（不是缺陷）"));

  // foundry_chn 决定 Token 的定译（本项目据此把 Token 统一为「指示物」）
  const chn = mod("foundry_chn");
  out.push(chn?.active
    ? Check.ok(S, "foundry_chn 核心中文包", 1,
        "已启用 —— 本项目的 `Token`＝**指示物** 正是与它对齐的（该包 TOKEN 相关键 指示物 53 : 令牌 0）")
    : Check.warn(S, "foundry_chn 核心中文包", 1,
        "未启用 —— 界面里 Foundry 自身的词条会是英文，正文里的「指示物」会与之对不上（**不是本模块的缺陷**）"));

  return out;
}

/* -------------------------------------------- */
/*  B · Babele 通道                              */
/* -------------------------------------------- */

function checkBabele() {
  const S = "B Babele 通道";
  if (!modActive("babele")) return [Check.skip(S, "整档", "Babele 未启用，合集译文通道无从查起")];

  const out = [];
  const babele = game.babele;
  if (!babele) return [Check.skip(S, "整档", "`game.babele` 不存在（Babele 尚未初始化？）")];

  const packs = [...game.packs].filter(p => {
    const src = p.metadata?.packageName ?? p.metadata?.package;
    return src === "ember" || src === "crucible";
  });

  // 已认到译文的合集数。
  // ⚠⚠ **别读 `babele.translations`** —— 那个属性根本不存在，读到 undefined 就会报
  //   「一份都没认到」。2026-08-16 首次真实世界自检当场撞到这个自相矛盾：
  //   同一份报告里「合集索引抽样 137/137 全中文」明摆着说明 babele 在工作，
  //   而这一行却是红的 —— **判据自己错了，不是库错了**。
  //   Babele 的公开 API 是 `isTranslated(pack)`（babele.js:557）。
  //   教训：**写「检查 X 有没有生效」的判据时，先确认自己读的属性真的存在** ——
  //   一个读了 undefined 就报红的检查，制造的是假警报，比不检查更糟。
  if (typeof babele.isTranslated !== "function") {
    out.push(Check.skip(S, "已认到译文的合集",
      "这个版本的 Babele 没有 `isTranslated()` —— API 变了，本项无从查起"));
  } else if (!packs.length) {
    out.push(Check.skip(S, "已认到译文的合集", "当前世界里没有 ember / crucible 的合集"));
  } else {
    const yes = packs.filter(p => { try { return babele.isTranslated(p); } catch (_) { return false; } });
    out.push(yes.length
      ? Check.ok(S, "已认到译文的合集", packs.length, `${yes.length}/${packs.length} 个合集有对应译文文件`)
      : Check.fail(S, "已认到译文的合集", packs.length,
          `**${packs.length} 个合集一个都没认到译文** —— 合集会全是英文`));
  }

  if (!packs.length) {
    out.push(Check.skip(S, "合集索引抽样", "当前世界里没有 ember / crucible 的合集"));
    return out;
  }

  let sampled = 0, cn = 0;
  const badPacks = [];
  for (const p of packs) {
    const idx = [...(p.index ?? [])];
    if (!idx.length) continue;
    const take = idx.slice(0, 8);
    let packCn = 0;
    for (const e of take) { sampled++; if (hasCJK(e.name)) { cn++; packCn++; } }
    if (take.length && packCn === 0) badPacks.push(`${p.metadata?.label ?? p.collection}（抽 ${take.length} 条无一中文）`);
  }

  if (!sampled) {
    out.push(Check.skip(S, "合集索引抽样", "所有合集的索引都是空的（还没加载？）"));
  } else if (badPacks.length) {
    out.push(Check.fail(S, "合集索引抽样", sampled,
      `抽 ${sampled} 条、中文 ${cn} 条。**下列合集一条中文都没有**：`, badPacks));
  } else {
    out.push(Check.ok(S, "合集索引抽样", sampled,
      `抽 ${sampled} 条，中文 ${cn} 条（${Math.round(cn / sampled * 100)}%）。` +
      `⚠ 非 100% 不一定是缺陷 —— 有些条目按约定保留英文原名。`));
  }
  return out;
}

/* -------------------------------------------- */
/*  C · i18n 通道                                */
/* -------------------------------------------- */

/** 抽验的关键键：都是本项目**裁决过**的，值错了说明译文没跟上裁决。 */
const I18N_PROBES = [
  ["EMBER.CALENDAR.REGION", "地区地图", "Region Map＝地区地图（与 Area Map＝区域地图 三分之一）"],
  ["SPELL.INFLECTIONS.Aura", "奥拉", "Ember 的月亮/同调/屈折 Aura＝奥拉（Crucible 的手势/目标类型才是灵气）"],
];

function checkI18n() {
  const S = "C i18n 通道";
  const out = [];
  const table = game.i18n?.translations ?? {};
  const keyCount = Object.keys(table).length;
  if (!keyCount) return [Check.skip(S, "整档", "`game.i18n.translations` 是空的")];

  out.push(Check.ok(S, "i18n 表已加载", keyCount, `顶层键 ${keyCount} 个`));

  let checked = 0;
  const bad = [];
  for (const [key, want, why] of I18N_PROBES) {
    const got = game.i18n.localize(key);
    if (got === key) continue;          // 该键在当前世界不存在（例如没装 ember），不算错
    checked++;
    if (!got.includes(want)) bad.push(`\`${key}\` = 「${got}」，应含「${want}」 —— ${why}`);
  }
  if (!checked) {
    out.push(Check.skip(S, "裁决键抽验", "探针里的键在当前世界一个都不存在（相关模块没装？）"));
  } else {
    out.push(bad.length
      ? Check.fail(S, "裁决键抽验", checked, `查 ${checked} 条，**${bad.length} 条与裁决不符**：`, bad)
      : Check.ok(S, "裁决键抽验", checked, `查 ${checked} 条，全部符合既定裁决`));
  }
  return out;
}

/* -------------------------------------------- */
/*  E · 运行时补丁                                */
/* -------------------------------------------- */

/** 补丁在 CONFIG 上留下的幂等标记 → 人话名字。与 ember-hardcoded-cn.mjs 的 ready 钩子一一对应。 */
const PATCH_FLAGS = [
  ["__emberCnEnrichers", "富文本增强器"],
  ["__emberCnConfig", "crucible.CONFIG"],
  ["__emberCnCoreConfig", "core CONFIG"],
  ["__emberCnMoons", "月亮名"],
  ["__emberCnWeather", "天气档位名"],
  ["__emberCnDayFormat", "历法日期格式"],
  ["__emberCnNotifications", "通知提示语"],
  ["__emberCnScrollingText", "画布滚动文字"],
  ["__emberCnRegionBehaviors", "区域行为配置表单"],
  ["__emberCnVistaPlacement", "远景摆放配置表单"],
  ["__emberCnProseMirror", "ProseMirror 模板块菜单"],
  ["__emberCnChatKeys", "聊天卡复合键"],
  ["__emberCnRender", "界面渲染"],
];

function checkPatches() {
  const S = "E 运行时补丁";
  if (!modActive("ember")) return [Check.skip(S, "整档", "上游 Ember 未启用，补丁按设计不会装")];

  const out = [];
  const applied = [], missing = [];
  for (const [flag, name] of PATCH_FLAGS) (CONFIG[flag] ? applied : missing).push(name);

  out.push(missing.length
    ? Check.fail(S, "补丁装载", PATCH_FLAGS.length,
        `${applied.length}/${PATCH_FLAGS.length} 已装。**下列没装上**（多半是它自己 try/catch 吞掉了异常，翻控制台找「补丁「…」失败」）：`,
        missing)
    : Check.ok(S, "补丁装载", PATCH_FLAGS.length, `${applied.length}/${PATCH_FLAGS.length} 全部已装`));

  // ⚠ 光看标记不够 —— 标记只说明「跑过」，不说明「改成中文了」。抽查被改对象的真实值。
  const spot = [];
  let spotChecked = 0;

  // 区域行为 schema
  // ⚠⚠ 两条边界，2026-08-16 首次真实世界自检时这里报了 5 条**假警报**，两条都踩了：
  //   ① **只查 Ember 自己的子类型（`ember.*`）**。core 的 `executeMacro` / `executeScript` /
  //      `toggleBehavior` / `displayScrollingText` 不归我们翻，它们是英文**本来就对**。
  //   ② **i18n 键不算「仍是英文」**。core 的字段 label 常常是 `BEHAVIOR.TYPES.base.FIELDS.events.label`
  //      这种键，Foundry 渲染时才本地化 —— 把它判成「没翻译」是**看错了对象**。
  const I18N_KEY = /^[A-Z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/;
  try {
    const dm = CONFIG.RegionBehavior?.dataModels ?? {};
    for (const [type, cls] of Object.entries(dm)) {
      if (!type.startsWith("ember.")) continue;          // ← 边界 ①
      const fields = cls?.schema?.fields ?? {};
      for (const f of Object.values(fields)) {
        const lab = f?.label;
        if (typeof lab !== "string" || !lab) continue;
        if (I18N_KEY.test(lab)) continue;                // ← 边界 ②
        spotChecked++;
        if (!hasCJK(lab)) spot.push(`区域行为 \`${type}\` 的字段标签仍是英文：「${lab}」`);
        break;                         // 每个类型抽一个字段就够
      }
    }
  } catch (_) { /* 结构变了就当查不到，下面统一按 checked 判 */ }

  if (!spotChecked) {
    out.push(Check.skip(S, "被改对象抽查", "读不到 `CONFIG.RegionBehavior.dataModels` 的字段（上游结构变了？）"));
  } else {
    out.push(spot.length
      ? Check.fail(S, "被改对象抽查", spotChecked, `抽查 ${spotChecked} 项，**${spot.length} 项仍是英文**：`, spot)
      : Check.ok(S, "被改对象抽查", spotChecked, `抽查 ${spotChecked} 项，值都已是中文`));
  }
  return out;
}

/* -------------------------------------------- */
/*  G · 译文体检：已废写法有没有回潮              */
/* -------------------------------------------- */

/**
 * 本项目**已裁决废弃**的写法。任何一条重新出现在合集索引里，都说明有批次把它写回去了。
 * ⚠ 每条都注明它该是什么，免得看到告警不知道往哪改。
 */
const RETIRED = [
  ["令牌", "指示物", "R-token-foundry-ui：与 foundry_chn 核心包对齐"],
  ["六角格", "六边格", "R-hex-tile"],
  ["空心之月", "空洞之月", "R-moon-hollow"],
  ["焦炭之月", "焦灼之月", "R-moon-charred"],
  ["狂澜之月", "风暴之月", "R-moon-tempest"],
  ["兰蒂尔", "兰提尔", "R-lantyr"],
  ["波因特", "岬", "世界地图地名统一意译"],
  ["黑曜古物", "黑曜石古物", "R-obsidian-antiquary"],
  ["凯西亚沙刀", "凯西安沙刀", "R-kessia-vs-kessian：文化标签用凯西安"],
  ["晶片女神", "碎片女神", "R-shard-god"],
  ["阿克图里安高原", "阿克图斯高原", "Arctus Plateau 是地名，与族名 Arcturian 是两个词"],
];

function checkRetired() {
  const S = "G 译文体检";
  const packs = [...game.packs].filter(p => {
    const src = p.metadata?.packageName ?? p.metadata?.package;
    return src === "ember" || src === "crucible";
  });
  if (!packs.length) return [Check.skip(S, "已废写法回潮", "当前世界没有 ember / crucible 合集")];

  let names = 0;
  const hits = [];
  for (const p of packs) {
    for (const e of (p.index ?? [])) {
      if (typeof e.name !== "string") continue;
      names++;
      for (const [bad, good, why] of RETIRED) {
        if (e.name.includes(bad)) hits.push(`「${bad}」→ 应为「${good}」（${why}）· 出现在 ${p.collection} :: ${e.name}`);
      }
    }
  }
  if (!names) return [Check.skip(S, "已废写法回潮", "合集索引是空的（还没加载？）")];

  return [hits.length
    ? Check.fail(S, "已废写法回潮", names, `扫 ${names} 个条目名，**${hits.length} 处用了已废写法**：`, hits)
    : Check.ok(S, "已废写法回潮", names,
        `扫 ${names} 个条目名，${RETIRED.length} 条已废写法一个都没出现。` +
        `⚠ 只扫**条目名**，正文里的回潮要靠仓库侧的 \`assert_resolutions.py\`。`)];
}

/* -------------------------------------------- */
/*  H · 已知豁免（故意留英，别当 bug）            */
/* -------------------------------------------- */

const EXEMPTIONS = [
  ["`Hexblade`（邪术师宗主）", "与已定稿的 `Spellblade`＝咒刃 撞名，同一个中文指两样东西 —— §8 2026-08-14d 裁「不译」"],
  ["`Crucible`（系统名）", "全库一律保留拉丁原文（compendium 133 叶 + lang 21 键，「坩埚」0 处）"],
  ["雅科什塔矿井的「代币」", "故事内的实体信物，不是 Foundry 的指示物 —— 裁决 1 明文豁免"],
  ["部分音景编排名", "多为内部段落编号（`Celestial Combat Section 3` 之类），查不到依据的宁可留英"],
  ["双语并列的条目名", "`阿克图瑞尔 Arcturel` 这种是**约定**不是漏译 —— 便于与英文原版交叉对照"],
];

function checkExemptions() {
  const S = "H 已知豁免";
  return [Check.ok(S, "故意留英的东西", EXEMPTIONS.length,
    "下列是**有意为之**，看到英文别当缺陷报：",
    EXEMPTIONS.map(([what, why]) => `${what} —— ${why}`))];
}

/* -------------------------------------------- */
/*  报告渲染                                     */
/* -------------------------------------------- */

function summarize(checks) {
  const n = { ok: 0, warn: 0, fail: 0, skip: 0 };
  let scanned = 0;
  for (const c of checks) { n[c.status]++; scanned += c.checked || 0; }
  return { ...n, scanned, total: checks.length };
}

function renderHTML(checks, meta) {
  const s = summarize(checks);
  const bySection = new Map();
  for (const c of checks) {
    if (!bySection.has(c.section)) bySection.set(c.section, []);
    bySection.get(c.section).push(c);
  }

  const head = `
<div class="ecn-sc-head">
  <p class="ecn-sc-sum">
    ${ICON.ok} 通过 <b>${s.ok}</b> ·
    ${ICON.warn} 注意 <b>${s.warn}</b> ·
    ${ICON.fail} 失败 <b>${s.fail}</b> ·
    ${ICON.skip} 无从查起 <b>${s.skip}</b>
    &nbsp;—&nbsp; 本次共检查 <b>${s.scanned}</b> 项
  </p>
  <p class="ecn-sc-note">
    ⚠ <b>「无从查起」不等于「没问题」</b> —— 那是前提不满足、这一项这次根本没查。
    判据报绿而实际上什么都没查，是本项目反复踩过的坑，所以每一档都标了「查了多少项」。
  </p>
  <p class="ecn-sc-meta">${meta}</p>
</div>`;

  const body = [...bySection].map(([sec, list]) => {
    const rows = list.map(c => {
      const items = c.items?.length
        ? `<ul class="ecn-sc-items">${c.items.map(i => `<li>${foundry.utils.escapeHTML?.(i) ?? i}</li>`).join("")}</ul>`
        : "";
      const cnt = c.status === "skip" ? "—" : String(c.checked);
      return `<tr class="ecn-sc-${c.status}">
        <td class="ecn-sc-ico">${ICON[c.status]}</td>
        <td class="ecn-sc-name">${c.name}</td>
        <td class="ecn-sc-cnt" title="本项检查了多少条">${cnt}</td>
        <td class="ecn-sc-detail">${c.detail ?? ""}${items}</td>
      </tr>`;
    }).join("");
    return `<h3 class="ecn-sc-sec">${sec}</h3>
      <table class="ecn-sc-table"><tbody>${rows}</tbody></table>`;
  }).join("");

  return `<div class="ecn-selfcheck">${head}${body}</div>`;
}

function renderMarkdown(checks, meta) {
  const s = summarize(checks);
  const lines = [
    "# 汉化自检报告",
    "",
    meta,
    "",
    `- 通过 ${s.ok} · 注意 ${s.warn} · 失败 ${s.fail} · **无从查起 ${s.skip}**`,
    `- 本次共检查 **${s.scanned}** 项`,
    "",
    "> ⚠ 「无从查起」不等于「没问题」——那是前提不满足、这一项根本没查。",
    "",
  ];
  let sec = null;
  for (const c of checks) {
    if (c.section !== sec) { sec = c.section; lines.push(`## ${sec}`, ""); }
    lines.push(`- ${ICON[c.status]} **${c.name}** [${LABEL[c.status]}]` +
      (c.status === "skip" ? "" : `（查了 ${c.checked} 项）`) + ` — ${c.detail ?? ""}`);
    for (const i of (c.items ?? [])) lines.push(`  - ${i}`);
  }
  return lines.join("\n");
}

/* -------------------------------------------- */
/*  跑一次全部检查                                */
/* -------------------------------------------- */

/**
 * @param {object} [opts]
 * @param {Function} [opts.extra] 额外的异步检查（键活性那一档由 ember-hardcoded-cn.mjs 提供，
 *   因为只有它拿得到那些表；拿不到时这一档会报 skip 而不是静静跳过）。
 */
export async function runSelfCheck(opts = {}) {
  const checks = [];
  checks.push(...checkEnvironment());
  checks.push(...checkBabele());
  checks.push(...checkI18n());

  // D 键活性：由硬编码表那个模块注入。**拿不到就明说无从查起。**
  if (typeof opts.extra === "function") {
    try {
      const more = await opts.extra();
      if (Array.isArray(more) && more.length) checks.push(...more);
      else checks.push(Check.skip("D 键活性", "整档", "键活性检查没有返回任何结果"));
    } catch (err) {
      checks.push(Check.fail("D 键活性", "整档", 0, `检查本身抛异常：${err?.message ?? err}`));
    }
  } else {
    checks.push(Check.skip("D 键活性", "整档",
      "硬编码表模块没有注册键活性检查（`ember-hardcoded-cn.mjs` 没加载？）"));
  }

  checks.push(...checkPatches());
  checks.push(...checkSubtrees());
  checks.push(...checkRetired());
  checks.push(...checkExemptions());
  return checks;
}

/* -------------------------------------------- */
/*  F · 注入子树                                  */
/* -------------------------------------------- */

/** 由 ember-hardcoded-cn.mjs 在加载时填进来（它才拿得到 INJECTED_SUBTREES）。 */
export const SUBTREE_SELECTORS = [];

function checkSubtrees() {
  const S = "F 注入子树";
  if (!SUBTREE_SELECTORS.length) {
    return [Check.skip(S, "整档", "没拿到选择器清单（`ember-hardcoded-cn.mjs` 没注册？）")];
  }
  const present = [], absent = [];
  for (const sel of SUBTREE_SELECTORS) {
    try { (document.querySelector(sel) ? present : absent).push(sel); }
    catch (_) { absent.push(`${sel}（选择器本身无效）`); }
  }
  return [Check.ok(S, "选择器命中", SUBTREE_SELECTORS.length,
    `${present.length}/${SUBTREE_SELECTORS.length} 个选择器**此刻**能在页面上选到东西。` +
    `⚠ 选不到**多半只是那个界面没开**，不算失败 —— 想验它就把对应界面打开再跑一次。`,
    absent.length ? [`当前选不到：${absent.join(" · ")}`] : [])];
}

/* -------------------------------------------- */
/*  D · 键活性 ⭐ 本面板最值钱的一档              */
/* -------------------------------------------- */

/**
 * 把硬编码表里的每个**英文键**，拿去当前安装的上游源码里核一遍还在不在。
 *
 * 为什么这一档最值钱
 * ------------------
 * 硬编码表是「按字面匹配上游产出的字符串」。上游一改措辞，键就再也匹配不上，
 * 界面照旧显示英文，而**控制台一声不响** —— 这是本项目最典型的静默失效。
 * 第十六轮离线做过一次同样的核对，当时查出 **31 个键根本不生效**。
 * 放进面板的好处是：它对着**你此刻实际装的那个版本**跑，上游一升级就能立刻看出来。
 *
 * ⚠ 判据的边界（必须知道，否则会误读结果）
 * ----------------------------------------
 * 「键在源码里出现」**不等于**「键一定会被匹配上」。反例本项目都撞过：
 *   · 上游是**拼接**产生的（模板串 / 跨行相加）—— 字面量在，但运行时拼出来的串不一样；
 *   · 形态不对 —— 裸词键接不住 `前缀: 名字` 这种复合串（那种要进 PREFIXED）；
 *   · 正则字符类太窄 —— `\w` 接不住 `moiré` 这类非 ASCII。
 * 所以这一档**只能证伪不能证实**：报出来的「上游查无此串」是硬线索，
 * 而「全都找得到」只说明**没有被上游删掉**，不代表运行时一定命中。
 *
 * ⚠ 另一条边界：有些表**按设计只在特定系统下生效**（例如 KNOWLEDGE 的大部分只在 dnd5e 世界），
 * 当前系统不匹配时那些键在源码里找不到是**正常的**，不是缺陷 —— 所以传表时可以标 `onlyOn`。
 */
export async function keyLiveness(tables) {
  const S = "D 键活性";
  if (!tables || !Object.keys(tables).length) {
    return [Check.skip(S, "整档", "没拿到任何硬编码表")];
  }

  // 抓当前安装的上游源码。抓不到 → 无从查起，**不能当成「键都还在」**。
  // ⚠ 语料不全就会把「我没去那儿找」误报成「上游删了」—— dnd5e 侧的表
  //   （WARLOCK_PATRONS / RARITIES / DIVINE_DOMAINS …）的串在 dnd5e 系统源码里，
  //   只抓 ember + crucible 会把它们全部误判成失效。2026-08-16 首跑就撞到了这个。
  const sources = [];
  const emberSrc = await fetchText("modules/ember/scripts/ember.mjs");
  if (emberSrc) sources.push(["ember", emberSrc]);
  for (const sys of ["crucible", "dnd5e"]) {
    if (game.system?.id !== sys) continue;
    for (const path of [`systems/${sys}/${sys}-compiled.mjs`, `systems/${sys}/${sys}.mjs`]) {
      const t = await fetchText(path);
      if (t) { sources.push([sys, t]); break; }
    }
  }

  if (!sources.length) {
    return [Check.skip(S, "整档",
      "抓不到上游源码（`modules/ember/scripts/ember.mjs` 取不到）—— **这一档这次什么都没查**。" +
      "常见原因：上游没装、路径变了、或浏览器拦了 fetch。")];
  }

  const corpus = makeCorpus(sources.map(([, t]) => t).join("\n"));
  const out = [Check.ok(S, "上游源码", sources.length,
    `抓到 ${sources.map(([n, t]) => `${n}（${Math.round(t.length / 1024)} KB）`).join(" · ")}`)];

  let grand = 0, grandMiss = 0;
  for (const [tableName, spec] of Object.entries(tables)) {
    const table = spec?.table ?? spec;
    const onlyOn = spec?.onlyOn ?? null;
    const kind = spec?.kind ?? "literal";

    if (onlyOn && game.system?.id !== onlyOn) {
      out.push(Check.skip(S, tableName, `按设计只在 \`${onlyOn}\` 系统下生效，当前是 \`${game.system?.id}\``));
      continue;
    }
    // 表可能是对象（键=英文）或数组（正则条目，跳过 —— 正则没法这样核）
    if (Array.isArray(table)) {
      out.push(Check.skip(S, tableName, "正则表，无法用字面量核对（要核得跑真实输入）"));
      continue;
    }
    const keys = Object.keys(table ?? {});
    if (!keys.length) { out.push(Check.skip(S, tableName, "空表")); continue; }

    // ── 运行时拼出来的键：字面量核对**没有意义**，报 skip 而不是 warn ──
    if (kind === "composed") {
      out.push(Check.skip(S, tableName,
        `${keys.length} 键是**运行时拼出来**的（如 \`\${月亮} Attunement (Rank \${N})\`），` +
        `上游源码里本来就不会有这个字面量 —— 字面量核对对它无效，不是失效。`));
      continue;
    }
    // ── 键来自数据文件（合集 / JSON）而不是脚本：拿脚本当语料核不准 ──
    if (kind === "data") {
      out.push(Check.skip(S, tableName,
        `${keys.length} 键来自**数据文件**（合集 / JSON）而不是 \`.mjs\`，` +
        `拿脚本源码当语料核不出来 —— 不是失效。要核得另抓数据文件。`));
      continue;
    }
    // ── 反向判据：我们建这张表**正因为上游缺这些**。「找到了」才是信号 ──
    if (kind === "absent-by-design") {
      const found = keys.filter(k => corpus.has(k));
      const shortOnes = found.filter(k => k.length <= 8);
      grand += keys.length;
      out.push(found.length
        ? Check.warn(S, tableName, keys.length,
            `${keys.length} 键，**${found.length} 个上游现在提供了** —— 本表是为「上游缺这些」而建的，` +
            `上游补上之后我们的兜底可能变成多余甚至冲突，**该复核了**。` +
            (shortOnes.length
              ? `⚠ 但其中 ${shortOnes.length} 个是**短词**（≤8 字符），` +
                `短词在几 MB 的源码里很容易因别的原因偶然出现 —— **这一档是线索不是结论**，` +
                `要确认得去看它出现的**上下文**是不是真的当作该类别的标签在用。`
              : ""),
            found.map(k => `\`${k}\`${k.length <= 8 ? "（短词，可能是偶然命中）" : ""}`))
        : Check.ok(S, tableName, keys.length,
            `${keys.length} 键上游仍然没有 —— 本表是为此而建的，**这才是预期状态**（找不到＝正常）`));
      continue;
    }

    const miss = keys.filter(k => !corpus.has(k));
    grand += keys.length; grandMiss += miss.length;
    out.push(miss.length
      ? Check.warn(S, tableName, keys.length,
          `${keys.length} 键，**${miss.length} 个在上游源码里查无此串** —— 多半是上游改了措辞，该键已失效：`,
          miss.slice(0, 40).map(k => `\`${k}\``).concat(miss.length > 40 ? [`…另 ${miss.length - 40} 个`] : []))
      : Check.ok(S, tableName, keys.length, `${keys.length} 键全部仍能在上游源码里找到`));
  }

  out.unshift(Check.ok(S, "合计", grand,
    `共核 ${grand} 个键，其中 ${grandMiss} 个在上游查无此串。` +
    `⚠ **本档只能证伪不能证实** —— 「找得到」只说明没被上游删掉，不代表运行时一定命中` +
    `（拼接串 / 形态不对 / 正则字符类太窄 都会让键在源码里在、运行时却匹配不上）。` +
    `⚠ 反过来「查无此串」也要看表的类型：运行时拼接的、来自数据文件的、以及` +
    `**本来就为「上游缺这些」而建的**表，找不到都是正常的 —— 那几类已按类型分开报，不计进这个数。`));
  return out;
}

/* -------------------------------------------- */
/*  面板                                          */
/* -------------------------------------------- */

const PANEL_CSS = `
/* ⚠ 报告很长（首次真实世界自检 4000+ 项、五十多行），**必须自己能滚** ——
   DialogV2 的内容区默认不给滚动条，不加这段就只能看到开头一截、也没法拖着复制。
   dialog 的 window-content 由 core 控制高度，这里让内容区自己溢出滚动。
   ⚠ 这段注释里**不许出现反引号** —— 它整个活在一个模板字符串里，一个反引号就把 CSS 截断。 */
.ecn-selfcheck {
  max-height: min(72vh, 640px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: .4em;          /* 给滚动条留位，别压住文字 */
  overscroll-behavior: contain;  /* 滚到底不要把整个窗口带着滚 */
  user-select: text;             /* 明确允许框选复制 */
}
.ecn-selfcheck { font-size: 13px; }
.ecn-selfcheck .ecn-sc-sum { font-size: 15px; margin: 0 0 .3em; }
.ecn-selfcheck .ecn-sc-note,
.ecn-selfcheck .ecn-sc-meta { opacity: .8; font-size: 12px; margin: .2em 0; }
.ecn-selfcheck .ecn-sc-sec { margin: 1em 0 .3em; border-bottom: 1px solid var(--color-border-light-2, #999); }
.ecn-selfcheck .ecn-sc-table { width: 100%; border-collapse: collapse; }
.ecn-selfcheck .ecn-sc-table td { padding: 3px 5px; vertical-align: top; }
.ecn-selfcheck .ecn-sc-ico { width: 1.6em; text-align: center; }
.ecn-selfcheck .ecn-sc-name { width: 32%; font-weight: 600; }
.ecn-selfcheck .ecn-sc-cnt { width: 3.5em; text-align: right; opacity: .7; font-variant-numeric: tabular-nums; }
.ecn-selfcheck .ecn-sc-items { margin: .2em 0 .2em 1em; padding-left: .8em; }
.ecn-selfcheck .ecn-sc-items li { margin: .1em 0; }
.ecn-selfcheck tr.ecn-sc-fail { background: rgba(220, 60, 60, .12); }
.ecn-selfcheck tr.ecn-sc-warn { background: rgba(220, 170, 40, .12); }
.ecn-selfcheck tr.ecn-sc-skip { background: rgba(130, 130, 130, .14); }
`;

function ensureCSS() {
  if (document.getElementById("ecn-selfcheck-css")) return;
  const el = document.createElement("style");
  el.id = "ecn-selfcheck-css";
  el.textContent = PANEL_CSS;
  document.head.appendChild(el);
}

export async function openSelfCheckPanel(extra) {
  ensureCSS();
  const t0 = performance.now();
  const checks = await runSelfCheck({ extra });
  const ms = Math.round(performance.now() - t0);
  const meta = `Foundry v${game.version} · 世界「${game.world?.title ?? game.world?.id}」 · ` +
    `系统 ${game.system?.id} v${game.system?.version} · 耗时 ${ms} ms · ` +
    new Date().toLocaleString();

  const content = renderHTML(checks, meta);
  const md = renderMarkdown(checks, meta);

  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) {                      // 老版 Foundry 兜底
    return new Dialog({ title: "汉化自检", content, buttons: { ok: { label: "关闭" } } },
      { width: 760, height: 700, resizable: true }).render(true);
  }

  return DialogV2.wait({
    window: { title: "汉化自检", icon: "fa-solid fa-stethoscope", resizable: true },
    position: { width: 780, height: 720 },
    content,
    buttons: [
      {
        action: "copy", label: "复制报告（Markdown）", icon: "fa-solid fa-copy",
        callback: async () => {
          try {
            await navigator.clipboard.writeText(md);
            ui.notifications.info("自检报告已复制到剪贴板。");
          } catch (_) {
            // 剪贴板被浏览器策略挡住时，退回控制台 —— **不要静静失败**
            console.log(md);
            ui.notifications.warn("剪贴板不可用，报告已打印到控制台（F12）。");
          }
          return false;                 // 不关窗
        },
      },
      { action: "close", label: "关闭", default: true },
    ],
  });
}

/* -------------------------------------------- */
/*  设置项注册                                    */
/* -------------------------------------------- */

/**
 * 注册设置项与面板入口。
 *
 * @param {Function|null} extra
 *   键活性检查。**只有拿得到硬编码表的模块才传** —— crucible-cn 没有那些表，
 *   传 null，于是「D 键活性」那一档会如实报**「无从查起」**而不是伪装成通过。
 * @param {object} [opts]
 * @param {string} [opts.modId] 注册到哪个模块的设置命名空间。默认 ember 汉化。
 *   ⚠ 两个模块共用这一份文件（见文件头），所以命名空间必须由调用方给。
 */
export function registerSelfCheck(extra, opts = {}) {
  const NS = opts.modId ?? MOD_ID;
  // ⚠ 基类必须用 `globalThis.X` 取，**不能直接写裸标识符** ——
  //   裸的 `Application` 在没有该全局时会在**类定义那一刻**抛 ReferenceError，
  //   而那是 `extends` 表达式求值，外面的 try/catch 包不住，整个模块加载就挂了。
  //   （2026-08-16 的桩环境冒烟测试当场撞到这个，不是假设。）
  const FormApp = globalThis.foundry?.applications?.api?.ApplicationV2
    ?? globalThis.Application
    ?? class {};                       // 兜底：连 Application 都没有时也不许崩

  // 用一个极薄的 Application 当「按钮」：点开就直接跑面板然后自己关掉。
  class SelfCheckLauncher extends FormApp {
    static DEFAULT_OPTIONS = { id: "ecn-selfcheck-launcher", window: { title: "汉化自检" } };
    async render(...args) { await openSelfCheckPanel(extra); return this; }
    async close() { return this; }
  }

  game.settings.registerMenu(NS, "selfCheck", {
    name: "汉化自检面板",
    label: "打开自检面板",
    hint: "当场核一遍译文与补丁到底有没有生效 —— 控制台不报错只说明没崩，说明不了键有没有匹配上。",
    icon: "fa-solid fa-stethoscope",
    type: SelfCheckLauncher,
    restricted: false,
  });

  game.settings.register(NS, "selfCheckOnStartup", {
    name: "开世界时静默自检",
    hint: "开世界后在后台跑一遍，只有出现「失败」时才弹提示。平时不打扰。",
    scope: "client", config: true, type: Boolean, default: false,
  });

  Hooks.once("ready", async () => {
    if (!game.settings.get(NS, "selfCheckOnStartup")) return;
    try {
      const checks = await runSelfCheck({ extra });
      const s = summarize(checks);
      if (s.fail) {
        ui.notifications.error(`汉化自检发现 ${s.fail} 项失败，请打开「模块设置 → 汉化自检面板」查看。`);
      }
      // ⚠ 即使全绿也打一行日志，并**带上查了多少项** —— 不带数量的「全绿」没有意义。
      console.log(`[${NS}] 自检：通过 ${s.ok} / 注意 ${s.warn} / 失败 ${s.fail} / ` +
                  `无从查起 ${s.skip}，共检查 ${s.scanned} 项。`);
    } catch (err) {
      console.error(`[${NS}] 启动自检本身出错：`, err);
    }
  });
}
