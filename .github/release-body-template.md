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
