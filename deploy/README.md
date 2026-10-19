# 知识库在线更新 — 服务端部署

> Phase 2 单元6（Day53-54）。为 APP 的知识库在线增量更新提供 Nginx 静态文件服务。

## 整条链路

```
scripts/generate_knowledge.py          脚本generate_manifest.py
  care JSON + barrel + 版本常量            发布清单 version.json
            │                                      │
            └──────────► APP 打包 ◄────────────────┘
                             │                     │
                             │              上传到 Nginx 静态目录
                             ▼                     ▼
                   启动时拉 version.json ────► 比对版本 + 算变更文件
                             │                     │
                             └──── 增量下载变更 JSON（Day55-56）
```

**关键：版本号只有一个来源** —— `scripts/knowledge_version.txt`。
两个生成脚本都读它。不要分别去改生成物，否则会出现「随包版本」与「清单版本」
对不上，表现为 APP 永远收不到更新。

## 目录

| 路径 | 用途 |
|------|------|
| `nginx/smart-garden.conf` | Nginx 站点配置（HTTPS + 静态目录 + 缓存策略） |
| `generate-self-signed-cert.sh` | 自签证书（**仅内网调试**，见下方警告） |
| `example/version.json` | 清单样例。由生成脚本产出，供契约测试用，不要手改 |
| `static/` | 生成的发布目录（已 gitignore，上传到服务器即可） |
| `certs/` | 证书私钥（已 gitignore，**绝不能入库**） |

## 首次部署

```bash
# 1. 在服务器上装 nginx
sudo apt update && sudo apt install -y nginx

# 2. 建静态根目录
sudo mkdir -p /var/www/smart-garden/care

# 3. 放站点配置（先替换里面所有 YOUR_DOMAIN）
sudo cp nginx/smart-garden.conf /etc/nginx/sites-available/smart-garden
sudo ln -s /etc/nginx/sites-available/smart-garden /etc/nginx/sites-enabled/

# 4. 申请证书（需要域名已解析到本机）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain

# 5. 校验并重载
sudo nginx -t && sudo systemctl reload nginx
```

## 每次更新知识库内容

```bash
# 1. 改养护数据
vim SmartGarden/assets/care/玫瑰.json

# 2. ⚠️ 改版本号 —— 这一步最容易忘 ⚠️
#    不改这里，version.json 里的版本号不变，APP 会认为「已是最新」，
#    你上传了新数据也没人下载。现象是「本地测试明明更新了，线上纹丝不动」。
vim scripts/knowledge_version.txt

# 3. 同步随包版本常量（APP 端用）
python scripts/generate_knowledge.py

# 4. 生成发布清单
python scripts/generate_manifest.py --base-url https://your.domain/care \
    --changelog "补充了玫瑰的夏季浇水频率"

# 5. 上传（内容变了才需要传，rsync 只传差异）
rsync -av --delete deploy/static/care/ user@server:/var/www/smart-garden/care/

# 6. 顺手刷新契约测试的样例
cp deploy/static/care/version.json deploy/example/version.json
```

第 6 步别跳过：`KnowledgeManifest.contract.test.ts` 会拿 `example/version.json` 里的
checksum 去比对真实的养护数据，不同步就会测试失败（**这是故意的**，否则
「数据改了但清单没重生成」要到线上才暴露）。

## 验证部署

```bash
# 清单能取到、版本号对
curl -s https://your.domain/care/version.json | head -5

# 中文文件名的百分号编码路径能取到
curl -sI "https://your.domain/care/%E7%8E%AB%E7%91%B0.json" | head -3

# 清单里的 checksum 与实际文件一致（防上传不完整）
curl -s https://your.domain/care/version.json \
  | python -c "import json,sys; m=json.load(sys.stdin); print(len(m['files']), '个文件, 版本', m['version'])"
```

## 证书：为什么不能用自签

**APP 里用不了自签证书。** React Native 的 `fetch` 走系统 TLS 栈、会校验证书链，
自签证书不在信任列表里，请求直接以 TLS 错误失败 —— 不是返回 404/500，而是连不上，
现象是「知识库检查永远 error」。

所以：

| 场景 | 方案 |
|------|------|
| 有域名（正式环境） | Let's Encrypt，免费且被系统信任 |
| 只有公网 IP | Let's Encrypt 不对纯 IP 发证。HTTPS 需自备受信证书；内网调试可先只跑 HTTP |
| 本机/内网调 Nginx 配置 | 自签 + `curl -k` 或浏览器手动放行 |

```bash
# 自签（仅调试）
./deploy/generate-self-signed-cert.sh 192.168.1.10
```

## 缓存策略（改配置前先读）

`version.json` 是 **`no-store`**，养护数据是 `max-age=300`。这不是随手写的：

- **清单绝不能缓存** —— APP 靠定时拉它判断有没有新版。一旦被缓存，用户会在
  缓存过期前完全收不到更新，且现象是「部分用户更新了、部分没有」，极难排查。
- **数据文件不能长缓存** —— 文件名不随内容变化（`玫瑰.json` 永远是 `玫瑰.json`），
  长缓存会导致内容更新后客户端一直拿旧文件。

想改成 immutable 长缓存的话，得让文件名带上内容哈希（清单里出
`玫瑰.<hash>.json` 这样的 url，键仍是 `玫瑰.json`），那需要同步改生成器和客户端。

配置里每个 `location` 都重复写了 `add_header`（含 HSTS）——
因为 nginx 的 `add_header` **不继承**：只要 location 里出现了自己的 `add_header`，
server 块的就全部失效。这是 nginx 最著名的坑之一。

## 客户端的校验强度（改数据前值得知道）

APP 端**不做字节级 checksum 校验**。React Native 没有内置 crypto，算 sha256 要引入
原生依赖，为一份 156KB 的公开数据不划算。客户端实际做的是：

- `JSON.parse` 必须成功 —— 挡住错误页（返回 HTML）与截断
- 解析结果必须有 `flowerName` 与合法的 `flowerId` —— 挡住结构损坏

清单里的 `checksum` 仍然重要，但主要用于**判断哪些文件需要下载**（增量），
而不是校验内容完整性。所以上传时务必确认文件完整 —— 服务端可以这样自查：

```bash
# 清单里的 checksum 与静态目录里的实际文件是否一致
python - <<'EOF'
import json, hashlib, pathlib
m = json.load(open('deploy/static/care/version.json', encoding='utf-8'))
base = pathlib.Path('deploy/static/care')
bad = [n for n, e in m['files'].items()
       if hashlib.sha256((base / n).read_bytes()).hexdigest() != e['checksum']]
print('不一致:', bad or '无')
EOF
```

## 已知未验证项

- **`nginx/smart-garden.conf` 没有经过 `nginx -t` 实测** —— 生成它的环境里没装 nginx。
  上线前务必先跑 `sudo nginx -t`。
- `http2` 需要 nginx ≥ 1.25.1（用 `http2 on;`）；更老的版本要写成 `listen 443 ssl http2;`。
- **整条链路没有在真机上跑过** —— 没有服务器，`deploy/static/` 从未真正被 HTTP 服务过。
  客户端逻辑有 42 个用例覆盖（含下载失败、内容非法、部分失败重试等），
  但「连真实 Nginx 下载并生效」这一步尚未验证。
