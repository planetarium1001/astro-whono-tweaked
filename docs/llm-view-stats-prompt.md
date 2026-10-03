# 取数脚本编写提示词

把本文件整体复制给大模型，替换最后一节「我的统计服务」后即可使用。模型能读文件时，让它先读 `src/scripts/view-stats.ts`、`src/lib/view-stats.ts` 与 README 的「浏览数据（PV / UV）」一节。

---

## 任务

为 Astro 主题 astro-whono-tweaked 编写「浏览数据（PV / UV）」的取数脚本，只修改 `src/scripts/view-stats.ts`。

## 约束

- 只修改 `src/scripts/view-stats.ts`；不要改组件、样式与 `src/lib/view-stats.ts`。
- 用 `resolveViewStats()` / `setViewStatValue()` 读写槽位，不要自行拼装或改写 DOM 结构。
- 请求失败、超时或返回空值时保持槽位隐藏：不要写入空字符串、`0` 或 `—`。
- 账号级 API key 不得出现在前端代码里；浏览器端只允许免认证的只读通道（例如 Umami 的 share slug）。
- 只填 `pv` / `uv` 两个槽位；停留时长、跳出率一类聚合指标不要写入。
- TypeScript + ESM，不新增依赖，允许顶层 await。
- 注释用中文、简短，只解释原因；不要留 TODO、调试输出或大段示例。
- 只输出完整的 `src/scripts/view-stats.ts` 文件内容。

## 槽位契约

主题已渲染下列结构，脚本直接读取属性并填值：

```html
<span class="meta-line__item view-stats" data-view-stats
      data-view-scope="article" data-view-path="/archive/hello/"
      data-view-route="/archive/hello/" data-view-title="Hello">
  <span class="view-stats__item" data-view-stat="pv" hidden>
    <span class="view-stats__label">浏览</span>
    <span class="view-stats__value" data-view-stat-value></span>
  </span>
  <span class="view-stats__item" data-view-stat="uv" hidden>…</span>
</span>
```

| 属性 | 含义 |
| --- | --- |
| `data-view-scope` | 页面类型：`article` / `archive` / `bits` / `memo` / `essay` / `about` / `home` |
| `data-view-path` | `Astro.url.pathname`，含部署 base，与统计服务记录的 URL 一致 |
| `data-view-route` | 去掉 base 的逻辑路由 |
| `data-view-title` | 剥掉标签的纯文本标题 |

## 可用 helper

- `resolveViewStats(stat?: 'pv' | 'uv', root?: ParentNode): HTMLElement[]` —— 取当前页面的槽位
- `setViewStatValue(item: Element, value: number | string): void` —— 写入并摘掉 `hidden`，数字自动千分位
- `formatViewStatValue(value: number | string): string` —— 仅格式化，不写 DOM
- `VIEW_STATS_READY_EVENT` —— 槽位挂载完成后在 `document` 上派发

## 我的统计服务

（填写以下内容）

- 服务与版本：
- 读取接口与参数：
- 认证方式（免认证通道 / token 放在哪）：
- 返回结构示例：
- 站点部署位置（根路径 / 子路径）：
