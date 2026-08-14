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

### v1.1.12 重点 —— 地图术语拆分

- **「区域地图」拆成两个词**。Ember 里 `Region Map`（世界六边格大图）与 `Area Map`（局部场景图）
  是两样东西，此前中文都叫「区域地图」，读正文分不出指哪一张 —— 有个升降机下拉框里
  甚至并排出现两个一模一样的选项。现在 `Region Map`＝**地区地图**、`Area Map`＝**区域地图**，
  两包合计改 187 叶。
  其中 4 叶原本方向就是反的（英文写 area map、中文写「地区地图」），一并订正。
- `[[/language moiré]]` 4 处不再漏出裸标记，现渲染为「语言：莫伊雷语」。
  （上游那条增强器的正则没开 unicode 标志，`é` 匹配不到，所以它从来没被接管过。）
- 两处人名/职称的库内自相矛盾统一：`Erisa Wandren`→埃丽莎·万德伦、`Chef`→主厨。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
