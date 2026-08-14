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

### v1.1.15 — 四组名称统一

把四组「同一个东西在不同页上叫不同名字」的分裂收口。这类问题玩家最容易踩：
GM 念一个词、发的东西却叫另一个词。

- **克利珀（Clipper）的人称**。原文用的是不指明性别的 they，中文此前一会儿「她」、
  一会儿「他们」——后者还会被读成好几个人（「**他们**那虚幻的手臂垂了下来」）。
  现统一为「他」，容易读岔的地方直接用「克利珀」。她的卷轴此前叫「快剪手的无尽卷轴」，
  与角色名对不上，已改为「克利珀的无尽卷轴」。
- **龙兽一族**。`Drakeling` 统一为「幼龙兽」（此前「幼龙」，与同族的「龙兽」对不上，
  玩家认不出是一类生物）；`Afflicted` 统一为「受难」（此前「受苦的」，
  该族其他修饰语都是两个字：苍白 / 变异 / 辉耀 / 病弱）。
- **因卡罗水潭**。物品「因卡罗池授权令」与地点「因卡罗水潭」指同一处，已统一。
- **通道类词**。`catwalk` 此前有猫道 / 栈道 / 栈桥 / 高架走道 / 悬空走道 / 高架步道 /
  走道 / 悬道 **八种**译法，统一为「猫道」；`boardwalk` 统一为「木栈道」。

开发侧：新增的决议断言扩到 23 条，本次就是靠它抓出 3 处漏改
（其中一处在 dnd5e 侧、常规的孪生同步够不到）。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
