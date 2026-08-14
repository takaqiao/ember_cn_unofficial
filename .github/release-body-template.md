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

### v1.1.14 — 补 v1.1.13 漏掉的 3 处

v1.1.13 把命案现场那条通道统一成了「猫道」，但那次只改了它所在的那一本任务日志，
而这个词横跨全库 —— 另外三本（阿克图斯高原地名志 / 通路地名志 / 碎牙帮巢穴）里
还留着旧译「栈道」。发版后做下载回包抽查时发现，已补齐。

（`boardwalk` 的「木栈道」是另一个词，未受影响。）

### v1.1.13 重点 —— 三类以前查不到的问题

- **跨叶指代断裂**：以前所有检查的单位都是「一片叶」。这次改成按 GM 实际备课顺序
  **整条事件链通读**，查出一类只在跨页时才暴露的问题：同一个东西在不同页上叫了不同名字，
  把伏笔和线索链切断。例如任务奖励 GM 念的是「聚焦珍珠」、实际发的物品叫「专注珍珠」。
- **中文可读性**：以前的判据只管「忠不忠实」，不管「读起来是不是人话」。按具名的翻译腔
  （超长定语、的的不休、被字滥用、词序照搬）润色了玩家指南 / 文化 / 职业三本读物，语义未改。
- **术语表订正**：4 条会把错误洗成权威的词条（念力/强韧/阶位/地区地图），已在词表两层同时订正。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
