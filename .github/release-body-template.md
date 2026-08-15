## 安装 / Install

在 Foundry → **附加模块 → 安装模块** 中粘贴以下 manifest URL：

```
https://github.com/takaqiao/ember_cn_unofficial/releases/latest/download/module.json
```

## 依赖 / Requires

- Foundry VTT **v14**（Ember 0.6.0 自身要求 ≥ 14.364）
- **Ember** 模块 v0.6.0+（付费模块，需自行拥有）
- [Babele](https://foundryvtt.com/packages/babele) v2.9.1+

同时支持 **Crucible** 与 **dnd5e** 两套规则下的 Ember 战役包。

## 变更 / Changes

### v1.1.17 — 与 Foundry 核心中文包对齐：`Token` 统一为「指示物」

**这一版最显眼的改动是 `Token`。** 此前正文里有「令牌」220 叶、「代币」14 叶、「指示物」61 叶
三种叫法。核心中文包 `foundry_chn` 里 `TOKEN` 相关键**一律是「指示物」**（53 : 0），
所以正文写「令牌控制栏」时，玩家在自己的界面上根本找不到那个控件。全部统一为**指示物**
（连带「动态指示物」「指示物制作器」「传送指示物」）。

> 故事里那些**实体信物**不在此列：雅科什塔矿井内部流通的代币仍是「代币」，
> 西门商栈的 `souvenir tokens` 改作「纪念章」、乔恩童年集市那块 `wooden token` 改作「木牌」。

### 其余术语统一

- **`Rank` → 阶位**（与 `Tier`＝阶、`level`＝等级 三分）。同调阶位、魂缚阶位、技能训练阶位等
  176 叶此前写作「等级」，与角色等级同名。⚠ 散文里表身份的 rank（公民地位、教团职位、军衔）不在此列。
- **`Region Map` → 地区地图**：界面上 5 个键此前反着写成「区域地图」，与 `Area Map`（区域地图）撞名。
- **`Hex` → 六边格**（原有「六角格」38 叶）· **`Cosmological` → 宇宙**（原「寰宇」，锚点页名是「宇宙观」）·
  **`the Dives` → 矿渊** · `Cyclonic`→气旋（原「旋风的」与 `Whirlwind` 旋风撞名）·
  `Lantyr`→兰提尔 · `Temple Lunarium`→神殿月辉宫 · `Corla`→科尔拉（与人物 `Cora` 科拉 拆开）·
  `Obsidian Antiquary`→黑曜石古物学者 · 世界地图上的 `Point` 由音译「波因特」改为意译「岬」
  （同排 10 个城镇标签里其余 9 个都是意译）。

### 界面脚本

`ember-hardcoded-cn.mjs` 全表 667 个匹配单位逐条复核，修掉 4 个在当前上游已经匹配不上的键，
补上法典日志的「任务：」前缀与 Ember 指示物制作器的窗口标题，并给天气/风力档位、
区域行为设置面板补了此前漏掉的字段名。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.

### v1.1.16 — 「枢纽轮盘」统一

雅科什塔矿井那个切换矿车轨道的轮盘，此前有「枢纽轮盘」与「路口轮盘」两种叫法
（物品名与正文 14 处叫枢纽轮盘，补丁日志 2 处叫路口轮盘）。统一为**枢纽轮盘**——
这是矿车道岔，「路口」是地面街道的说法。

### v1.1.15 — 四组名称统一

- **克利珀（Clipper）的人称**：原文用不指明性别的 they，中文此前一会儿「她」、
  一会儿「他们」（后者会被读成好几个人）。统一为「他」，易读岔处直接用名字。
- **龙兽一族**：`Drakeling` 统一为「幼龙兽」（与同族的「龙兽」对得上）；
  `Afflicted` 统一为「受难」。
- **因卡罗水潭**：物品「因卡罗池授权令」与地点「因卡罗水潭」指同一处，已统一。
- **通道类词**：`catwalk` 此前有八种译法，统一为「猫道」；`boardwalk` 统一为「木栈道」。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
