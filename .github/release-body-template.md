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

### 1.1.3 重点

本版由一次全库审计（27 个并行审计单元 + 逐条对抗验证）驱动。

- **世界地图的地形数据此前会失效**：`terrain` 是一个只接受固定取值的枚举字段
  （normal / difficult / water / extreme / bluffs / canyon），却被当成正文翻译了，
  104 个格子写进了中文值 —— 数据校验不通过会回落默认值甚至直接报错，
  水域 / 困难 / 极端地形连同移动消耗一起丢失。已从映射里移除该字段并清干净。
- **约 90 处内容链接指向了错误的文档**：把英文语序倒装成中文时（"the Tyraphem on Luxarum"
  → 「在 Luxarum 上的 Tyraphem」），只搬动了链接的显示文字、没搬链接目标。
  于是点「卢克萨鲁姆」打开的是提拉斐姆的页面，点「碎片诸神」打开的是奥布里西尔。
  中文读起来完全通顺，所以通读也发现不了。已全部重新配对。
- **几处中文与英文不符**：`The Expedition Challenge / Closing Ceremonies` 把奖励
  「进入绛华档案库研读遗物」换成了英文里没有的「堡内所有设施含限制区域」，
  还凭空多出一句「下一阶段调查崩塌尖塔」；`Glitter in the Dark` 的旁白凭空多出约 130 字景物描写，
  并把「在余烬地表**之上**」译反成「之下」。已按英文重译。
- **大量中文句子里夹着没译完的英文**：`@UUID` 链接的显示文字 1000 余处、
  角色物品说明里的规则词（Presence / Toughness / 2 Hands 等）约 150 处、
  Crucible 分支整段留英 49 处（那一支正是 Crucible 世界唯一会显示的），另有 8 处整句未译。
- **译名统一**：`Ordain`→奥尔丹（另有 96 处「欧尔丹」）、`Arcturian`→阿克图里安（1090 处）、
  `Sockets`（上古死神）→萨克茨（原译「插孔」）、`Shard God`（通称）→碎片之神
  （原一律作「碎片女神」，造成「碎片女神贾纳尔…他」）、`Warden` 的宗教义→典守者
  （原作「典狱长」，出现过「火焰典狱长」）、`Steading`（季节名）→耕耘（原作「庄园」）、
  `Aura`（月亮专名）→奥拉、`Ordinate`→审序院、`The Hallows` 城区与同名组织分名、
  `River Destine`→德斯廷、物品品质五档统一。
- `Arcturel Upper` / `Lower` 这两个上游早已改名的旧地名，此前还写在双语并列的英文侧，
  已按现行的 `Tradeway` / `Dives` 改正。
- 界面文字：月相 `Waxing`「打蜡」→月盈、`Full`「全额」→满月；
  `hex`（六边格）被当成妖术的几处已改。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
