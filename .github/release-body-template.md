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

### v1.1.8 重点 —— 紧急修复：会写坏世界数据的缺陷

**强烈建议从任何 v1.0.14 ~ v1.1.7 升级上来。** 这几个版本里有一处缺陷会静默损坏世界数据。

- **症状**：GM 进入世界后，天赋 / 法术 / 血统 / 背景 / 原型 / 分类 / 战利品 / 图纸 /
  符文 / 手势这些物品的描述，会被静默改写成字面量 `[object Object]`，原文丢失；
  之后每次编辑这类物品并保存，还会再触发一次。不报错、不提示。
- **成因**：模块里一段为「旧版世界修数据」而写的代码，用「描述是不是字符串」来判断
  该不该转成 `{public, private}` 对象。但 Crucible 里只有**物理装备**的描述是那种对象，
  上面那十类的描述**本来就该是字符串** —— 于是它把正确的数据当成脏数据改坏了。
  更糟的是它「只跑一次」的开关从未生效（用错了 API），所以每次开世界都重来一遍。
- **修法**：改成直接询问数据模型的 schema，只有真要求对象形状的才转；
  拿不到 schema 就一律不动。两个迁移的一次性开关改用 Foundry 的世界设置。
  另外那段迁移原先读的是已加工过的值，导致它连真正该修的对象都找不到，也一并改成读源值。

> 已经中招的世界：本版只能阻止继续恶化，**已被写成 `[object Object]` 的描述无法自动还原**，
> 需要从备份恢复，或删掉受影响物品后从合集重新拖入。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
