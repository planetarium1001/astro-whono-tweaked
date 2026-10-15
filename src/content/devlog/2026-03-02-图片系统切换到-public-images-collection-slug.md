---
title: 图片系统切换到 public/images/{collection}/{slug}/
date: 2026-03-02
project: Whono Astro 主题
kind: breaking
description: 上传落点统一到 public 目录，并废弃 public/bits 扁平池。
---

图片不再散落在内容目录旁边，而是集中在 `public/images/` 下，一级目录与集合键一一对应。

- 本地与云端落点一致
- 旧图按集合与条目迁移
- 校验器同时支持相对路径与 `/images/...` 绝对路径

[迁移说明](https://github.com/planetarium1001/astro-whono-tweaked)
