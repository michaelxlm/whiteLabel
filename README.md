# 白标开店 · 开源免费的静态站套件

> 纯静态站脚手架 + 全套 SEO + 独立管理端 + 广告位框架 + 本地埋点 + 自带 Key 的本地 AI 助手代理。
> **零第三方依赖、git clone 即用、不限域名、可多站部署。开源免费，赏赞自愿。**

一套你自己部署、自己维护的建站源码：内容用 JSON 驱动，构建产出纯静态 HTML，管理端可视化改内容并一键发布。没有中台、不托管、不代部署，数据全部留在你自己的服务器上。

- 唯一仓库：<https://github.com/michaelxlm/whiteLabel.git>
- 产品介绍：<https://xuliming.com/white-label.html>
- 完整安装手册：[INSTALL.md](./INSTALL.md) ｜ 部署参考：[deploy/README.md](./deploy/README.md)

---

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 纯静态、零依赖 | 构建脚本与 Node 服务只用内置模块，`git clone` 后无需 `npm install` 即可构建运行 |
| 四套站型模板 | `content` 内容站 / `tool` 工具站 / `nav` 导航站 / `blog` 博客站，构建时一行参数切换 |
| 全套 SEO | 每页 meta / canonical / hreflang / JSON-LD，自动生成 `sitemap.xml`、`robots.txt`、`llms.txt` |
| 明暗双主题 | 响应式布局，明暗主题自动或手动切换，中英双语可选 |
| 独立管理端 | 零构建 admin（随构建拷贝到 `dist/admin/`），可视化 CRUD 文章 / 工具 / 导航 / 广告 / 站点设置，一键发布 |
| 广告位框架 | 内置广告位挂载点，展示内容由你自己填写，不接任何外部广告库存 |
| 本地埋点 | 展示 / 点击事件只写本机 `data/stats/events.jsonl`，不外发、无第三方看板 |
| 本地 AI 助手 | 右下角问答气泡，走「你的服务器 → 你的模型」，自带 Key 本地代理 + FAQ 降级 + 限流，密钥只存本地 |
| 授权水印 | 三层署名指纹（管理端页脚 / HTML 注释 / `assets/license.js`），不对访客可见 |

## 演示站点

| 站型 | 示例 |
| --- | --- |
| 内容站 | <https://585.ink/> |
| 工具站 | <https://2002cs.com/> |
| 导航站 | <https://xuliming.com/> |
| 博客站 | <https://zangeng.com/> |

## 快速开始

环境：Node.js >= 16，无需 `npm install`。

```bash
git clone https://github.com/michaelxlm/whiteLabel.git my-site
cd my-site

node scripts/build.js          # 构建静态站到 dist/
node server/index.js           # 启动本地服务（默认 8787 端口）
```

浏览器打开 <http://localhost:8787> 看前台，<http://localhost:8787/admin/> 进管理端（开源版默认口令 `admin/admin123`，上线前请修改，见[安装手册](./INSTALL.md)）。

切换站型 / 双语构建：

```bash
node scripts/build.js --template=nav     # content / tool / nav / blog
node scripts/build.js --lang=zh-en       # 中文在根、英文在 dist/en/
```

> 更多参数、常驻进程（PM2 / systemd）、Nginx 反代、HTTPS、AI 助手配置与首次上线检查，见 **[完整安装手册](./INSTALL.md)**。

## 目录结构

```
whiteLabel/
├── site/            模板与前端资源（构建输入；site/admin 为零构建管理端源）
├── data/            内容与配置 JSON（articles/tools/navs/posts/ads/settings）
│                    promo.json 推广位；ai-config.json 为 AI 凭据（已 gitignore）
├── scripts/         构建脚本（build.js / build-en.js / gen-llms.js / inject.js / license-client.js）
├── server/          零依赖 Node 服务（静态托管 + 内容 CRUD + 埋点 + 触发构建 + AI 代理）
├── dist/            构建产物（不入库；dist/admin/ 即开箱即用的管理端）
├── deploy/          Nginx / PM2 / systemd 部署参考 + deploy/README.md
├── docs/            文档与图片资源（含赏赞二维码）
├── INSTALL.md       完整安装手册
├── license.json     开源公开授权信息（构建时注入三层标识）
└── package.json     npm scripts 快捷入口
```

## 文档索引

- [完整安装手册](./INSTALL.md) — 环境准备、clone、构建、运行、常驻、反代、HTTPS、AI、上线检查、FAQ
- [部署参考](./deploy/README.md) — Nginx / PM2 / systemd 配置片段与 license 说明
- [产品介绍页](https://xuliming.com/white-label.html) — 在线版功能与获取说明

## 赏赞支持

本项目开源免费，**赏赞自愿，不是获取或使用的前置条件**。如果这套源码帮你省了事，可以扫码前往赏赞致谢页表示支持：

![赏赞二维码](./docs/reward-qrcode.png)

扫码打开 [赏赞致谢页](https://xuliming.com/white-label.html)。若你希望改成自己的收款码（微信 / 支付宝），把 `docs/reward-qrcode.png` 替换为你的收款二维码，并把本节的链接改成对应收款页即可。

## License

`license.json` 为开源公开授权（`key: WL-OPEN-SOURCE`）。源码完整开放，任意域名、多站部署均可；不设授权门槛。管理端登录与发布会做一次 License 软校验，**校验不通过不影响任何功能**，仅在日志留痕；需要完全离线时在 `data/settings.json` 设 `"licenseCheck": false`。

站点主体、内容与备案由使用者自行承担；本项目不托管、不代部署、无售后与技术支持、无内容代运营。
