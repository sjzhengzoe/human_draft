# UI 颜色规范

## 目标

项目颜色采用“共享语义色 + 功能模块色 + 运行时颜色常量”三层结构。页面不再自行挑选相近灰色；更换整体风格时，应优先调整集中色板，而不是逐页搜索替换。

颜色定义位置：

- `src/styles/colors.less`：小程序页面和组件使用的 CSS 颜色变量。
- `src/styles/colors.ts`：`wx.showModal`、原生控件、Canvas 和图片导出使用的 TypeScript 常量。
- `src/app.less`：只负责引入色板和定义与颜色无关的全局尺寸、字体等变量。

## 共享色板

基础灰阶仅作为语义色的底层实现，不直接作为业务含义使用。

| 层级 | 当前值 | 主要语义 |
| --- | --- | --- |
| `neutral-950` | `#111111` | 主文字、主操作、选中状态 |
| `neutral-900` | `#222220` | 强调正文、主操作按下态 |
| `neutral-800` | `#333330` | 常规较强文字 |
| `neutral-700` | `#555550` | 次级文字 |
| `neutral-600` | `#666660` | 辅助文字 |
| `neutral-500` | `#777772` | 弱化说明、元信息 |
| `neutral-400` | `#999994` | 占位符、空状态 |
| `neutral-300` | `#b3b3ae` | 禁用内容 |
| `neutral-250` | `#d8d8d8` | 强边框 |
| `neutral-200` | `#dededb` | 禁用背景、次级边框 |
| `neutral-150` | `#e5e5e5` | 默认边框 |
| `neutral-100` | `#eeeeee` | 浅色背景 |
| `neutral-75` | `#f1f1f1` | 点击或悬停背景 |
| `neutral-50` | `#f5f5f5` | 页面背景 |
| `neutral-25` | `#fafafa` | 接近白色的柔和背景 |
| `white` | `#ffffff` | 卡片、弹窗和反色文字 |

## 业务 UI 必须使用语义变量

文字：

- `--ui-color-text-primary`：标题、正文重点、主要图标。
- `--ui-color-text-strong`：强调正文或重要值。
- `--ui-color-text-default`：普通但需要保持清晰的内容。
- `--ui-color-text-secondary`：次级说明。
- `--ui-color-text-subtle`：辅助信息。
- `--ui-color-text-muted`：元信息、弱化标签。
- `--ui-color-text-placeholder`：占位符、空状态。
- `--ui-color-text-disabled`：禁用内容。
- `--ui-color-text-inverse`：深色背景上的文字。

背景、边框和操作：

- `--ui-color-background-page`、`--ui-color-background-surface`、`--ui-color-background-subtle`、`--ui-color-background-hover`。
- `--ui-color-border`、`--ui-color-border-strong`、`--ui-color-border-subtle`、`--ui-color-border-inverse-solid`。
- `--ui-color-action-primary`、`--ui-color-action-primary-pressed`。
- `--ui-color-danger`、`--ui-color-success`、`--ui-color-warning`。
- 遮罩和阴影使用 `--ui-color-overlay*`、`--ui-color-shadow*`，不要自行创建接近的透明度。

推荐写法：

```less
.card-title {
  color: var(--ui-color-text-primary);
}

.primary-button {
  background: var(--ui-color-action-primary);
  color: var(--ui-color-text-inverse);
}
```

禁止写法：

```less
.card-title {
  color: #222;
}
```

## 功能模块色

地图、菜单餐次、媒体时间轴和运动休息状态拥有稳定的独立语义，因此使用集中声明的模块变量：

- `--footprint-color-*`
- `--meal-plan-color-*`
- `--media-color-*`
- `--exercise-color-*`

新增模块色时，必须确认它不能由共享文字、背景、边框或状态色表达。模块色仍需写入 `src/styles/colors.less`，禁止放在页面顶部作为局部常量。

## Tab 选中态

模块顶部的视图切换、状态切换、侧栏 Tab，以及承担互斥切换作用的顶部筛选胶囊，统一使用：

```less
.tab--active {
  background: var(--ui-color-action-primary);
  color: var(--ui-color-text-inverse);
}
```

不要使用白底黑字、仅底部黑线、仅文字变黑或功能模块强调色作为 Tab 选中态。地图成功色、评分色等功能色只能表达内容状态，不能替代全局 Tab 选中样式。表单内可同时选择多项的标签不属于 Tab，可以继续使用边框选中态。

## TypeScript、WXML 与 JSON

`wx.showModal`、Canvas 等不能读取 CSS 变量的代码使用 `src/styles/colors.ts`：

```ts
import { UI_COLORS } from "../../styles/colors"

wx.showModal({
  title: "确认删除",
  confirmColor: UI_COLORS.danger
})
```

原生 `checkbox`、`switch`、`swiper` 等需要具体颜色时，将 `UI_COLORS` 放入组件或页面 `data`，再通过 WXML 数据绑定传入。

小程序 JSON 配置无法导入 CSS 或 TypeScript 常量，因此允许保留少量颜色字面量。目前允许的配置值只有：

- 页面和导航背景：`#ffffff`、`#f5f5f5`
- 主选中色：`#111111`
- TabBar 未选中色：`#777772`

新增 JSON 颜色前，应先更新集中色板和自动检查，不能把 JSON 例外扩散到业务样式。

## 修改流程

1. 优先判断能否复用现有语义变量。
2. 确需新语义时，在 `src/styles/colors.less` 和必要的 `src/styles/colors.ts` 中集中增加。
3. 页面和组件只引用变量或常量，不保存颜色字面量。
4. 运行 `node --test server/tests/ui-colors.test.mjs`、相关功能测试和 `pnpm run typecheck`。

`server/tests/ui-colors.test.mjs` 会阻止 `.less`、`.wxml` 和业务 TypeScript 重新出现直接颜色值，也会验证 JSON 配置仍在允许范围内。
