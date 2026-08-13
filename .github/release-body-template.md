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

### v1.1.10 重点 —— 界面漏英文的一大批修复

主要是运行时替换层的**覆盖面**修复：之前有大量界面文字虽然经过替换层，但入口条件够不到
上游实际产生它的地方，于是一直是英文。

- **对话框正文与按钮**：此前只翻窗口标题就返回了，34 个对话框的正文与按钮结构性不可达，
  同屏出现「中文标题 + 英文按钮」。现在认出是 Ember 弹的框之后会翻整个窗口。
- **富文本增强器的前缀**：`Ancestry: 人类` / `Culture: …` / `Path: …` / `Talent: …`
  这类「前缀 + 已译名字」的复合串一直整串漏译，仅战役包内就 345 处。
- **音景按钮**：`Music: …` / `Environment: …`（每包 23 颗按钮里 21 颗）。
- **六边形地图 HUD** 的四条悬浮提示（区域地图 / 地点 / 生物群系 / 地形）。
- **角色创建向导顶栏**的「同调」「Token」两步、crucible 英雄卡的「同调」页签。
- **世界时钟**：那行日期是动画直接改写的，翻译挂在渲染钩子上够不着，改从源头生成中文。

另修若干术语与译文一致性问题。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
