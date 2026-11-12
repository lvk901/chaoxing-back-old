# Changelog

## 1.1.2

- 只在精确的 `.back-old` 上点击，去掉 `[class*="backOld"]` 等泛选择器，修复旧版页误点导致的来回跳转
- 已在旧版页（`/mooc2-ans/mycourse/`、`/mooc-ans/`）时直接不动作
- 点击前要求本框架 `readyState === 'complete'`，避免 Vue 事件未绑定时空点

## 1.1.0

- 修正旧版 URL 构造：必须携带新版 URL 中的 `t`（缺失时服务端返回「无效的参数」），`pageHeader` 改为 `0`
- 缺 `t` 时不再直接跳转，交给点击兜底

## 1.0.0

- 首个版本：`document-start` 阶段改写新版课程页 URL，其余新版页自动点击「回到旧版」
- 加入循环保护与油猴菜单开关
