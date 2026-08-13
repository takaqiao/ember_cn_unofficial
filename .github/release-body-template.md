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

### v1.1.6 重点

第十二轮收口 + 补上第十轮没读完的部分。

- **《奥尔丹地名志》补完**：第十轮那一本 54 页只读了 32 页，本版补读剩下的 22 页，又查出 27 条。
- **7 本高产 journal 独立重读**，又查出 100 条 —— 单次通读的召回率约七成，读过不等于读干净。
- **上游遗留的编辑批注**：`[Recap of description of Entropic Pearl from item here]`
  原样照抄在中文里，现译为「[此处复述物品条目中对熵珍珠的描述]」。
- **施工中提示语**统一（同一段样板文字原有两种译法，共 150 叶）。
- 术语：`boon`（祝福）与机制词 `Boon`（恩惠骰）的混淆已订正 —— 湖泊圣祠给的是「信仰之盾」，
  是**宇宙祝福**不是恩惠骰；同页「海滩」改「湖滩」（那是湖不是海）。
- 词表侧修了一个长期缺陷：术语表的收割逻辑从不采顶层文件夹名，
  导致包里早已改对的分类名在词表里永远是旧值，会被自动套词反向灌回去。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
