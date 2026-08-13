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

### v1.1.5 重点

本版是四轮审计（第八～十一轮）的合并成果，落盘约 9000 叶。
**全部 75 本 journal 现已逐句对读完毕** —— 最后 40 本（380 万字符）在本版补齐。

- **一处战役剧透已修**：贤者二把手维纳里斯的阵营被写成「中立邪恶」（英文是中立善良），
  而「他其实是巨龙泽拉尼斯的人类伪装」这个反转**只写在游戏主持人专属区块里**。
  玩家翻开组织页就会提前看出问题。
- **建卡用的语言表有两处致命错误**：卢梅克人的语言 `Luma` 被译成「龙语」，
  而真正的龙语 `Draconic` 那一行反倒原样留着英文 —— 照表选「龙语」会选到卢梅克语。
  同表另有 13 个语言名整格未译，现已全部补上。
- **页内跳转链接大面积失效**：Foundry 的小节锚点由标题文字生成，标题译成中文后锚点就落空了。
  全库 590 处 `#小节` 链接原本全部跳到页首，现已通过给 1491 个标题补锚点修好。
- **两个职业共用一个中文名**：`Warlock` 与 `Sorcerer` 都叫「术士」，
  导致原文读成「术士不必像术士那样缔约」。`Warlock` 现作**邪术师**。
- **朗读文本的凭空增删**：有一段删掉了本事件的核心道具（下一整节都在讲它），
  另一段先写「默默地并肩走来」两句后又写「边走边激烈地交谈」，自相矛盾。
- **地名志的人名**：条目标题已译成中文、正文却仍写英文名的有 60 余处
  （上半段叫「达丽莎」、下半段叫「Darissa」）。
- **跨书术语统一 122 族**：`Otherhood of Fortune` 幸运异姊会（原「异缘会」186 处）、
  `Ember` 世界名统一为「余烬」（原有烬界／安珀／烬火）、`Pathways` 通路、
  `Sunfire Empire` 阳炎帝国（原有六种译名）、`Highgate` 高门（原「海门」，
  但它其实是通往内陆的北方陆门）、`Mutagist` 突变学派（六种）、`Toothbreaker` 碎牙帮（五种）。
- **`Wyrms`（古龙）与 `Dragons`（巨龙）是两类生物**，此前 46 处把古龙也译成了巨龙。
- 另修：`The Armarium` 其实是杂货店却译作「军械库」，与真正的军械库撞名；
  `Carmin Anther` 是个人名却被逐词译成「卡尔敏花药」；`evidence` 被误替换成机制词「证据值」29 叶。

完整改动请见本次发布对应的提交记录。
See the commits associated with this tag for the full change list.
