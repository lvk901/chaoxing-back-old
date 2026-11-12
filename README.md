# 学习通 自动回到旧版 · Chaoxing Auto Switch to Old UI

用油猴脚本把学习通新版（`fanyav3`）页面自动切回旧版。课程页直接改写 URL 跳转，新版界面完全不渲染 —— 没有闪屏、没有多等一次加载。

> 学习通新版前端（`/mooc2-ans-vue/fanyav3/*`）功能残缺、交互别扭，而官方「回到旧版」入口又藏在新版页面里。这个脚本把那一下点击自动化。

## 功能

- ✅ 打开新版课程页 → 立刻落到旧版页面（`document-start` 阶段完成，无闪屏）
- ✅ 其它新版页面 → 等页面加载完，自动点击「回到旧版」
- ✅ 已在旧版页时不做任何动作（不会来回跳）
- ✅ 循环保护：跳转 15 秒内最多 5 次
- ✅ 油猴菜单可临时开关、可手动跳一次

## 安装

### 1. 装 Tampermonkey

| 浏览器 | 地址 |
| --- | --- |
| Chrome | https://chromewebstore.google.com/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo |
| Edge | https://microsoftedge.microsoft.com/addons/detail/gcalenpjmijncebpfijmoaglllgpjagf |
| Firefox | https://addons.mozilla.org/firefox/addon/tampermonkey/ |

Chrome / Edge 138+ 还要在扩展详情页里打开「**允许运行用户脚本**」，否则油猴装得上但脚本不生效。

### 2. 装本脚本

任选一种：

**A. 一键安装（需已发布到 GitHub，替换用户名）**

```
https://raw.githubusercontent.com/<your-name>/chaoxing-back-old/main/chaoxing-back-old.user.js
```

把这个地址贴进地址栏，油猴会接管并弹出安装页。Raw 地址返回的是 `text/plain`，多数油猴版本仍能识别；若被当成纯文本展示，用方法 B。

**B. 复制粘贴（最保险）**

油猴面板 → 「+」新建脚本 → 清空模板 → 粘贴 `chaoxing-back-old.user.js` 全文 → `Ctrl/Cmd + S`。

**C. 本地文件**

把 `.user.js` 拖进浏览器窗口。若没反应，先在扩展详情页打开「允许访问文件网址」再拖。

## 原理

脚本做的事情本质是一次 URL 改写，规则来自对真实跳转的抓包对比（详见 [docs/url-mapping.md](docs/url-mapping.md)）：

```
新版 /mooc2-ans-vue/fanyav3/{stu,studentCourse}
  → 旧版 /mooc2-ans/mycourse/stu
```

新版查询串里的 `t`、`enc` 是页面级令牌，必须原样带到旧版 URL，否则服务端返回「无效的参数」；旧版还要额外补上 `courseid` / `clazzid` / `v=2` / `pageHeader=0` / `hideHead=0` / `forceMooc2=true`。

试过但不成立的「更简单办法」（结论：只能改写 URL）：

- 往新版 URL 加 `forceMooc2=true` / `v=2` / `old=1` / `hideOldVersion=0` —— 服务端依旧返回新版
- 点「回到旧版」后没有写入任何 cookie / localStorage，也没有切换接口调用

## 已知问题

- 脚本只处理 `stu` / `studentCourse` 这两个已知新版路由的直接跳转；遇到其它新版路由走「自动点击」兜底，依赖页面里出现 `.back-old` 元素。
- 如果学校定制了新版页面、或用 `fid=74942` 这类特殊配置，官方自己就隐藏了「回到旧版」入口，此时脚本也无能为力。
- 旧版页里也存在 class 含 `backOld` 的元素，所以选择器只认精确的 `.back-old`，避免误点导致来回跳。

## 免责声明

本项目仅做页面跳转的自动化，不抓取、不存储、不上传任何账号数据；脚本里不含任何硬编码的课程 ID、令牌或个人身份信息，全部在运行时从当前 URL 读取。请自行确保使用方式符合所在平台的服务条款。

## License

[MIT](LICENSE)
