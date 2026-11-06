---
title: 白标套件部署说明（开源版）
owner: Michaelxlm
updated: 2026-11-06
scope: white-label
status: 有效
tags: [white-label, 部署, 开源]
---

# 部署说明（开源 · git clone 分发）

本套件是**纯静态站 + 一个极简 Node 管理端服务**，部署在你自己的服务器上，自部署自维护。
**以开源形式提供**：所有人都可以直接 `git clone` 获取最新版；赏赞（赞助）是推荐动作而非强制门槛，知道仓库地址即可直接下载使用。

> 仓库地址：<https://github.com/michaelxlm/whiteLabel.git>

## 获取代码（取代旧版「下载 ZIP / 解压交付包」）

```bash
git clone https://github.com/michaelxlm/whiteLabel.git my-site
cd my-site
```

此后获取更新只需：

```bash
git pull   # 始终拉到最新版，所有人均用同一份源码
```

## 环境

- Node.js >= 16（构建脚本与管理端服务都只用 Node 内置模块，**无需 `npm install`**）
- 一个 Web 服务器（Nginx 或 Caddy 皆可），或用本套件自带的 `server/index.js` 直接对外提供静态文件
- 建议用 PM2 或 systemd 常驻 `server/index.js`（负责内容读写、埋点落盘、触发构建）

## 目录

```
site/        模板与前端资源（构建输入；`site/admin` 为管理端零构建源）
data/        内容与配置（JSON，管理端可读写；promo.json 为推广位配置；ai-config.json 为 AI 助手凭据，已 gitignore）
scripts/     构建脚本（build.js / build-en.js / gen-llms.js / inject.js / license-client.js）
server/      本地服务（零依赖 Node，静态托管 + 内容 CRUD + /track 埋点 + 触发构建）
dist/        构建产物（对外发布的目录；`dist/admin/` 为可直接使用的管理端）
deploy/      本目录：nginx.conf / ecosystem.config.js / white-label.service / README.md
license.json 开源公开授权信息（构建时注入三层标识）
```

## 一、构建站点

```bash
node scripts/build.js            # 按 data/settings.json 的语言与模板产出到 dist/
node scripts/build.js --lang=zh-en   # 双语：中文在根、英文在 dist/en/
node scripts/build.js --template=nav # 切换模板（content / tool / nav / blog）
```

管理端**无需构建**：`node scripts/build.js` 会把 `site/admin` 的三份零构建文件（`index.html` / `admin.css` / `admin.js`）拷到 `dist/admin/`，开箱即用。二次开发直接改 `site/admin/admin.js` 与 `admin.css`，改完重跑一次 `node scripts/build.js` 即可生效。

## 二、运行管理端服务

```bash
# 本地无凭据文件时回落默认口令 admin/admin123（开源版不再由打包脚本注入随机口令）
PORT=8787 node server/index.js
```

接口（管理端 SPA 使用）：

- `POST /track`            埋点上报（写入 `data/stats/events.jsonl`，只落本机）
- `POST /admin/api/login`  管理员登录，返回 Bearer 令牌
- `GET  /admin/api/stats`  本地埋点聚合统计
- `GET/PUT /admin/api/{articles|tools|navs|posts|ads|settings}`  内容读写
- `POST /admin/api/publish` 触发构建（内部调用 `scripts/build.js`）
- `GET /api/ai/status` / `POST /api/ai/chat` AI 助手公开探测与问答代理（见第五节）
- `GET/POST /admin/api/aiConfig` / `POST /admin/api/aiTest` AI 助手配置读写与连通测试（鉴权）

> 登录口令：开源版默认 `admin/admin123`。上线前请自行修改 `server/admin-credentials.json`（`{"user":"admin","pass":"你的强口令"}`），或删除该文件使用默认口令的同时做好服务器访问控制。

## 三、常驻与反代

- **PM2**：`pm2 start deploy/ecosystem.config.js`
- **systemd**：参考 `deploy/white-label.service`
- **Nginx**：参考 `deploy/nginx.conf`，静态根指向 `dist/`，`/track` 与 `/admin/api/` 反代到本机 `8787`

## 四、License 与推广说明

- `license.json` 为**开源公开授权**（`key: WL-OPEN-SOURCE`），构建时注入三层标识（管理端页脚 / 每页 HTML 注释 / `assets/license.js` 指纹），署名统一为 `xuliming.com 白标开店`，用于品牌推广。
- 管理端登录与发布时会做一次 License 软校验（`license-client.js` 调 `api.xuyiheng.com` 校验口）：即便校验未通过，站点与管理端**功能照常**，仅在控制台与 `data/stats/license.log` 留痕。若需完全离线，可在 `data/settings.json` 设 `"licenseCheck": false` 停用外网校验。
- **代码示例推广**：套件内置的示例内容（文章 / 模板）对应真实的演示站点，地址配置在 `data/promo.json`。把其中的 URL 换成你自己的站点，即可在文章详情页与站点页脚展示引流链接。

## 五、AI 助手（可选 · 自带 Key 本地代理）

站点自带右下角 AI 问答悬浮气泡，链路是「你的服务器 → 你的模型」，不经过任何第三方平台计费：

1. 把 `data/ai-config.example.json` 复制为 `data/ai-config.json`，填上你自己的 OpenAI 兼容端点 `baseURL` / `apiKey` / `model`，并把 `enable` 设为 `true`；也可以直接在管理端「AI 助手」Tab 里填写并点「保存并测试连接」。
2. `data/ai-config.json`（含真实密钥）已在 `.gitignore` 里，不会进仓库；示例模板（密钥置空）随包分发。
3. 保存即生效、无需重新构建：访客页面探测 `GET /api/ai/status`，`enable` 且配置齐全才出现气泡；纯静态托管（没有 Node 服务）时探测失败，组件整体静默不出现，零影响。
4. 上游调用失败时 fail-soft 回落预置 `faqs` / `fallbackAnswer`，绝不 5xx；默认带单 IP 每分钟限流（`rateLimitPerMinute`，默认 12）；提问事件走本地埋点 `ai_chat`，数据只落你自己的服务器。

## 六、首次上线检查

1. `node scripts/build.js` 无报错，`dist/` 生成 `index.html` / `sitemap.xml` / `robots.txt` / `llms.txt`
2. 浏览器打开站点，明暗主题、双语（若启用）、广告位框架正常
3. 管理端登录 → 改一条内容 → 发布 → 前台刷新可见
4. Nginx + 证书配置完成后，用你的域名访问 `https://你的域名/sitemap.xml` 可打开
