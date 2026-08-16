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
 * 这条原则是从本项目**八种判据空转形态**里换来的：
 *   (a) 判据自己的正则被转义吃掉  (b) 判据压根不读库  (c) 判据读的是旧报告快照
 *   (d) 闸在跑但豁免表已经空了    (e) 输入缺失但判据照跑  (f) 正则失效而主闸照样全绿
 *   (g) 输入不缺但被静默换成了另一份
 *   (h) **空转的是给判据喂输入的那个探针** —— 判据本身没毛病，它验的输入是探针自己捏的
 * 八种的共同点都是**报绿**，所以「绿」这个信号本身必须带上「我查了多少」才有意义。
 *
 * 第二十六轮又补了两条同族的教训，写在 D 档里：
 *   · **一条永远拿不到东西的分支**，跑得再勤也等于没跑（旧版 `e.pages` 那一路）；
 *   · **「没抓到」和「面板说了我没抓到」是两回事** —— 无声缺口不比报错好。
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
 *  D 字面量存在性  把硬编码表的每个键拿去**当前安装的上游文本**（脚本 / 模板 / lang / 合集索引）
 *                  里核一遍**在不在**。⚠ 它做的是**子串存在性**，不是「键还生不生效」——
 *                  两者没有因果关系，结论**仅供人工复核**（详见该档自己的注释）
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
 * 抓取当前安装的上游文本，用来做 D 档的字面量存在性核对。
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

/* -------------------------------------------- */
/*  语料：文本 +「这个字面量在不在里面」           */
/* -------------------------------------------- */

/**
 * 与运行时 `translateNode` 同口径的空白折叠。
 * 模板里的换行 + 缩进上屏之后塌成一个空格，源码里的字面量却带着原样的换行 ——
 * 不折叠就必然对不上。第二十四轮 77 条误报里有一批栽在这。
 */
function foldWS(s) { return String(s).replace(/\s+/g, " "); }

const WORD_CHAR = /[A-Za-z0-9_]/;
const ASCII_ONLY = /^[\x20-\x7E]+$/;

/**
 * 把一段文本编成「出现过哪些字面量」的查询对象。
 *
 * ⚠ 两条**必须**有的处理，少一条这一档就会大批误报：
 *
 *   ① **双侧空白折叠**（见 `foldWS`）。
 *
 *   ② **纯 ASCII 键加词边界**。裸 `includes` 在几 MB 源码里必然巧合命中：
 *      实测 `Abyss` 在 ember.mjs 里 327 次命中**只有 5 次独立成词**；
 *      `Oaken` / `Bejak` / `Waerd` 独立成词 **0 次**（全部来自 `Oakenshield` 之类）。
 *      ⚠⚠ **不许拿长度阈值代替词边界** —— 旧版那句「≤8 字符可能是偶然命中」是**无效免责**：
 *      `Arcturian`（9 字符）越过阈值照样是纯误报。要么词边界，要么别声称。
 *      非纯 ASCII 的键（含 CJK / 重音字母）不加词边界 —— `\w` 式的边界对它们没有意义。
 *
 * `tier` 是这份语料的**证据力档位**（见 `CORPUS_TIER`）。同样是「找到了」，
 * 命中在脚本里和命中在推导语料里根本不是一回事，报文里必须分开显示。
 */
function makeCorpus(text, label = "?", tier = 1) {
  return {
    label,
    tier,
    bytes: text.length,
    text: foldWS(text),
    has(s) {
      if (typeof s !== "string") return false;
      const needle = foldWS(s).trim();
      if (!needle) return false;
      if (!ASCII_ONLY.test(needle)) return this.text.includes(needle);
      const lWord = WORD_CHAR.test(needle[0]);
      const rWord = WORD_CHAR.test(needle[needle.length - 1]);
      let i = this.text.indexOf(needle);
      while (i !== -1) {
        const before = i > 0 ? this.text[i - 1] : "";
        const after = this.text[i + needle.length] ?? "";
        if ((!lWord || !WORD_CHAR.test(before)) && (!rWord || !WORD_CHAR.test(after))) return true;
        i = this.text.indexOf(needle, i + 1);
      }
      return false;
    }
  };
}

/**
 * 一组语料。
 * ⚠ `find()` 返回的是**命中在哪一份**而不是布尔 —— 「只在合集索引里找到」与
 *   「在脚本里找到」证据力天差地别，把它们压成同一个 true 就等于自己蒙住眼睛。
 */
function makeCorpusSet(corpora) {
  return {
    corpora,
    find(s) { for (const c of corpora) if (c.has(s)) return c.label; return null; },
    has(s) { return this.find(s) !== null; },
    /** 命中在这份语料上算第几档证据（找不到该标签就当最弱档，宁可低估不许高估）。 */
    tierOf(label) { return corpora.find(c => c.label === label)?.tier ?? 3; }
  };
}

/**
 * 证据力档位。**这四档不是修辞，是本档报绿时唯一有意义的信息。**
 *   1 直接命中：串就写在上游的脚本 / 模板 / lang / 系统源码里 —— 最强。
 *   2 合集索引：串来自 `pack.index` 的条目名。⚠ 这一路是 **babele 译完之后**的文本
 *     （babele 包了 `CONFIG.DatabaseBackend._getDocuments` 与 `indexDocument`），
 *     而本项目的条目名约定里有一批是**双语并列**（`深渊 The Abyss`）——
 *     于是「在合集索引里找到了这个英文串」很可能找到的是**我们自己译文里那半截英文**，
 *     拿它证「上游还有这个串」是**自证循环**。所以它比直接命中弱一档。
 *   3 拼接展开（推导）：语料本身是我们从源码**推**出来的，不是上游真有的文本。
 *   —— 另有一条**正交**的减分项：**短词命中**（见 `isWeakShortWord`），
 *      它可以叠加在任何一档上，且叠上之后那条绿基本等于没有。
 */
const CORPUS_TIER = { direct: 1, packIndex: 2, derived: 3 };
const TIER_LABEL = {
  1: "直接命中（脚本 / 模板 / lang / 系统源码）",
  2: "合集索引（⚠ babele 译后文本，双语条目名会造成自证循环）",
  3: "拼接展开（推导 · 不是上游真有的文本）"
};

/**
 * 「短词命中」：证据力约等于零的那种绿。
 *
 * ⚠ 加了词边界也救不了它 —— `Sort` / `Only` / `Tint` / `Angle` / `Alpha` 这类词在几 MB
 *   源码里**必然**独立成词地巧合出现，命中说明不了「这个键还是上游那个标签」。
 *   本档不因此判它错（那会变成误报），但**必须在报文里标出来**，不许让它冒充证据。
 */
const SHORT_WORD_MAX = 8;
function isWeakShortWord(k) {
  const s = foldWS(k).trim();
  return ASCII_ONLY.test(s) && !s.includes(" ") && s.length <= SHORT_WORD_MAX;
}

/** 只给离线探针用（面板本身不调）。**探针必须用这里的实现，不许自己再抄一份。** */
export const __corpusInternals = { foldWS, makeCorpus, makeCorpusSet };

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

/**
 * 一个合集的**索引里有多少条**。
 *
 * ⚠ 用途只有一个：区分「**上游这个包本身就是空的**」与「**有内容却没有译文**」。
 *   `crucible.crafting` 在 `system.json` 里声明了，而 `systems/crucible/packs/` 下**连目录都不存在**
 *   （2026-08-17 实测：声明 16 个包、目录里 15 个，差的就是它）—— 它永远不会有译文，
 *   报成「没有译文」会让人一直去追一个不存在的缺口。
 * ⚠⚠ 但**绝不许**因此把它从分母里摘掉：把项挪出视野换一个好看的数，正是本项目第二十四轮
 *   那个假 0 的同型动作。**分母一条不动，改的只是报文说不说得清。**
 * ⚠ `pack.index` 在 Foundry 里是 `Collection`（有 `.size`），桩环境常给数组 —— 两种都接。
 */
function packIndexSize(p) {
  const idx = p?.index;
  if (idx == null) return 0;
  if (typeof idx.size === "number") return idx.size;
  if (typeof idx.length === "number") return idx.length;
  try { return [...idx].length; } catch (_) { return 0; }
}

/** 点名清单的截断上限（截断本身也要说出来，不许静静少列）。 */
const NAME_LIST_CAP = 24;
function cappedList(a, unit = "条") {
  return a.slice(0, NAME_LIST_CAP)
    .concat(a.length > NAME_LIST_CAP ? [`…另 ${a.length - NAME_LIST_CAP} ${unit}没有列出（列表上限 ${NAME_LIST_CAP}）`] : []);
}

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
  //
  // ⚠⚠⚠ 2026-08-17 第二次真实世界自检：**同一行又报了一次假警报，同样的自相矛盾**
  //   （❌ 22 个一个都没认到 / ✅ 索引抽样 137 条全中文）。上面那条教训只改对了一半 ——
  //   **函数名是对的，参数形态是错的**：
  //     babele.js:557                 isTranslated(pack)  @param {string} ex. "dnd5e.classes"
  //     translation-session.js:111    → !!translatedCompendiumFor(collection)
  //     mapped-compendiums.js:60/49   → this.packs.get(pack)   ← 以**字符串**为键的 Map
  //   传 `CompendiumCollection` **对象**进去必然 miss、**永远返回 false**，与有没有译文无关。
  //   所以要传 `p.collection`（`"ember.crucible-adventure"` 这种）。
  //   ⇒ 教训要补一句：**「这个 API 存在」不等于「我喂给它的东西是它要的」** ——
  //     照着 JSDoc 的 `@param` 类型核一遍，别只核函数名。
  // ⚠ 抽样**先算**，因为下面那条「已认到译文的合集」要拿它做交叉印证 ——
  //   这一档的两条检查测的是同一件事的两端（译文文件认没认到 / 屏上是不是中文），
  //   **它们互相矛盾时，先怀疑判据**（2026-08-16 与 08-17 两次都是判据错）。
  let sampled = 0, cn = 0;
  const badPacks = [];
  // ⚠ 抽样里**没有中文**的条目要逐条留名 —— 只报一个「中文 130/137」的百分比，
  //   与「某个包真的漏译了」在报文上**长得一模一样**，读者无从下手（见本档下面那条 ok 分支）。
  const enNames = [];
  for (const p of packs) {
    const idx = [...(p.index ?? [])];
    if (!idx.length) continue;
    const take = idx.slice(0, 8);
    let packCn = 0;
    for (const e of take) {
      sampled++;
      if (hasCJK(e.name)) { cn++; packCn++; }
      else enNames.push(`${p.collection ?? p.metadata?.name} :: ${e.name}`);
    }
    if (take.length && packCn === 0) badPacks.push(`${p.metadata?.label ?? p.collection}（抽 ${take.length} 条无一中文）`);
  }

  if (typeof babele.isTranslated !== "function") {
    out.push(Check.skip(S, "已认到译文的合集",
      "这个版本的 Babele 没有 `isTranslated()` —— API 变了，本项无从查起"));
  } else if (!packs.length) {
    out.push(Check.skip(S, "已认到译文的合集", "当前世界里没有 ember / crucible 的合集"));
  } else {
    const yes = [], noTrans = [];
    for (const p of packs) {
      // ⚠ 必须是 collection **字符串**，不是 pack 对象（见上面那段）
      const id = p.collection ?? `${p.metadata?.packageName ?? p.metadata?.package}.${p.metadata?.id ?? p.metadata?.name}`;
      let t = false;
      try { t = !!babele.isTranslated(id); } catch (_) { t = false; }
      (t ? yes : noTrans).push({ p, id });
    }
    if (yes.length) {
      /* ⚠⚠ **聚合数必须点名到具体项。**（2026-08-17 第二次真实世界冒烟验证的产物）
         这一行从前报的是一句光秃秃的「**21/22** 个合集有对应译文文件」—— 那个「1」是谁，
         报文里一个字都没有。今天它是良性的（差的是 `crucible.crafting`：`system.json` 里
         声明了 16 个包，而 `systems/crucible/packs/` 下**只有 15 个目录**，它连目录都不存在），
         **问题不在于它今天良性，而在于明天某个真包丢了译文，报出来长得一模一样。**

         所以这里做两件事，缺一不可：
           ① **逐个点名**没认到译文的合集（点名之外还要给出它的 index 条数）；
           ② 把点名出来的分成**良性 / 可疑**两类 —— 上游包自己就是空的（index 0 条）报「预期」，
              上游有内容却没译文才是要提醒的（升成 ⚠️ 注意）。
         ⚠⚠ **不许把「没有译文」的包从分母里摘掉**去换一个好看的 22/22 —— 那是本项目
         第二十四轮那个假 0 的同型动作（把 117 个键挪出视野换来一个假 0）。**分母一条不动。**
         ⚠ 「空包」是拿 `pack.index.size` 判的，而**索引还没加载时与空包长得一样** ——
           所以只有本次**别处确实抽到过索引**（`sampled > 0`）才敢判「预期」，否则老实说分不清。 */
      const emptyOnes = [], suspectOnes = [];
      for (const o of noTrans) {
        const n = packIndexSize(o.p);
        ((n === 0 && sampled > 0) ? emptyOnes : suspectOnes).push({ ...o, n });
      }
      const label = (o) => `\`${o.id}\`（${o.p?.metadata?.label ?? "无标题"}）`;
      const items = [
        ...suspectOnes.map(o => `${label(o)} —— ` + (o.n > 0
          ? `⚠️ **上游此包有 ${o.n} 条内容，却没有对应译文文件** —— **这一条要看**：` +
            `多半是译文文件漏发、或 babele mapping 没登记上，装了也不会有中文。`
          : `⚠️ index 0 条，**但本次一条索引都没抽到** —— 「上游空包」与「索引还没加载」` +
            `在 \`pack.index.size\` 上长得一样，**这次分不出来，不敢判良性**。`)),
        ...emptyOnes.map(o => `${label(o)} —— **预期**：上游此包为空（\`pack.index\` 0 条），` +
          `**没有可译内容**，本来就不该有译文文件（例：\`crucible.crafting\` 在 \`system.json\` 里` +
          `声明了，\`systems/crucible/packs/\` 下却连目录都没有）。`)
      ];
      // ⚠ 这段说明里**不许出现 `N/N` 那种满分比例的字面写法** —— 报文里的比例是给人读的判据，
      //   在解释文字里写一个假的满分，读者（和拿报文做回测的用例）都会当真。
      const tail = `　⚠ **分母一条没动**：${packs.length} 个合集全在分母里，没有任何包被摘出视野` +
        `（摘掉一个换来「全部齐活」的满分，正是本项目第二十四轮那个假 0 的同型动作）。` +
        `　⚠ 「空包」判据是 \`pack.index.size\`，索引没加载时与空包长得一样 —— ` +
        `本次别处抽到 ${sampled} 条索引，只有在这个前提下才敢把 index 0 条判成「预期」。`;
      if (!noTrans.length) {
        out.push(Check.ok(S, "已认到译文的合集", packs.length,
          `${yes.length}/${packs.length} 个合集**全部**有对应译文文件（没有差额可点名）。`));
      } else if (!suspectOnes.length) {
        out.push(Check.ok(S, "已认到译文的合集", packs.length,
          `${yes.length}/${packs.length} 个合集有对应译文文件。**差的 ${noTrans.length} 个逐个点名如下**，` +
          `**全部是上游自己的空包**（index 0 条，没有可译内容）—— 这是**预期**，不是缺陷。` + tail,
          items));
      } else {
        out.push(Check.warn(S, "已认到译文的合集", packs.length,
          `${yes.length}/${packs.length} 个合集有对应译文文件。**差的 ${noTrans.length} 个逐个点名如下**，` +
          `其中 **${suspectOnes.length} 个不是空包 —— 这几个要看**` +
          (emptyOnes.length ? `（另 ${emptyOnes.length} 个是上游空包，属预期）` : "") + "。" + tail,
          items));
      }
    } else if (cn > 0) {
      // ⚠⚠ 交叉印证：这一行说「一个都没认到」，而索引抽样说屏上是中文 —— **两者不可能同时为真**。
      //   本行**两次**在真实世界里制造过这种自相矛盾的假警报（2026-08-16 读了不存在的
      //   `babele.translations`；2026-08-17 把 `CompendiumCollection` 对象喂给了要字符串的
      //   `isTranslated`）。所以这里**不许再报自信的失败** —— 报矛盾本身，并把矛头指向判据。
      out.push(Check.warn(S, "已认到译文的合集", packs.length,
        `**本行与下一行自相矛盾，先别信本行**：本行算出「${packs.length} 个合集一个都没认到译文」，` +
        `而「合集索引抽样」在同一次运行里抽到 ${cn}/${sampled} 条中文 —— ` +
        `屏上有中文就说明 babele 认到了译文，**两者不可能同时为真**。` +
        `⚠ 本行历史上两次都是**判据自己错**（2026-08-16 读了不存在的属性；2026-08-17 参数类型喂错），` +
        `没有一次是译文真的没生效。**先去核这行代码，别去核译文。**`));
    } else {
      out.push(Check.fail(S, "已认到译文的合集", packs.length,
        `**${packs.length} 个合集一个都没认到译文** —— 合集会全是英文` +
        `（索引抽样这一侧同样没抽到中文，两条互相印证，这次多半是真的）`));
    }
  }

  if (!sampled && !packs.length) {
    out.push(Check.skip(S, "合集索引抽样", "当前世界里没有 ember / crucible 的合集"));
    return out;
  }

  if (!sampled) {
    out.push(Check.skip(S, "合集索引抽样", "所有合集的索引都是空的（还没加载？）"));
  } else if (badPacks.length) {
    // ⚠ 同一条聚合数的点名要求：`badPacks` 只点到「整包无一中文」那一级，
    //   而 `sampled - cn` 这个差额里**还有别的包里零星的英文条目** —— 一并逐条点名。
    out.push(Check.fail(S, "合集索引抽样", sampled,
      `抽 ${sampled} 条、中文 ${cn} 条。**下列合集一条中文都没有**：`,
      badPacks.concat(enNames.length
        ? [`（差额逐条点名 · 抽样里没有中文的 ${enNames.length} 条条目名）`, ...cappedList(enNames)]
        : [])));
  } else if (!enNames.length) {
    out.push(Check.ok(S, "合集索引抽样", sampled,
      `抽 ${sampled} 条，**全部是中文**（100%），没有差额可点名。`));
  } else {
    // ⚠⚠ 与上面「已认到译文的合集」同一类缺陷：`cn/sampled` 分子小于分母时，
    //   光报百分比等于把差额藏起来 —— **「按约定保留英文」与「真的漏译了」在报文上一模一样**。
    //   所以百分比照报，差额**逐条点名**。
    out.push(Check.ok(S, "合集索引抽样", sampled,
      `抽 ${sampled} 条，中文 ${cn} 条（${Math.round(cn / sampled * 100)}%）。` +
      `**其余 ${enNames.length} 条抽样条目名里没有中文，逐条点名如下**：` +
      `⚠ 非 100% 不一定是缺陷 —— 有些条目按约定保留英文原名（见 H 档豁免）；` +
      `**但真的漏译时报出来长得一模一样，所以不许只报一个百分比。**`,
      cappedList(enNames)));
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
  // ⚠⚠ **分母会自己缩水的那一类聚合数。** 取不到的键从前是静静 `continue` 掉的：
  //   报文只写「查 1 条，全部符合既定裁决」，而探针明明有 ${I18N_PROBES.length} 条 ——
  //   少查的那几条**在报文里不留一点痕迹**。「把项挪出视野换一个好看的数」正是本项目
  //   第二十四轮那个假 0 的形态。⇒ 分母（探针总数）照报，**取不到的逐条点名**。
  const absent = [];
  for (const [key, want, why] of I18N_PROBES) {
    const got = game.i18n.localize(key);
    if (got === key) {                  // 该键在当前世界取不到（例如没装 ember），不算错 ——
      absent.push(`\`${key}\` —— **本次没查**（\`localize()\` 原样吐回了键名：相关模块没装，` +
        `或上游把这个键改名/删了）。裁决内容：${why}`);
      continue;                         // …但**必须留名**，不许静静缩小分母
    }
    checked++;
    if (!got.includes(want)) bad.push(`\`${key}\` = 「${got}」，应含「${want}」 —— ${why}`);
  }
  const absentNote = absent.length
    ? `　⚠ 探针共 ${I18N_PROBES.length} 条，**另有 ${absent.length} 条这次取不到、根本没查**` +
      `（**不是通过**），逐条点名见下。`
    : `（探针 ${I18N_PROBES.length} 条**全部**取到了，没有静默少查的。）`;
  if (!checked) {
    out.push(Check.skip(S, "裁决键抽验",
      `探针里的 ${I18N_PROBES.length} 个键在当前世界**一个都取不到**（相关模块没装？）：` +
      absent.map(a => a.split(" —— ")[0]).join(" · ")));
  } else {
    out.push(bad.length
      ? Check.fail(S, "裁决键抽验", checked,
          `查 ${checked}/${I18N_PROBES.length} 条，**${bad.length} 条与裁决不符**：` + absentNote,
          bad.concat(absent))
      : Check.ok(S, "裁决键抽验", checked,
          `查 ${checked}/${I18N_PROBES.length} 条，全部符合既定裁决。` + absentNote, absent));
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
 * @param {Function} [opts.extra] 额外的异步检查（字面量存在性那一档由 ember-hardcoded-cn.mjs
 *   提供，因为只有它拿得到那些表；拿不到时这一档会报 skip 而不是静静跳过）。
 */
export async function runSelfCheck(opts = {}) {
  const checks = [];
  checks.push(...checkEnvironment());
  checks.push(...checkBabele());
  checks.push(...checkI18n());

  // D 字面量存在性：由硬编码表那个模块注入。**拿不到就明说无从查起。**
  if (typeof opts.extra === "function") {
    try {
      const more = await opts.extra();
      if (Array.isArray(more) && more.length) checks.push(...more);
      else checks.push(Check.skip(D_SECTION, "整档", "这一档没有返回任何结果"));
    } catch (err) {
      checks.push(Check.fail(D_SECTION, "整档", 0, `检查本身抛异常：${err?.message ?? err}`));
    }
  } else {
    checks.push(Check.skip(D_SECTION, "整档",
      "硬编码表模块没有注册这一档（`ember-hardcoded-cn.mjs` 没加载？）"));
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
/*  D · 上游字面量存在性（仅供人工复核）          */
/* -------------------------------------------- */

/** 这一档的档名。**别叫「键活性」** —— 理由见下面 `keyLiveness` 的文档注释。 */
const D_SECTION = "D 上游字面量存在性（仅供人工复核）";

/**
 * 这一档的**边界**，写进每一条报文里，免得读的人把「查无此串」当成「键失效」。
 * ⚠ 这句话是硬证据换来的，不许删：
 *   · `Entry Date` 在 `.mjs` 语料里 0 次命中，而它**完全有效**（出处是 codex/journal.hbs）；
 *   · `Cosmological Attunements` 被判「正常」，只因为源码里有个**同名的注释横幅**。
 * 「串在不在文本里」与「键生不生效」之间**没有因果关系**，两个方向都不成立。
 */
const D_BOUNDARY =
  "⚠ 本档核的是**「这个英文串还在不在上游的文本里」**，**不是**「这个键还生不生效」——" +
  "两者没有因果关系（`Entry Date` 源码里 0 次命中却完全有效；`Cosmological Attunements` " +
  "判「正常」只因为源码里有个**同名注释横幅**）。结论**仅供人工复核**，不能直接当缺陷。";

/**
 * 边界之二：**一串是另一串子串的那类改词，本档看不见。**
 * ⚠ 这条是第二十六轮拿 8 条模拟改措辞打出来的：报出 7 条，漏的那条是
 *   `Increase Ability Score` → `Increase Ability` —— 新串完整落在旧串里、两端还都在词边界上。
 *   方向反过来一样漏：上游把 `Increase Ability` 加长成 `Increase Ability Score`，
 *   旧键仍是新串的子串，本档照样报绿。
 *   **所以「8 条改措辞报出 7 条」不能读成「改措辞都接得住」。**
 */
const D_BOUNDARY_SUBSTRING =
  "⚠ **边界之二：一串是另一串子串的那类改词，本档看不见。**" +
  "模拟上游改措辞 8 条只报出 7 条 —— 漏的是 `Increase Ability Score` → `Increase Ability`，" +
  "新串完整落在旧串里、两端仍在词边界上，于是「查得到」；反方向（旧串被加长）同样漏。" +
  "**「7/8 报出」不等于「改措辞都接得住」。**";

/**
 * 边界之三：**Adventure 文档内层的页名，本档结构性查不了。**
 * ⚠⚠ 这条推翻了第二十五轮写在这里的旧说法（「真实 Foundry 里会被合集索引那份语料接住」）。
 *   实证：`Adventure.metadata.compendiumIndexFields` 只有
 *   `_id / name / caption / description / img / sort / folder / flags.core.sheetClass`
 *   （核心 `common/documents/adventure.mjs`）；crucible 只给 **Item**（`crucible-compiled.mjs`
 *   `CONFIG.Item.compendiumIndexFields`）与 **ActiveEffect**（`CONFIG.ActiveEffect` 那处
 *   `Object.assign`）追加过索引字段，ember 一个都没加。⇒ 运行时 `pack.index` 的条目上
 *   **永远没有 `journal`、更没有 `pages`**。
 *   而 `The Abyss` / `Heart of Ember` 恰恰躺在 `journal[].pages[].name`（离线读真 LevelDB 核过：
 *   `ember.crucible-adventure` 只有 1 个文档、75 个 journal、1488 个 page）。
 */
const D_BOUNDARY_ADVENTURE =
  "⚠ **边界之三：来自 Adventure 文档内层页名（`journal[].pages[].name`）的键，本档就是查不了。**" +
  "运行时 `pack.index` 上没有 `pages` 字段（`Adventure.metadata.compendiumIndexFields` 只有 " +
  "`_id/name/caption/description/img/sort/folder/flags.core.sheetClass`；crucible 只给 Item / " +
  "ActiveEffect 追加过索引字段）。这类键会**永远**挂在「查无此串」上 —— 那是本档的**结构性边界**，不是缺陷。";

const EMBER_ROOT = "modules/ember";
/** 源码 / 模板里写死的模板路径。 */
const TPL_LITERAL = /modules\/ember\/templates\/[A-Za-z0-9_./-]+\.(?:hbs|html)/g;
/**
 * **拼出来**的模板路径（`…/${this.pageClass}-edit.hbs`）。
 * ⚠ 连**前缀、插值表达式、后缀**一起抓 —— 旧版只抓到 `…templates/…${` 就完事，
 *   于是只能报一个「另有 1 处」，读者根本不知道那 1 处背后是十几个文件。
 *   抓全了才能按源码里的取值把它**展开成具体候选文件**去试。
 */
const TPL_DYNAMIC = /modules\/ember\/templates\/[A-Za-z0-9_./-]*\$\{([^{}]*)\}[A-Za-z0-9_./-]*\.(?:hbs|html)/g;

/**
 * 上游有一批模板**没有任何脚本 / 模板引用**（死模板）。面板跑在浏览器里、**列不了目录**，
 * 靠「谁引用了它」这条路推**永远推不出它们**。
 *
 * 下面是第二十六轮离线拿磁盘目录比对出来的快照：当时 `modules/ember/templates` 下 67 份
 * .hbs/.html，靠引用（含拼路径展开）能推出 64 份，差的就是这 3 份，被引用次数 **0**。
 *
 * ⚠⚠ **这份清单会过期，而且它过期的时候面板不会知道。** 上游再加一个没人引用的模板，
 *   本档照样推不出、也照样不会报 —— 所以这一路的覆盖率**无法自证完备**，
 *   报文里必须照实写「推不出来的推不出来」，不许拿「都抓到了」蒙过去。
 */
const TPL_UNREFERENCED_SNAPSHOT = [
  "applications/area-effect-config.hbs",
  "applications/storyline-inspector.html",
  "journal/partials/gameplay-features.hbs",
];
/** ember.mjs 里的动态 import：`await import('./crucible-async.mjs')`。 */
const REL_IMPORT = /import\(\s*["'`]\.\/([A-Za-z0-9_.-]+\.mjs)["'`]\s*\)/g;

function addAll(set, text, re) { for (const m of String(text).matchAll(re)) set.add(m[0]); }

/**
 * 从源码里收「`<ident> = "值"`」形式的**取值集合**，用来把拼出来的模板路径展开成具体文件。
 *
 * 例：`…/templates/journal/pages/${this.pageClass}-edit.hbs` 里的 `pageClass`，
 * 取值就明明白白写在同一份 `ember.mjs` 里（`static pageClass = "cosmos"` 之类十几处）。
 *
 * ⚠ 这是**从上游源码本身**读出来的取值，不是我们编的 —— 展开出来的候选路径**逐个真去 fetch**，
 *   抓到才进语料、抓不到照实报。这与「拿数据文件里有某字段去推运行时拿得到该字段」
 *   （本项目登记的空转形态 (h)）不是一回事：那种是伪造输入，这里是**先猜后验**。
 */
function harvestAssignedStrings(text, ident) {
  const out = new Set();
  // 左侧排掉 `.`：`foo.pageClass = "x"` 也算；但 `xpageClass = "x"` 不算（词边界）。
  // ⚠ `$` 是 JS 合法标识符字符**也是**正则元字符，不转义会当场把模式改掉。
  const safe = String(ident).replace(/\$/g, "\\$");
  const re = new RegExp("(?:^|[^A-Za-z0-9_$])" + safe + "\\s*=\\s*[\"']([A-Za-z0-9_.-]+)[\"']", "g");
  for (const m of String(text).matchAll(re)) out.add(m[1]);
  return [...out];
}

/** 相邻字面量相加的胶水：`"a" + "b"`（**折叠空白之后**跨行相加也长这样）。 */
const CONCAT_GLUE = /(["'`])\s*\+\s*\1/g;
/** 模板串里的三元插值：`${x ? "A" : "B"}` —— 要展成两支，不然 `Event ${…}` 两个分支都找不到。 */
const TERNARY_INTERP = /\$\{[^{}"'`]*\?\s*"([^"]*)"\s*:\s*"([^"]*)"\s*\}/g;
/** 其余插值：`${…}` 直接去掉，让插值两侧的固定文字重新挨在一起。 */
const ANY_INTERP = /\$\{[^{}]*\}/g;

/**
 * 从脚本文本**推导**一份「拼接展开」语料。
 *
 * ⚠⚠ 这份语料是**推导**出来的，不是上游真有的文本。所以它单列一份、命中时报文里会写明
 *   「命中在 拼接展开（推导）」—— 证据力比直接命中弱一档。
 *   但它比把这些键误报成「上游删了」强得多：第二十四轮 77 条误报里，
 *   跨行 `+` 相加 5 条、三元插值 4 条，全部栽在没做这一步。
 *
 * 三条变换（都在折叠空白**之后**做，跨行相加因此塌成同一行）：
 *   ① `"a" + "b"` → `"ab"`（上游大量跨行 `+`，例：ember.mjs:61461 / :113771）
 *   ② `${x ? "A" : "B"}` → 各展一支（例：`Event ${event.complete ? "Completed" : "Not Completed"}`）
 *   ③ 其余 `${…}` 去掉
 * ⚠ 做不到的仍然做不到，别指望它包治百病：`clauses.join(" and ")` 拼出来的 `and gain`、
 *   以及插值**值本身**参与构串的（`to rank ${n} (${label})?`）都推不出来 —— 那几条会继续上榜。
 */
function deriveConcatCorpus(text) {
  let s = foldWS(text);
  for (let i = 0; i < 4; i++) {                 // `"a" + "b" + "c"` 要多跑几遍才并完
    const next = s.replace(CONCAT_GLUE, "");
    if (next === s) break;
    s = next;
  }
  // 字面量里的转义引号：`\"The Sheltered Campsite\"` → `"The Sheltered Campsite"`。
  // ⚠ 必须**在合并之后**做 —— 先解转义会把「字面量内部的引号」错当成拼接胶水并进去。
  s = s.replace(/\\(["'`\\])/g, "$1");
  const a = s.replace(TERNARY_INTERP, "$1").replace(ANY_INTERP, "");
  const b = s.replace(TERNARY_INTERP, "$2").replace(ANY_INTERP, "");
  return a + "\n\n" + b;
}

/**
 * 把当前安装的上游**全部**可读文本抓成语料。
 *
 * ⚠⚠ 面板跑在 Foundry 里，**只能 fetch，不能列目录**。所以文件清单只能靠「谁引用了它」推：
 *   ① `module.json` 的 `esmodules` / `languages`；
 *   ② ember.mjs 里的动态 `import('./xxx-async.mjs')`（`crucible-async` / `dnd5e-async`
 *      就是这么进来的 —— 旧版只抓 `ember.mjs`，把它们整整漏在语料外面）；
 *   ③ 已抓到的脚本 / `.hbs` 里出现的 `modules/ember/templates/….hbs` 字面量（递归一层 partial）；
 *   ④ **拼出来的路径按源码里的取值展开**（`${this.pageClass}` → 源码里那十几个 `pageClass = "…"`）；
 *   ⑤ 运行时 `Handlebars.partials` 里已注册的路径（开过的界面才有，只多不少）；
 *   ⑥ `TPL_UNREFERENCED_SNAPSHOT` —— **没人引用的死模板**，上面四路一律推不出，只能靠快照。
 *
 * ⚠ 推不出来的、展不开的、抓失败的，**全部必须报出来**。静默当成「已经全抓到了」正是本项目
 *   登记的空转形态 (e)「输入缺失但判据照跑」；而「没抓到」与「面板说了我没抓到」是两回事。
 *
 * @returns {Promise<{set:object|null, rows:string[], tried:number, failed:string[], dynamic:number,
 *                    tpl:object, advPacks:string[]}>}
 */
async function collectUpstreamCorpora() {
  const rows = [], failed = [];
  const corpora = [];
  let tried = 0, dynamic = 0;

  const grabAll = async (paths, label, tier = CORPUS_TIER.direct) => {
    const texts = [];
    for (const p of paths) {
      tried++;
      const t = await fetchText(p);
      if (t === null) { failed.push(p); continue; }
      texts.push(t);
    }
    if (!texts.length) return null;
    const joined = texts.join("\n");
    corpora.push(makeCorpus(joined, label, tier));
    rows.push(`${label}：${texts.length}/${paths.length} 份，共 ${Math.round(joined.length / 1024)} KB`);
    return joined;
  };

  // ── ① module.json：脚本与语言文件的**声明**出处 ──
  tried++;
  const manifestText = await fetchText(`${EMBER_ROOT}/module.json`);
  let manifest = null;
  if (manifestText === null) failed.push(`${EMBER_ROOT}/module.json`);
  else { try { manifest = JSON.parse(manifestText); } catch (_) { failed.push(`${EMBER_ROOT}/module.json（不是合法 JSON）`); } }

  // ── ② 脚本：声明的 esmodules ＋ 它们动态 import 的兄弟文件 ──
  const scriptPaths = new Set();
  for (const rel of (manifest?.esmodules ?? [])) scriptPaths.add(`${EMBER_ROOT}/${rel}`);
  if (!scriptPaths.size) scriptPaths.add(`${EMBER_ROOT}/scripts/ember.mjs`);   // manifest 读不到时的兜底

  const scriptTexts = [];
  for (let round = 0; round < 2; round++) {           // 一轮抓、一轮把新发现的兄弟文件补上
    for (const p of [...scriptPaths]) {
      if (scriptTexts.some(([q]) => q === p)) continue;
      tried++;
      const t = await fetchText(p);
      if (t === null) { failed.push(p); continue; }
      scriptTexts.push([p, t]);
      const dir = p.slice(0, p.lastIndexOf("/") + 1);
      for (const m of t.matchAll(REL_IMPORT)) scriptPaths.add(dir + m[1]);
    }
  }
  if (scriptTexts.length) {
    const joined = scriptTexts.map(([, t]) => t).join("\n");
    corpora.push(makeCorpus(joined, "ember 脚本", CORPUS_TIER.direct));
    rows.push(`ember 脚本：${scriptTexts.map(([p]) => p.split("/").pop()).join(" · ")}` +
              `（共 ${Math.round(joined.length / 1024)} KB）`);
  }

  // ── ③ 语言文件 ──
  const langPaths = (manifest?.languages ?? []).map(l => `${EMBER_ROOT}/${l.path}`);
  if (langPaths.length) await grabAll(langPaths, "ember lang");

  // ── ④ 模板 ──
  //   ⚠ 面板列不了目录，模板清单只能靠「谁引用了它」推。这里把能走的路都走一遍，
  //     并且**每一路各自记账**，最后如实报「哪一路推出了多少、哪一路根本推不出来」。
  const scriptAll = scriptTexts.map(([, t]) => t).join("\n");
  const tplPaths = new Set();
  const dynExprs = [];
  for (const [, t] of scriptTexts) {
    addAll(tplPaths, t, TPL_LITERAL);
    for (const m of t.matchAll(TPL_DYNAMIC)) dynExprs.push({ whole: m[0], expr: m[1] });
  }
  dynamic = dynExprs.length;                    // ⚠ 这是**路径表达式**个数，不是文件数
  try {
    for (const k of Object.keys(globalThis.Handlebars?.partials ?? {})) {
      if (typeof k === "string" && k.startsWith(`${EMBER_ROOT}/templates/`)) tplPaths.add(k);
    }
  } catch (_) { /* 没有 Handlebars 就只靠字面量推 */ }

  const tplTexts = [];
  const seenTpl = new Set();
  /** @returns {"ok"|"fail"|"dup"} 抓一份模板并入语料。**每一路自己拿 bucket 记账。** */
  const grabTpl = async (p, bucket) => {
    if (seenTpl.has(p)) return "dup";
    seenTpl.add(p);
    tried++;
    const t = await fetchText(p);
    if (t === null) { bucket.push(p); return "fail"; }
    tplTexts.push(t);
    addAll(tplPaths, t, TPL_LITERAL);           // .hbs 里写全路径的 partial 引用
    return "ok";
  };

  // ④a 字面量 / 运行时 partial 推出来的（第二轮把 .hbs 里引到的 partial 补上）
  let litOk = 0;
  for (let round = 0; round < 2; round++) {
    for (const p of [...tplPaths]) if (await grabTpl(p, failed) === "ok") litOk++;
  }

  // ④b **拼路径展开**：`…/${this.pageClass}-edit.hbs` 里的 `pageClass`，
  //     取值就写在同一份源码里（`static pageClass = "cosmos"` 之类），逐个代进去试。
  //     ⚠ 展开出来的候选**抓不到是正常的**（基类那个占位取值本来就没有对应文件），
  //       所以单独记账、不混进 `failed`，但**必须报出来是哪几个没抓到**。
  const dynCandidates = [], dynMiss = [], dynUnexpandable = [];
  for (const { whole, expr } of dynExprs) {
    const ident = (expr.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []).pop();
    const vals = ident ? harvestAssignedStrings(scriptAll, ident) : [];
    if (!vals.length) { dynUnexpandable.push(whole); continue; }
    for (const v of vals) dynCandidates.push(whole.replace(ANY_INTERP, v));
  }
  let dynOk = 0;
  for (const p of dynCandidates) if (await grabTpl(p, dynMiss) === "ok") dynOk++;

  // ④c **没人引用的死模板** —— 上面三路一律推不出来，只能靠快照清单（见其文档注释）。
  const unrefMiss = [];
  let unrefOk = 0;
  for (const rel of TPL_UNREFERENCED_SNAPSHOT) {
    if (await grabTpl(`${EMBER_ROOT}/templates/${rel}`, unrefMiss) === "ok") unrefOk++;
  }

  const tpl = {
    dynExprs: dynExprs.length, dynCandidates: dynCandidates.length, dynOk,
    dynMiss: dynMiss.map(p => p.split("/").pop()), dynUnexpandable: dynUnexpandable.length,
    unrefTried: TPL_UNREFERENCED_SNAPSHOT.length, unrefOk,
    unrefMiss: unrefMiss.map(p => p.split("/").pop()),
    litOk, files: tplTexts.length
  };

  if (tplTexts.length) {
    const joined = tplTexts.join("\n");
    corpora.push(makeCorpus(joined, "ember 模板", CORPUS_TIER.direct));
    rows.push(`ember 模板：抓到 **${tplTexts.length} 份** .hbs/.html，共 ${Math.round(joined.length / 1024)} KB` +
      `（引用推导 ${litOk} 份 · 拼路径展开 ${dynOk} 份 · 无引用快照 ${unrefOk} 份）`);
  }
  rows.push(
    `⚠ 模板这一路**列不了目录**，清单只能靠引用推，三路各自的账：` +
    `① 拼出来的模板路径 **${dynExprs.length} 处路径表达式**（⚠ 这个数**不是文件数** —— ` +
    `旧版只报「另有 1 处」，读者无从知道背后是十几个文件），已按源码里的取值展开成 ` +
    `**${dynCandidates.length} 个候选文件**，抓到 ${dynOk} 份、${dynMiss.length} 份不存在` +
    `（${tpl.dynMiss.join(" · ") || "无"}）；另有 ${dynUnexpandable.length} 处展不开。` +
    `② 无引用死模板靠快照清单兜 ${TPL_UNREFERENCED_SNAPSHOT.length} 条，抓到 ${unrefOk} 份` +
    `${unrefMiss.length ? `、${unrefMiss.length} 份已不在上游（${tpl.unrefMiss.join(" · ")}）` : ""}。` +
    `③ ⚠⚠ **从未被任何脚本 / 模板引用的模板，本档推不出来，而且推不出来的时候它不会知道** —— ` +
    `快照清单会过期，这一路的覆盖率**无法自证完备**。别把「模板都抓到了」当成已经成立的事。`);

  // ── ⑤ 当前系统的源码（dnd5e 侧的表全靠它，只抓 ember 会把它们整批误报成失效）──
  let sysText = "";
  const sys = game.system?.id;
  if (sys === "crucible" || sys === "dnd5e") {
    for (const path of [`systems/${sys}/${sys}-compiled.mjs`, `systems/${sys}/${sys}.mjs`]) {
      tried++;
      const t = await fetchText(path);
      if (t === null) { failed.push(path); continue; }
      corpora.push(makeCorpus(t, `${sys} 系统源码`, CORPUS_TIER.direct));
      rows.push(`${sys} 系统源码：${Math.round(t.length / 1024)} KB`);
      sysText = t;
      break;
    }
  }

  // ── ⑥ 合集索引里的条目名 ──
  //
  // ⚠⚠ 这里**删掉了一条永远空转的分支**（第二十六轮）。旧版写的是：
  //       for (const e of (p.index ?? [])) {
  //         if (typeof e.name === "string") names.push(e.name);
  //         for (const pg of (e.pages ?? [])) …          // ← 这一行**永远拿不到东西**
  //       }
  //   `pack.index` 上有哪些字段，由 `<Document>.metadata.compendiumIndexFields` 加上
  //   `CONFIG.<Document>.compendiumIndexFields` 决定。核对过当前安装的这三处：
  //     · `Adventure.metadata.compendiumIndexFields` =
  //       `_id / name / caption / description / img / sort / folder / flags.core.sheetClass`
  //       （核心 `common/documents/adventure.mjs`）—— **没有 `journal`，更没有 `pages`**；
  //     · crucible 只追加过 `CONFIG.Item.compendiumIndexFields = ["system.identifier"]`
  //       和 `CONFIG.ActiveEffect` 那处 `["system.identifier","system.affixType"]`；
  //     · ember 一处都没追加；且 ember 的 10 个合集全是 Item / Adventure / ActiveEffect，
  //       没有 JournalEntry 合集（JournalEntry 的索引字段也只有 `_id/name/sort/folder`）。
  //   ⇒ `e.pages` 恒为 undefined，那一路**一次都没跑过**。
  //
  // ⚠ 第二十五轮写在这里的「真实 Foundry 里 `The Abyss` 会被这一路接住」**已被证伪**，
  //   不许再出现。`The Abyss` / `Heart of Ember` 躺在 Adventure 文档**内层**的
  //   `journal[].pages[].name`（离线读真 LevelDB 核过：`ember.crucible-adventure` 1 个文档、
  //   75 个 journal、1488 个 page），运行时 index 拿不到 —— 见 `D_BOUNDARY_ADVENTURE`。
  //
  // ⚠ 那为什么不干脆 `getDocuments()` 去读内层？因为**那不是「真查」**：babele 包住了
  //   `CONFIG.DatabaseBackend._getDocuments`，读回来的是**我们自己译过**的文本，
  //   而本项目的条目名约定是双语并列（`深渊 The Abyss`）—— 于是「找到了 The Abyss」
  //   找到的是**我们自己译文里那半截英文**。那是自证循环，比一条老实的 ⛔ 更糟。
  const advPacks = [];
  try {
    const names = [];
    for (const p of (game.packs ?? [])) {
      const src = p.metadata?.packageName ?? p.metadata?.package;
      if (src !== "ember" && src !== "crucible") continue;
      const docType = p.documentName ?? p.metadata?.type;
      if (docType === "Adventure") advPacks.push(p.collection ?? p.metadata?.name ?? "?");
      for (const e of (p.index ?? [])) if (typeof e.name === "string") names.push(e.name);
    }
    if (names.length) {
      corpora.push(makeCorpus(names.join("\n"), "合集索引条目名", CORPUS_TIER.packIndex));
      rows.push(`合集索引条目名：${names.length} 条。⚠ 这一路是 **babele 译后**的文本，` +
        `命中它的键要按第 2 档证据看（双语条目名会让「找到英文串」变成自证循环）。`);
    } else {
      rows.push("合集索引条目名：**0 条**（合集没加载或世界里没有 ember/crucible 合集）—— 这一路没查成");
    }
  } catch (_) { rows.push("合集索引条目名：读不到 `game.packs`，这一路没查成"); }

  // ── ⑦ 拼接展开（**推导**语料，放在最后一份 —— 直接命中优先，命中它说明证据弱一档）──
  const rawJs = scriptTexts.map(([, t]) => t).join("\n") + (sysText ? "\n" + sysText : "");
  if (rawJs) {
    const derived = deriveConcatCorpus(rawJs);
    corpora.push(makeCorpus(derived, "拼接展开（推导）", CORPUS_TIER.derived));
    rows.push(`拼接展开（推导）：由脚本推导，${Math.round(derived.length / 1024)} KB。` +
      `⚠ 这份**不是上游真有的文本**（相邻字面量相加 / 三元插值展开 / 去掉 \`\${…}\`）——` +
      `命中在这一份上的键，证据力比直接命中弱一档，报文里会**逐键点名**。`);
  }

  return { set: corpora.length ? makeCorpusSet(corpora) : null, rows, tried, failed, dynamic, tpl, advPacks };
}

/**
 * 合集文档的 `system.identifier` 集合。`MISSING_ANCESTRIES` 那几张表的键是 identifier，
 * **不是显示串也不是 .mjs 里的 id** —— 拿源码 grep 两个方向都证不了（第二十四轮：
 * 11 条「上游现在提供了」11/11 是误报）。面板本来就跑在 Foundry 里，index 是现成的。
 */
function packIdentifiers(only) {
  const ids = new Set();
  let scanned = 0, packs = 0;
  for (const p of (game.packs ?? [])) {
    const src = p.metadata?.packageName ?? p.metadata?.package;
    if (src !== "ember" && src !== "crucible") continue;
    if (only?.length && !only.includes(p.collection) && !only.includes(p.metadata?.name)) continue;
    packs++;
    for (const e of (p.index ?? [])) {
      scanned++;
      const id = e?.system?.identifier;
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return { ids, scanned, packs };
}

/**
 * 把硬编码表里的每个**英文键**，拿去当前安装的上游文本里核一遍**在不在**。
 *
 * ⚠⚠ 档名从「键活性」改成了「上游字面量存在性」，这不是措辞洁癖 ——
 * 旧名把「串在文本里」说成了「键还活着」，而这一档做的只是**子串存在性**，
 * 两者之间没有因果关系（两个方向都有硬反例，见 `D_BOUNDARY`）。
 * 叫错名字的直接后果就是第二十四轮那 77 条「上游查无此串」被当成了真缺陷去追。
 *
 * 它仍然有用，用法是：**「查无此串」是一条值得人去看一眼的线索**，仅此而已。
 *
 * 支持的 `kind`（表按「串本来该出现在哪」分流，而不是靠白名单把键挪出视野）：
 *   · `literal`（默认）  串应当写在脚本 / 模板 / lang 里，拿语料核
 *   · `composed`         运行时拼出来的，字面量核对无效
 *   · `data`             键来自数据文件；`spec.corpus` 写明是哪一路
 *   · `field-path`       键是**字段路径**（`schema.getField()` 的实参）不是显示串
 *   · `pack-identifier`  键是合集文档的 `system.identifier`，查 `game.packs` 的 index
 *   · `absent-by-design` 反向判据：本表正因「上游缺这些」而建，**找到了**才是信号
 * 另有键级 `spec.keyKinds = { "The Abyss": "data" }` —— 同一张表里个别键来路不同时用它，
 * 不必为了一个键把整张表标成 data。
 */
export async function keyLiveness(tables) {
  const S = D_SECTION;
  if (!tables || !Object.keys(tables).length) {
    return [Check.skip(S, "整档", "没拿到任何硬编码表")];
  }

  const { set: corpus, rows, tried, failed, dynamic, tpl, advPacks } = await collectUpstreamCorpora();
  if (!corpus) {
    return [Check.skip(S, "整档",
      `抓不到任何上游文本（试了 ${tried} 个路径，全部失败）—— **这一档这次什么都没查**。` +
      `常见原因：上游没装、路径变了、或浏览器拦了 fetch。`)];
  }

  const srcNote = [...rows];
  if (failed.length) srcNote.push(`⚠ 抓失败 ${failed.length} 个：${failed.slice(0, 12).join(" · ")}${failed.length > 12 ? " …" : ""}`);

  const out = [Check.ok(S, "上游语料", tried,
    `试抓 ${tried} 个路径，成功建成 ${corpus.corpora.length} 份语料` +
    `（模板 ${tpl?.files ?? 0} 份，其中拼路径展开来的 ${tpl?.dynOk ?? 0} 份、` +
    `无引用快照捞回来的 ${tpl?.unrefOk ?? 0} 份）。` + D_BOUNDARY, srcNote)];

  // ⛔ Adventure 内层页名：**结构性查不了**，如实标死，绝不报绿。
  //   （离线跑时 `game.packs` 是空的、认不出 Adventure 合集，那就不出这一条 ——
  //     宁可不说，也不许编一条「已经查过了」。永久边界另有一条写在合计里。）
  if (advPacks?.length) {
    out.push(Check.skip(S, "Adventure 内层页名",
      `世界里有 ${advPacks.length} 个 Adventure 合集（${advPacks.join(" · ")}）。` +
      `它们内层 \`journal[].pages[].name\` 上的串，**本档查不了、也不打算假装查得了**：` +
      `运行时 \`pack.index\` 的条目上没有 \`pages\` 字段（\`Adventure.metadata.compendiumIndexFields\` ` +
      `只有 \`_id/name/caption/description/img/sort/folder/flags.core.sheetClass\`；` +
      `crucible 只给 Item / ActiveEffect 追加过索引字段，ember 一处都没加）。` +
      `⚠ 也**不走 \`getDocuments()\`**：babele 包住了 \`CONFIG.DatabaseBackend._getDocuments\`，` +
      `读回来的是我们自己译过的双语文本（\`深渊 The Abyss\`），拿它证「上游还有这个英文串」` +
      `是**自证循环** —— 那种绿比这条 ⛔ 更糟。出处在这一层的键（如同调页名）会永远挂在` +
      `「查无此串」上，**那是本档的边界，不是缺陷**。`));
  }

  /* ── 记账台账（第三十一轮 · V14 归因的产物）──────────────────────────────
        为什么要有这一份：面板自报的 `checkedDistinct` 长期**没有分母**。外面的人拿
        「表里一共多少个键」去对 719，对不上就只能当成「面板悄悄少核了一批」——
        V14 那条「面板 719/1273 vs 表侧 721/1304」挂了三轮，最后查出来差的
        **2 个 distinct / 31 条 raw 根本不是键**：外面那份计数器直接 `Object.keys(spec)`，
        把 `{ table, kind, onlyOn, packs, corpus }` 这五个**元数据属性名**当成了翻译键
        （34 条伪键），再减去它反而没看见的 `MISSING_LANGUAGES` 那 3 个真键
        （它们藏在 `spec.table` 里面），34 − 3 = 31 / 5 − 3 = 2，一分不差。
        ⇒ 治本的办法不是去改哪一侧的数，而是**让面板自己把账列平**：
          登记的真实键 = 已核 + 按设计没核（逐表点名 + 逐条写明为什么）。
        ⚠ 这份台账只增加信息，**不参与 `checkedDistinct` 的计算** —— 被核键数一个不减。 */
  const regDistinct = new Set();       // 登记的真实键（穿过 `{table,…}` 包装看里面那张表）
  let regRawLiteral = 0, regRawRegex = 0, regArrTables = 0, wrappedTables = 0;
  const realKeysOf = new Map();        // 表名 → 真实键数组
  const skipWhyOf = new Map();         // 表名 → 这张表（这一批键）没进计数的原因
  const contributed = new Map();       // 表名 → 实际计进 rawChecked 的条数

  /* ── 第一趟：决定每张表怎么核（不产出报文），顺便把要 grep 的键收集起来做去重 ── */
  const plan = [];
  for (const [name, spec] of Object.entries(tables)) {
    const table = spec?.table ?? spec;
    const onlyOn = spec?.onlyOn ?? null;
    const kind = spec?.kind ?? "literal";
    const keyKinds = spec?.keyKinds ?? {};

    // 台账登记：**在任何 continue 之前**，先把这张表里的真实键记下来。
    //   放到后面记就会跟着 continue 一起漏掉 —— 那正是本项目登记的「摘出视野」老毛病。
    if (spec && !Array.isArray(spec) && typeof spec === "object"
        && Object.prototype.hasOwnProperty.call(spec, "table")) wrappedTables++;
    if (Array.isArray(table)) { regArrTables++; regRawRegex += table.length; }
    else {
      const rk = Object.keys(table ?? {});
      realKeysOf.set(name, rk);
      regRawLiteral += rk.length;
      for (const k of rk) regDistinct.add(k);
    }

    if (onlyOn && game.system?.id !== onlyOn) { skipWhyOf.set(name, `\`onlyOn: ${onlyOn}\`，当前世界是 \`${game.system?.id}\``); plan.push({ name, mode: "skip", why: `按设计只在 \`${onlyOn}\` 系统下生效，当前是 \`${game.system?.id}\`` }); continue; }
    if (Array.isArray(table)) { plan.push({ name, mode: "skip", why: "正则表，无法用字面量核对（要核得跑真实输入）" }); continue; }
    const allKeys = Object.keys(table ?? {});
    if (!allKeys.length) { skipWhyOf.set(name, "空表"); plan.push({ name, mode: "skip", why: "空表" }); continue; }

    // 键级分流：同一张表里个别键来路不同（如 `The Abyss` / `Heart of Ember` 是合集页名）
    const diverted = allKeys.filter(k => keyKinds[k]);
    const keys = allKeys.filter(k => !keyKinds[k]);

    if (kind === "composed") { skipWhyOf.set(name, "`kind: composed` —— 运行时拼出来的串，上游文本里本来就没有这个字面量"); plan.push({ name, mode: "skip", n: allKeys.length, why: `${allKeys.length} 键是**运行时拼出来**的（如 \`\${月亮} Attunement (Rank \${N})\`），上游文本里本来就不会有这个字面量 —— 字面量核对对它无效，不是失效。` }); continue; }
    if (kind === "data") { skipWhyOf.set(name, `\`kind: data\` —— 键来自数据文件（${spec?.corpus ?? "合集 / JSON"}），不在本档的语料里`); plan.push({ name, mode: "skip", n: allKeys.length, why: `${allKeys.length} 键来自**数据文件**（${spec?.corpus ?? "合集 / JSON"}）而不是脚本或模板 —— 拿当前语料核不出来，不是失效。` }); continue; }
    if (kind === "field-path") { skipWhyOf.set(name, "`kind: field-path` —— 键是 `schema.getField()` 的实参，不是上屏显示串（该核的是配对的英文 label 表）"); plan.push({ name, mode: "skip", n: allKeys.length, why: `${allKeys.length} 键是**字段路径**（\`schema.getField()\` 的实参，如 \`illumination.blurStrength\`），不是上屏的显示串 —— 上游文本里当然没有整串。该核的是**配对的英文 label 表**（如 \`VISTA_PLACEMENT_EN\`），把那张表另行登记即可。` }); continue; }
    // ⚠ 键级分流把整张表都分流光了 → 这一档对它**一个键都没核**，报 skip。
    //   放任它走下去会得到一条「0 键全部仍能找到」的绿 —— 那正是本项目最忌的「0 项报绿」。
    if (!keys.length) { skipWhyOf.set(name, "键全部被 `keyKinds` 分流出去了，本表这一档一个键都没核"); plan.push({ name, mode: "skip", why: `${allKeys.length} 个键全部按 \`keyKinds\` 分流出去了，本表这一档**一个键都没核**` }); continue; }
    // 部分键被 `keyKinds` 分流：整表仍然核，但那几个键不进计数 —— 台账里要说得出是哪一批。
    if (diverted.length) skipWhyOf.set(name, `其中 ${diverted.length} 个键按 \`keyKinds\` 分流（${[...new Set(diverted.map(k => keyKinds[k]))].join(" / ")}），不走本表的语料`);
    if (kind === "pack-identifier") { plan.push({ name, mode: "packid", keys, diverted, keyKinds, spec }); continue; }
    if (kind === "absent-by-design") { plan.push({ name, mode: "absent", keys, diverted, keyKinds }); continue; }
    plan.push({ name, mode: "literal", keys, diverted, keyKinds });
  }

  /* ── D4 展开表去重：`{...ATTUNEMENTS}` 被四张表各继承一份，同一个源键会在面板上
        变成 4 条独立线索，制造「四表同时失效不可能是巧合」的错觉（主控上一轮就被带偏了）。
        这里按键归并：报文里标出「另 N 张表重复登记」，合计只算**去重后**的条数。 ── */
  const ownersF = new Map(), ownersR = new Map();
  for (const p of plan) {
    const m = p.mode === "literal" ? ownersF : (p.mode === "absent" || p.mode === "packid") ? ownersR : null;
    if (!m) continue;
    for (const k of p.keys) { if (!m.has(k)) m.set(k, []); m.get(k).push(p.name); }
  }
  const dupNote = (m, k, self) => {
    const others = (m.get(k) ?? []).filter(n => n !== self);
    return others.length ? `（同一个源键另在 ${others.length} 张表重复登记：${others.slice(0, 4).join("、")}${others.length > 4 ? " …" : ""}）` : "";
  };

  /* ── 第二趟：出报文 ── */
  const missDistinct = new Set(), checkedDistinct = new Set();
  const foundWhere = new Map();          // 语料标签 → 命中数，用来说明「证据是哪一路给的」
  const foundKeys = new Map();           // 语料标签 → 命中的键（弱档要**逐键点名**，不许只进总数）
  const weakShort = new Set();           // 短词命中：证据力≈0，必须单独标出来
  let rawChecked = 0, rawMiss = 0;

  for (const p of plan) {
    if (p.mode === "skip") { out.push(Check.skip(S, p.name, p.why)); continue; }

    if (p.diverted?.length) {
      out.push(Check.skip(S, `${p.name} · 键级分流`,
        `${p.diverted.length} 个键按 \`keyKinds\` 另行归类（${[...new Set(p.diverted.map(k => p.keyKinds[k]))].join(" / ")}），` +
        `不走本表的语料：${p.diverted.map(k => `\`${k}\``).join(" · ")}`));
    }

    if (p.mode === "packid") {
      const { ids, scanned, packs } = packIdentifiers(p.spec?.packs);
      if (!scanned || !ids.size) {
        skipWhyOf.set(p.name, `\`kind: pack-identifier\`，但这次扫了 ${packs} 个合集 / ${scanned} 条索引只取到 ${ids.size} 个 identifier —— **无从查起**（离线跑必然如此）`);
        out.push(Check.skip(S, p.name,
          `键是合集文档的 \`system.identifier\`。扫了 ${packs} 个合集 / ${scanned} 条索引，` +
          `**取到 ${ids.size} 个 identifier** —— 合集没加载、或 index 里没有 \`system.identifier\` 字段，` +
          `本表这次**无从查起**（⚠ 不是「键都还在」）。`));
        continue;
      }
      const found = p.keys.filter(k => ids.has(k));
      for (const k of p.keys) checkedDistinct.add(k);
      rawChecked += p.keys.length;
      contributed.set(p.name, (contributed.get(p.name) ?? 0) + p.keys.length);
      out.push(found.length
        ? Check.warn(S, p.name, p.keys.length,
            `${p.keys.length} 键（合集 identifier），在 ${packs} 个合集 / ${ids.size} 个 identifier 里` +
            `**找到 ${found.length} 个** —— 本表是为「上游缺这些」而建的，上游补上之后我们的兜底` +
            `可能变成多余甚至冲突，**该复核了**。`,
            found.map(k => `\`${k}\`${dupNote(ownersR, k, p.name)}`))
        : Check.ok(S, p.name, p.keys.length,
            `${p.keys.length} 键在 ${packs} 个合集 / ${ids.size} 个 identifier 里一个都没有 ——` +
            `本表是为此而建的，**这才是预期状态**。（这一条是**真的查了数据**，不是拿源码 grep 猜。）`));
      continue;
    }

    if (p.mode === "absent") {
      const found = p.keys.filter(k => corpus.has(k));
      for (const k of p.keys) checkedDistinct.add(k);
      rawChecked += p.keys.length;
      contributed.set(p.name, (contributed.get(p.name) ?? 0) + p.keys.length);
      out.push(found.length
        ? Check.warn(S, p.name, p.keys.length,
            `${p.keys.length} 键，**${found.length} 个上游现在提供了** —— 本表是为「上游缺这些」而建的，` +
            `上游补上之后我们的兜底可能变成多余甚至冲突，**该复核了**。` +
            "（命中已按**词边界**判定，Oaken / Bejak 那种嵌在长词里的偶然命中不再算数。）",
            found.map(k => `\`${k}\`（命中在${corpus.find(k)}）${dupNote(ownersR, k, p.name)}`))
        : Check.ok(S, p.name, p.keys.length,
            `${p.keys.length} 键上游仍然没有 —— 本表是为此而建的，**这才是预期状态**（找不到＝正常）`));
      continue;
    }

    // literal
    const miss = [];
    const weakHere = [], derivedHere = [], packIdxHere = [];
    contributed.set(p.name, (contributed.get(p.name) ?? 0) + p.keys.length);
    for (const k of p.keys) {
      checkedDistinct.add(k);
      rawChecked++;
      const where = corpus.find(k);
      if (where === null) { miss.push(k); missDistinct.add(k); rawMiss++; }
      else {
        foundWhere.set(where, (foundWhere.get(where) ?? 0) + 1);
        if (!foundKeys.has(where)) foundKeys.set(where, new Set());
        foundKeys.get(where).add(k);
        const tier = corpus.tierOf(where);
        if (tier === 3) derivedHere.push(k);
        if (tier === 2) packIdxHere.push(k);
        if (isWeakShortWord(k)) { weakShort.add(k); weakHere.push(k); }
      }
    }
    // ⚠ **这张表这一行自己的证据力**。`VISTA_PLACEMENT_LABELS_EN` 那条「14/14 通过」里
    //   有 `Sort` / `Only` / `Tint` / `Angle` / `Alpha` 这种短词 —— 不在本行标出来，
    //   读者看到的就是一条满分的绿。弱证据必须**贴着那条绿**写，写在总表末尾没人会翻回来对。
    const shortList = (a) => a.slice(0, 12).map(k => `\`${k}\``).join(" · ") + (a.length > 12 ? ` …另 ${a.length - 12} 个` : "");
    let weakNote = "";
    if (weakHere.length) weakNote += `　⚠ 其中 **${weakHere.length} 键是短词**（${shortList(weakHere)}）——` +
      `这类词在几 MB 源码里**必然**独立成词地巧合出现，**它们的「通过」证据力≈0**，别当证据用。`;
    if (derivedHere.length) weakNote += `　⚠ 另有 **${derivedHere.length} 键只命中在「拼接展开（推导）」语料**` +
      `（${shortList(derivedHere)}）—— 那份语料是我们推出来的，不是上游真有的文本，证据弱一档。`;
    if (packIdxHere.length) weakNote += `　⚠ 另有 **${packIdxHere.length} 键只命中在「合集索引条目名」**` +
      `（${shortList(packIdxHere)}）—— 那是 babele **译后**的文本，双语条目名会让这条绿变成自证循环。`;

    out.push(miss.length
      ? Check.warn(S, p.name, p.keys.length,
          `${p.keys.length} 键，**${miss.length} 个在上游文本里查无此串**。` +
          `⚠ 这是**线索不是结论** —— 出处若是拼接串 / 拼路径的模板 / 数据文件，查不到都是正常的：` + weakNote,
          miss.slice(0, 40).map(k => `\`${k}\`${dupNote(ownersF, k, p.name)}`).concat(miss.length > 40 ? [`…另 ${miss.length - 40} 个`] : []))
      : Check.ok(S, p.name, p.keys.length, `${p.keys.length} 键全部仍能在上游文本里找到。` + weakNote));
  }

  /* ── 证据力分档：同样是绿，强弱天差地别，报文里必须显示出来 ──
        · 第 2 / 3 档（合集索引 / 拼接展开）**逐键点名** —— 只进总数等于把弱证据藏进大数里；
        · 短词命中是**正交**的减分项，可以叠在任何一档上，叠上之后那条绿约等于零。 */
  const NAME_CAP = 24;
  const nameList = (keys) => {
    const a = [...keys];
    return a.slice(0, NAME_CAP).map(k => `\`${k}\``).join(" · ") + (a.length > NAME_CAP ? ` …另 ${a.length - NAME_CAP} 个` : "");
  };
  const evidence = ["**证据力分档**：直接命中 ＞ 合集索引 ＞ 拼接展开（推导） ＞ 短词命中（≈0）。"];
  for (const t of [1, 2, 3]) {
    const labels = [...foundWhere].filter(([lab]) => corpus.tierOf(lab) === t);
    if (!labels.length) continue;
    const n = labels.reduce((a, [, v]) => a + v, 0);
    let line = `第 ${t} 档 · ${TIER_LABEL[t]}：**${n} 键**（${labels.map(([lab, v]) => `${lab} ${v}`).join(" · ")}）`;
    if (t !== 1) {
      const ks = new Set();
      for (const [lab] of labels) for (const k of (foundKeys.get(lab) ?? [])) ks.add(k);
      line += `。逐键：${nameList(ks)}`;
    }
    evidence.push(line);
  }
  // ⚠ **按长度从短到长排** —— 最短的就是最不可信的，截断时先给读者看最该怀疑的那几个
  //   （`Sort` / `Only` / `Tint` 这种四字母词要是被截到列表外面，等于没标）。
  const weakSorted = [...weakShort].sort((a, b) => a.length - b.length || a.localeCompare(b));
  evidence.push(weakShort.size
    ? `⚠ **短词命中 ${weakShort.size} 键，证据力≈0**（这一项与上面的档位**叠加**，不是另一批键；按长度从短到长排）：` +
      `${nameList(weakSorted)}。这些键短到几 MB 源码里**必然**独立成词地巧合出现 —— ` +
      `加了词边界也一样。它们的「通过」**不要当证据用**，要验只能人工到界面上看那个标签。`
    : "短词命中：0 键（本次没有短到证据力可疑的键命中）。");
  evidence.push(D_BOUNDARY_SUBSTRING);
  evidence.push(D_BOUNDARY_ADVENTURE);

  /* ── 记账口径：把 719 这个数**对上账** ──────────────────────────────────
        登记的真实键（穿过 `{table,…}` 包装）＝ 本档核了的 ＋ 本档按设计没核的。
        逐表点名 + 逐条写明为什么没核 —— 读者不必再去猜「差的那几条是不是被吞了」。
        ⚠ 这里只做**加法**：`checkedDistinct` 一个键都没动。 */
  const ledger = [];
  let uncheckedRaw = 0;
  for (const [name, rk] of realKeysOf) {
    const n = rk.length - (contributed.get(name) ?? 0);
    if (n <= 0) continue;
    uncheckedRaw += n;
    ledger.push({ name, n, why: skipWhyOf.get(name) ?? "（无登记原因 —— 这本身就是个洞，见下）" });
  }
  const uncheckedDistinct = [...regDistinct].filter(k => !checkedDistinct.has(k));
  ledger.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  // 交叉记账：登记 = 已核 + 没核。对不上就是本函数自己的记账坏了，**当场说出来**，
  // 不许让一个自洽但错的数流出去（本项目吃过「数字变好但没有覆盖数」的亏）。
  const ledgerBalanced = (rawChecked + uncheckedRaw === regRawLiteral);
  const noReason = ledger.filter(r => !skipWhyOf.has(r.name));

  const ledgerLines = [
    `**记账口径（登记 → 已核）**：表里登记的字面量键 **raw ${regRawLiteral} / distinct ${regDistinct.size}**` +
    `（另有 ${regArrTables} 张正则表共 ${regRawRegex} 条，键不是字面量，本档结构上核不了）。` +
    `其中本档**实际核了 raw ${rawChecked} / distinct ${checkedDistinct.size}**，` +
    `**按设计没核 raw ${uncheckedRaw} / distinct ${uncheckedDistinct.length}**。` +
    (ledgerBalanced ? `（${rawChecked} + ${uncheckedRaw} = ${regRawLiteral}，账是平的。）`
                    : `　⚠⚠ **账没平**：${rawChecked} + ${uncheckedRaw} ≠ ${regRawLiteral} —— 本函数自己的记账坏了，这一档的数**全部不可信**。`),
    `⚠ **拿外面的数来对账之前先看这一条**：`
    + `\`SELFCHECK_TABLES\` 里有 ${wrappedTables} 张表是 \`{ table, kind, onlyOn, packs, corpus }\` 的**包装**形态。`
    + `直接对包装对象取 \`Object.keys()\` 数出来的是那几个**元数据属性名**，不是翻译键 ——`
    + `V14 那条挂了三轮的「面板 719/1273 vs 表侧 721/1304」，查到底就是这个：`
    + `多出来的 34 条 raw / 5 个 distinct 全是 \`table\`/\`kind\`/\`onlyOn\`/\`packs\`/\`corpus\` 这五个词，`
    + `再减去外面那份计数器**反而没看见**的 \`MISSING_LANGUAGES\` 3 个真键（藏在 \`spec.table\` 里），`
    + `34−3=31 条、5−3=2 个，一分不差。**差在数表那一侧，面板一个键都没漏核。**`
    + `要对账请用上面这行的 \`登记 raw/distinct\`（它是穿过包装数的）。`
  ];
  if (ledger.length) {
    ledgerLines.push(`按设计没核的逐表清单（共 ${ledger.length} 张表 / ${uncheckedRaw} 条）：`);
    for (const r of ledger) ledgerLines.push(`　· \`${r.name}\` ${r.n} 键 —— ${r.why}`);
  } else {
    ledgerLines.push("按设计没核的：0 张表（登记的字面量键**全部**进了本档的计数）。");
  }
  if (noReason.length) {
    ledgerLines.push(`⚠⚠ **有 ${noReason.length} 张表没核却登记不出原因**（${noReason.map(r => `\`${r.name}\``).join(" · ")}）——`
      + `「没核」必须说得出为什么，说不出就是被静默吞了，**按缺陷处理**。`);
  }
  evidence.push(...ledgerLines);

  const dupTotal = rawChecked - checkedDistinct.size;
  // ⚠ 这几个数**同时挂在对象上**（`.stats`），好让离线探针读**面板自己算的数**，
  //   而不是自己再抄一份判据去算 —— 探针抄一份就等于测了个副本，测不着真身。
  const total = Check.ok(S, "合计", checkedDistinct.size,
    `去重后共核 **${checkedDistinct.size}** 个键（表里登记 ${rawChecked} 条，其中 ${dupTotal} 条是` +
    `多张表继承同一个源键的**重复登记**），查无此串 **${missDistinct.size}** 个（报文条数 ${rawMiss}）。` +
    `命中来源分布：${[...foundWhere].map(([k, v]) => `${k} ${v}`).join(" · ") || "（无）"}` +
    `（**证据力分档见下面的清单** —— 绿和绿不一样重）。` +
    D_BOUNDARY +
    `⚠ 「查无此串」还要看表的类型：运行时拼接的、来自数据文件的、字段路径、合集 identifier、` +
    `以及**本来就为「上游缺这些」而建的**表，找不到都是正常的 —— 那几类已按 \`kind\` 分开报，不计进这个数。` +
    `　⚠ **这个数有分母**：表里登记的字面量键是 **raw ${regRawLiteral} / distinct ${regDistinct.size}**，` +
    `本档按设计没核其中 **raw ${uncheckedRaw} / distinct ${uncheckedDistinct.length}**` +
    `（${ledgerBalanced ? "账已对平" : "⚠ **账没对平**"}，逐表点名见下面的「记账口径」）——` +
    `拿外面数出来的键数直接对 ${checkedDistinct.size} 是对不上的，**先读那一条再对账**。`,
    evidence);
  total.stats = {
    checkedDistinct: checkedDistinct.size, missDistinct: missDistinct.size,
    rawChecked, rawMiss, dupTotal,
    // ── 记账口径（第三十一轮 · V14 归因）：给 `checkedDistinct` 配上分母，
    //    好让离线探针 / 复核直接读**面板自己算的登记数**，不必再自己去数一遍表
    //    （自己数就会数成 721/1304 —— 那正是 V14 挂了三轮的成因）。
    registeredRaw: regRawLiteral, registeredDistinct: regDistinct.size,
    regexTables: regArrTables, regexEntries: regRawRegex, wrappedTables,
    uncheckedRaw, uncheckedDistinct: uncheckedDistinct.length,
    ledgerBalanced, ledgerNoReason: noReason.map(r => r.name),
    ledger: ledger.map(r => ({ name: r.name, n: r.n })),
    corpora: corpus.corpora.map(c => c.label), tried, failed: failed.length, dynamic,
    tpl, advPacks: advPacks?.length ?? 0,
    tierCounts: [1, 2, 3].map(t => [...foundWhere].filter(([lab]) => corpus.tierOf(lab) === t)
      .reduce((a, [, v]) => a + v, 0)),
    derivedKeys: [...new Set([...foundKeys].filter(([lab]) => corpus.tierOf(lab) === 3)
      .flatMap(([, ks]) => [...ks]))],
    packIndexKeys: [...new Set([...foundKeys].filter(([lab]) => corpus.tierOf(lab) === 2)
      .flatMap(([, ks]) => [...ks]))],
    weakShort: [...weakShort],
    miss: [...missDistinct]
  };
  out.unshift(total);
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
 *   D 档（上游字面量存在性）。**只有拿得到硬编码表的模块才传** —— crucible-cn 没有那些表，
 *   传 null，于是那一档会如实报**「无从查起」**而不是伪装成通过。
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
