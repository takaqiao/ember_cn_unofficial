## 安装 / Install

在 Foundry → **附加模块 → 安装模块** 中粘贴以下 manifest URL：

```
https://github.com/takaqiao/ember_cn_unofficial/releases/latest/download/module.json
```

## 依赖 / Requires

- Foundry VTT v13 ~ v14
- **Ember** 模块 v0.6.0+（付费模块，需自行拥有）
- [Babele](https://foundryvtt.com/packages/babele) v2.9.1+

同时支持 **Crucible** 与 **dnd5e** 两套规则下的 Ember 战役包。

## 变更 / Changes

### 1.1.2 重点

- **修正 20 组同一事物的不同译名**，此前同一个专名在正文与条目名之间对不上：
  Agrimage 农法师→**农艺法师**、Thornling 荆棘裔→**荆芽灵**、
  House Cevher 切夫赫尔→**杰夫赫尔**、Ordain 奥丹→**奥尔丹**（225 处）、
  Aberin 阿贝林→**阿伯林**、Hulg'run（原样留着英文）→**赫尔格伦**。
- **世界地图针脚重译 14 个**：`Karon Mounts`「卡隆坐骑」→卡隆山脉、
  `The Sword Range`「剑的射程」→剑锋山脉（Mounts / Range 都是山脉）、
  `Elvan`「精灵语」→埃尔凡（它是聚落名不是语言）、
  `Sail/Hoist/Break/Catch` 原本被译成动词，现按地名改为 帆 / 吊索 / 断口 / 渔获。
- **两处中文与英文不符**：`Wedgelands` 页中文凭空多出一处英文里没有的庄园；
  `Supplies and Demands` 旁白整段被重排，且把 thornling 误作「农法师」（
  埃迪维尔是荆芽灵），台词被改写成了旁白。均已按英文重译。
- `The Waterworks`（城区地下的运河隧道迷宫）此前有 3 处被写成
  `The Waterworks Office`（另一栋楼），照指示走会走错地方，已分开。
- 术语：essence→**精华**、Stride→**步幅**、Attunement 残留→**同调**。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
