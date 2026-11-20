# 白标开店 · 完整安装手册

> 从零到上线：环境准备 → 获取源码 → 构建 → 运行 → 常驻 → 反代与 HTTPS → 管理端 → AI 助手 → 上线检查 → 常见问题。
> 全程只用 Node.js 内置模块，**不需要 `npm install`**（除非你要二次开发 Vue 版管理端，见第七节）。

---

## 一、环境准备

| 项 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | >= 16（推荐 18/20/22 LTS） | 构建脚本与本家服务都只用内置模块 |
| Git | 任意版本 | 用于 clone / pull 获取与更新源码 |
| Web 服务器 | Nginx / Caddy 二选一，或直接用自带 Node 服务 | 静态根指向 `dist/` |
| 进程守护 | PM2 或 systemd 二选一 | 常驻 `server/index.js` |
| 域名 + HTTPS | 正式上线需要 | 证书用 Let's Encrypt 等 |

检查环境：

```bash
node --version   # 应 >= v16
git --version
```

## 二、获取源码

```bash
git clone https://github.com/michaelxlm/whiteLabel.git my-site
cd my-site
```

后续更新始终拉同一份源码：

```bash
git pull
```

> 目录约定：下文命令均在仓库根目录 `my-site/` 下执行。`dist/`、`data/stats/`、`data/ai-config.json`、`server/admin-credentials.json` 均已在 `.gitignore`，更新源码不会覆盖你的运行时数据与凭据。

## 三、配置站点

编辑 `data/settings.json`，至少改这几项：

```json
{
  "siteName": "你的站点名",
  "tagline": "一句话副标题",
  "description": "站点描述（SEO 用）",
  "domain": "your-domain.com",
  "language": "zh",
  "theme": "auto",
  "template": "content",
  "author": "站点主理人",
  "contactEmail": "hello@your-domain.com",
  "icp": "你的ICP备案号"
}
```

- `domain`：填你的正式域名（不带 `https://` 和路径），用于生成 canonical 与 sitemap。
- `template`：`content` / `tool` / `nav` / `blog` 四选一，也可构建时用 `--template` 覆盖。
- `language`：`zh` / `en` / `zh-en`（双语）。
- `theme`：`auto` / `light` / `dark`。
- `icp`：国内上线填备案号，会显示在页脚。

内容数据都在 `data/` 下：`articles.json`、`tools.json`、`navs.json`、`posts.json`、`ads.json`。可直接改 JSON，也可在管理端改（推荐）。示例演示站地址配置在 `data/promo.json`，把 `examples` 里的 URL 换成你自己的站点即可用于引流。

## 四、构建站点

```bash
node scripts/build.js                    # 默认按 settings.json 构建到 dist/
node scripts/build.js --template=nav     # 指定站型
node scripts/build.js --lang=zh-en       # 双语：中文在根、英文在 dist/en/
npm run build                            # 等价于 node scripts/build.js
npm run build:en                         # 英文站
npm run llms                             # 单独重生成 llms.txt
```

构建成功后 `dist/` 应包含：

```
index.html  about.html  articles.html
sitemap.xml  robots.txt  llms.txt
article/*.html
assets/  (style/theme/tokens/track/license/ai-assistant/ad-slot 等)
admin/   (index.html / admin.css / admin.js —— 开箱即用的管理端)
```

> 管理端**无需构建**：`build.js` 把 `site/admin/` 的三份零构建文件拷到 `dist/admin/`。二次开发改 `site/admin/admin.js` 与 `admin.css`，改完重跑一次 `node scripts/build.js` 生效（Vue 版见第七节）。

## 五、运行服务

```bash
PORT=8787 node server/index.js
# 或
npm run serve
# 或（构建 + 启动一步到位）
npm run dev
```

服务职责：静态托管 `dist/`、内容 JSON 读写 API、`/track` 埋点落盘、管理端登录、发布时触发构建、AI 助手代理。

主要接口（管理端 SPA 使用）：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/track` | 埋点上报，写入 `data/stats/events.jsonl`（只落本机） |
| POST | `/admin/api/login` | 管理员登录，返回 Bearer 令牌 |
| GET | `/admin/api/stats` | 本地埋点聚合统计 |
| GET/PUT | `/admin/api/{articles\|tools\|navs\|posts\|ads\|settings}` | 内容读写 |
| POST | `/admin/api/publish` | 触发构建（内部调 `scripts/build.js`） |
| GET | `/api/ai/status` | AI 助手公开状态探测 |
| POST | `/api/ai/chat` | AI 问答代理 |
| GET/POST | `/admin/api/aiConfig` | AI 配置读写（鉴权） |
| POST | `/admin/api/aiTest` | AI 连通测试（鉴权） |

**管理员口令**：开源版默认 `admin/admin123`，仅本地开发使用。上线前务必修改：

```bash
# 生成强口令并写入 server/admin-credentials.json（该文件已 gitignore）
node -e "const c=require('crypto').randomBytes(12).toString('hex');require('fs').writeFileSync('server/admin-credentials.json',JSON.stringify({user:'admin',pass:c}));console.log('新口令:',c)"
```

删除该文件则会回落到默认口令 `admin/admin123`，请配合服务器访问控制使用。会话令牌存内存，服务重启后需重新登录。

## 六、常驻进程

### 方式 A：PM2

```bash
npm i -g pm2
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup     # 按提示设置开机自启
```

`deploy/ecosystem.config.js` 已配 `cwd`、`PORT=8787`、`instances=1`、`fork` 模式、`max_memory_restart=200M`。

### 方式 B：systemd

```bash
sudo cp deploy/white-label.service /etc/systemd/system/white-label.service
# 编辑文件里的 WorkingDirectory 为你的实际路径、ExecStart 的 node 路径
sudo systemctl daemon-reload
sudo systemctl enable --now white-label
sudo systemctl status white-label
```

## 七、反代、HTTPS 与静态托管

### Nginx 参考（见 `deploy/nginx.conf`）

- 静态根 `root` 指向 `dist/`；
- `/track` 与 `/admin/api/` 反代到本机 `http://127.0.0.1:8787`；
- `/admin/` 指向 `dist/admin/index.html`；
- 配好证书后强制 HTTPS。

要点示例：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    root /var/www/my-site/dist;
    index index.html;

    # 管理端与 API 反代到本地 Node 服务
    location /admin/api/ { proxy_pass http://127.0.0.1:8787; proxy_set_header Host $host; }
    location /track      { proxy_pass http://127.0.0.1:8787; }
    location /api/ai/    { proxy_pass http://127.0.0.1:8787; }
    location /admin/     { try_files $uri /admin/index.html; }

    location / { try_files $uri $uri/ /index.html; }
}
```

证书用 `certbot --nginx -d your-domain.com` 申请，配好定时任务自动续期。

### Caddy（更简）

```caddyfile
your-domain.com {
    root * /var/www/my-site/dist
    encode gzip
    reverse_proxy /admin/api/* 127.0.0.1:8787
    reverse_proxy /track 127.0.0.1:8787
    reverse_proxy /api/ai/* 127.0.0.1:8787
    try_files {path} {path}/ /index.html
    file_server
}
```

### 纯静态托管（不用 Node 服务）

只把 `dist/` 传到任意静态托管即可，前台完全可用。管理端的**内容读写 / 发布 / 埋点 / AI 代理**依赖 Node 服务；没有服务时 AI 气泡静默不出现，对其他功能零影响。

## 八、管理端使用

1. 浏览器打开 `https://你的域名/admin/`，用第 五 节设置的口令登录。
2. 左侧菜单：**内容**（文章 / 工具 / 导航 / 文章列表）、**广告位**、**站点设置**、**统计**、**License**、**发布**。
3. 改完内容后到 **发布** 点“发布”，或执行 `POST /admin/api/publish`，服务会重跑构建更新 `dist/`。
4. 前台刷新即可看到新内容。

License 软校验：登录与发布时 `license-client.js` 会调外部校验口，`key: WL-OPEN-SOURCE` 为公开授权，**校验不通过不影响功能**，仅在控制台与 `data/stats/license.log` 留痕。完全离线在 `data/settings.json` 设 `"licenseCheck": false`。

## 九、AI 助手（可选）

右下角问答气泡，链路是「你的服务器 → 你的模型」，不经过第三方计费平台。

1. 复制模板并填写你自己的 OpenAI 兼容端点：

   ```bash
   cp data/ai-config.example.json data/ai-config.json
   ```

   ```json
   {
     "enable": true,
     "baseURL": "https://你的模型端点/v1",
     "apiKey": "你的密钥",
     "model": "模型名",
     "rateLimitPerMinute": 12,
     "faqs": [],
     "fallbackAnswer": "暂时无法回答，请稍后再试。"
   }
   ```

   也可在管理端「AI 助手」Tab 填写并点“保存并测试连接”。

2. `data/ai-config.json` 含真实密钥，已在 `.gitignore`，不会进仓库；示例模板密钥为空随包分发。
3. 保存即生效、无需重新构建：访客页探测 `GET /api/ai/status`，`enable` 且配置齐全才显示气泡。
4. 上游失败时 fail-soft 回落预置 `faqs` / `fallbackAnswer`，不会 5xx；默认单 IP 每分钟限流 12 次；提问事件走本地埋点 `ai_chat`，数据只落你自己的服务器。

## 十、二次开发 Vue 版管理端（可选）

仓库自带 `admin/` 是独立的 Vue 3 + Vite 工程，与 `site/admin/` 的零构建版二选一。要用 Vue 版：

```bash
cd admin
npm install
npm run build        # 产出 admin/dist/
npm run dev          # 本地开发预览
```

把 `admin/dist/` 的内容同步到站点 `dist/admin/` 即可替换零构建管理端。日常只改内容不建议动它——零构建版改一个 JS 文件更省事。

## 十一、首次上线检查清单

- [ ] `node scripts/build.js` 无报错，`dist/` 生成 `index.html` / `sitemap.xml` / `robots.txt` / `llms.txt`
- [ ] 浏览器打开站点，明暗主题、双语（若启用）、模板版式正常
- [ ] 管理端登录 → 改一条内容 → 发布 → 前台刷新可见
- [ ] 修改了默认管理员口令 `admin/admin123`
- [ ] Nginx / Caddy + 证书配好，`https://你的域名/sitemap.xml` 可打开
- [ ] （可选）AI 助手气泡按预期出现 / 隐藏，密钥未进仓库

## 十二、常见问题

**Q：`git clone` 后直接双击 `dist/index.html` 打不开？**
A：站点的 canonical / 资源路径基于域名，请用 HTTP 服务（`node server/index.js` 或 Nginx）访问，不要 `file://` 直接打开。

**Q：`git pull` 更新后我的内容/口令/密钥会丢吗？**
A：不会。内容 `data/*.json` 虽在版本内，但正常只改内容不改源码；运行时数据 `data/stats/`、凭据 `server/admin-credentials.json`、AI 密钥 `data/ai-config.json` 均已 gitignore。若你改过被版本跟踪的 `data/*.json`，pull 前先备份。

**Q：服务重启后管理端登录失效？**
A：正常，会话令牌存内存，重启即失效，重新登录即可。

**Q：License 校验失败会影响站点吗？**
A：不会。软校验仅留痕不阻断；要彻底关掉外网校验见第八节。

**Q：能挂多个域名 / 多站点吗？**
A：可以。clone 多份、各自配置 `data/settings.json` 与域名即可；`license.json` 为开源公开授权，不设授权门槛。

**Q：想换成自己的赏赞收款码？**
A：替换 `docs/reward-qrcode.png` 为你的微信 / 支付宝收款二维码，并把 `README.md` 赏赞节的链接改成对应收款页。

---

赏赞自愿，不是获取前置。若这套源码帮你省了事，欢迎扫码支持（见 [README 赏赞节](./README.md#赏赞支持)）。项目开源免费，主体、内容与备案由使用者自行承担；不托管、不代部署、无售后与技术支持。
