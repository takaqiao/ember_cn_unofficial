# Ember 中文翻译（非官方） / Ember Chinese Translation (Unofficial)

[![GitHub release](https://img.shields.io/github/v/release/takaqiao/ember_cn_unofficial?style=flat-square&label=release&logo=github)](https://github.com/takaqiao/ember_cn_unofficial/releases/latest)
[![Foundry version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Furl%3Dhttps%3A%2F%2Fgithub.com%2Ftakaqiao%2Fember_cn_unofficial%2Freleases%2Flatest%2Fdownload%2Fmodule.json&style=flat-square)](https://github.com/takaqiao/ember_cn_unofficial/releases/latest)
[![Total downloads](https://img.shields.io/github/downloads/takaqiao/ember_cn_unofficial/total?style=flat-square&label=downloads&color=brightgreen)](https://github.com/takaqiao/ember_cn_unofficial/releases)
[![Latest downloads](https://img.shields.io/github/downloads/takaqiao/ember_cn_unofficial/latest/total?style=flat-square&label=latest)](https://github.com/takaqiao/ember_cn_unofficial/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v14-orange?style=flat-square&logo=foundryvirtualtabletop&logoColor=white)](https://foundryvtt.com/)
[![Ember](https://img.shields.io/badge/module-Ember%20%E4%BB%98%E8%B4%B9-b35c00?style=flat-square)](https://foundryvtt.com/ember)
[![Babele](https://img.shields.io/badge/Babele-required-7b3f99?style=flat-square)](https://foundryvtt.com/packages/babele)
[![Unofficial](https://img.shields.io/badge/%E9%9D%9E%E5%AE%98%E6%96%B9-unofficial-lightgrey?style=flat-square)](https://github.com/takaqiao/ember_cn_unofficial)

为 Foundry VTT 的 **Ember** 战役模块提供简体中文翻译，合集内容经 Babele 加载，界面字符串走 Foundry 原生 i18n。
**当前版本 1.1.2。**

Ember 同时支持 **Crucible** 与 **dnd5e** 两套规则，本模块把两侧的合集包都翻了；
主线以 Crucible 侧（`ember.crucible-*`）为准，dnd5e 侧（`ember.adventure`）一并提供。

## 安装 / Install

在 Foundry → **附加模块 → 安装模块** 中粘贴 manifest URL：

```
https://github.com/takaqiao/ember_cn_unofficial/releases/latest/download/module.json
```

装好后启用本模块，把世界语言切到**中文**即可。本模块不在 Foundry 官方包浏览器中收录，只能用上面的 manifest 安装。

## 内容 / Contents

| 路径 | 作用 |
|---|---|
| `lang/cn.json` | Ember 自己的界面字符串（Foundry 原生 i18n，扁平点号键） |
| `compendium/cn/*.json` | 9 个合集包的 Babele 译文：战役正文、地名志、设定集、角色/敌人/词缀/效果 |
| `register.js` | Babele 注册入口 |
| `babele-mappings.js` | 声明式 mapping（含 Ember 的 13 种日志页子类型），由抽取器生成 |
| `scripts/ember-hardcoded-cn.mjs` | 运行时补丁：Ember 写死在 JS 里、两条汉化通道都够不到的字符串（增强器标签、分节标题、按钮、对话框，以及历法月名与星期名） |
| `styles/ember-cn.css` | 中文字体回退与排版修正（Ember 原字体不含任何 CJK 字形） |

仓库里的 `compendium/en/` 是**英文基准**，只用于跨版本算 drift，**不进发布包**。

## 依赖 / Requires

- **Foundry VTT v14**（`compatibility`：minimum 14 / verified 14 / maximum 14.999）
- **[Ember](https://foundryvtt.com/ember) v0.6.0+** —— 付费模块，**需自行在 Foundry 官方商店购买并安装**，本模块只提供译文，不含 Ember 本体的任何素材
- **[Babele](https://foundryvtt.com/packages/babele) v2.9.1+** —— 合集译文的加载框架，必须启用

Ember 本体 v0.6.0 自身要求 Foundry ≥ 14.364，因此低于 v14 的 Foundry 无法使用本模块。

## 说明 / Notes

- 这是**非官方**的爱好者翻译，与 Foundry Gaming LLC 及 Ember 作者没有任何隶属关系，也未经其审核。
- 译文按 Ember **0.6.0** 抽取的英文基准逐条对照。Ember 升级后若有正文改动，需要重新追平，届时旧译文可能与新英文不符。
- Crucible 系统本体的汉化是另一个模块：[crucible-cn](https://github.com/takaqiao/crucible-cn)。两者可同时启用。

## 致谢 / Credits

- **Ember** 与 **Crucible** —— Andrew Clayton (Atropos) / Foundry Gaming LLC，<https://foundryvtt.com/ember>
- **Babele** —— Simone Ricciardi，<https://gitlab.com/riccisi/foundryvtt-babele>
- 翻译与维护 —— Taka

Issue / PR 欢迎 —— 错译、术语建议、兼容性反馈都会处理。
