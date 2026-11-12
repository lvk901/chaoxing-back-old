# 新版 / 旧版 URL 映射规律

本文记录「回到旧版」按钮背后真实发生的一次跳转，以及据此推导出的改写规则。所有字段值以占位符给出。

## 一次真实跳转的前后对比

点「回到旧版」前（新版）：

```
https://mooc2-ans.chaoxing.com/mooc2-ans-vue/fanyav3/stu
  ?courseId=<课程ID>
  &clazzId=<班级ID>
  &cpi=<cpi>
  &enc=<enc>
  &t=<t>
  &v=6
  &ut=<ut>
```

点之后（旧版）：

```
https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu
  ?courseId=<课程ID>
  &clazzId=<班级ID>
  &cpi=<cpi>
  &enc=<enc>
  &t=<t>
  &ut=<ut>
  &courseid=<课程ID>
  &clazzid=<班级ID>
  &v=2
  &pageHeader=0
  &hideHead=0
  &forceMooc2=true
```

差异只有三处：

1. 路径 `/mooc2-ans-vue/fanyav3/{stu,studentCourse}` → `/mooc2-ans/mycourse/stu`
2. `v` 从 `6` 变 `2`
3. 追加 `courseid`、`clazzid`（小写重复一遍）、`pageHeader=0`、`hideHead=0`、`forceMooc2=true`

`courseId`、`clazzId`、`cpi`、`enc`、`t`、`ut` 原样保留。

## 参数必要性验证

| 变体 | 结果 |
| --- | --- |
| 完整参数 | ✅ 正常渲染课程页 |
| 去掉 `t` | ❌ 页面正文「无效的参数」 |
| 去掉 `ut` | ✅ 正常 |
| `pageHeader=-1` | ✅ 正常（`0` / `-1` 都接受） |
| 只保留 `courseId` + `clazzId` | ❌ 「无效的参数」 |
| 用旧一次页面留下的 `enc` / `t` | ✅ 仍可用（同一令牌可复用，非一次性） |

结论：**`t` 是硬性必填**，`enc` 也要带（可直接沿用当前新版页 URL 里的值），`ut`、`cpi`、`pageHeader` 取值宽容。

## 已排除的其它方案

| 方案 | 结果 |
| --- | --- |
| 新版 URL 加 `forceMooc2=true` / `v=2` | 仍是新版 |
| 新版 URL 加 `old=1` | 仍是新版 |
| 新版 URL 加 `hideOldVersion=0&showNewVersion=1` | 仍是新版 |
| 点击「回到旧版」后比对 cookie | 无任何新增/变化 |
| 点击过程抓 XHR | 没有 switch / 版本切换类接口，只是纯前端导航 |
| 翻新版 bundle 找路由表 | 新版路由仅 `/`、`/stu`、`/tch`、`/index`、`/studentCourse`、`/application`、`/teachCalendar`、`/centerDownload`，无「版本切换」API |

因此最省事且最稳的做法就是**在 `document-start` 阶段直接改写 URL**，连新版页面的渲染都省掉。

## 元素定位（点击兜底用）

新版课程页的「回到旧版」按钮 DOM：

```html
<div class="header-right flex">
  <div class="back-old">
    <img src="data:image/png;base64,...">
    <span>回到旧版</span>
  </div>
</div>
```

- 真实类名：`.back-old`（不带 `data-v-*` 的静态类）
- 按钮位于 `fanyav3/studentCourse` 这个 iframe 内，点击后导航的是**顶层窗口**
- Vue 绑定的是 `@click`，`dispatchEvent(new MouseEvent(...))` 可触发
- ⚠️ 必须等 iframe 自身 `document.readyState === 'complete'` 之后再点，否则 Vue 事件尚未绑定，点了没有效果
- ⚠️ 旧版页面里也存在 class 含 `backOld` 的元素，泛选择器 `[class*="backOld"]` 会误点并造成来回跳转

## 复现方法

1. 登录学习通，打开任意课程 → 进入新版课程页，复制地址栏 URL
2. 按上文规则手工拼出旧版 URL，或在油猴菜单里用「现在手动跳旧版」
3. 对照 `t` 是否被带上、`v` 是否为 `2`
