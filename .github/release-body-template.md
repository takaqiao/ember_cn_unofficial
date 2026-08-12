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

### 1.1.1 重点

- **修复：界面汉化此前有 77% 是失效的。** `lang/cn.json` 的键写成了
  「顶层带点、值却是嵌套对象」的形态，Foundry 两条查找路径都命不中，
  486 个键里只有 114 个真正生效。日历上那排 tooltip（寰宇地图 / 世界地图 /
  区域地图 / 倒转时间 / 队伍角色卡 / 法典）就属于失效的那批，现已全部恢复。
- **修复：日历月名不汉化。** Ember 的历法把季节名写成 i18n 键、月名却硬编码成
  英文，Babele 与 i18n 都够不着，改由运行时补丁翻译。
- **补齐 414 条从未翻译的条目**（怪物图鉴、物品与效果名等）——
  这类「中文侧整条不存在」的缺口此前所有检查都发现不了。
- **清理 1435 条死键**（上游已删除或改名的条目），发布包小了约 460 KB。
- 术语统一：Boon → 恩惠骰、Fortitude → 强韧（与属性 Toughness 解除撞名）、
  Willpower → 意志、Accurate → 精准、Arrow → 箭矢。dnd5e 侧的规则文本不受影响。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
