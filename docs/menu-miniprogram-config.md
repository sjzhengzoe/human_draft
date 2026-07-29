# 菜单小程序配置清单

## 1. Supabase

在 Supabase 创建项目后，将以下内容填入项目根目录 `.env`：

| 配置 | 填写内容 | 状态 |
| --- | --- | --- |
| `SUPABASE_URL` | Project URL | 待填写 |
| `SUPABASE_SECRET_KEY` | 服务端 `sb_secret_...` Secret key | 待填写 |
| `SUPABASE_DISH_BUCKET` | 默认 `dish-images` | 已默认 |
| `SUPABASE_AVATAR_BUCKET` | 默认 `user-avatars` | 已默认 |

在 Supabase SQL Editor 执行：

`supabase/migrations/202607110001_menu_auth.sql`

然后继续执行服务端表权限：

`supabase/migrations/202607110002_grant_service_role.sql`

生活清单功能还需要继续执行：

`supabase/migrations/202607110003_life_lists.sql`

用户头像和昵称功能还需要继续执行：

`supabase/migrations/202607110004_user_profiles.sql`

最后依次执行排序交换、资料完成状态和并发完整性迁移：

- `supabase/migrations/202607110005_sort_order_swaps.sql`
- `supabase/migrations/202607110006_user_profile_completion.sql`
- `supabase/migrations/202607110007_sort_order_integrity.sql`
- `supabase/migrations/202607110008_auth_and_sort_concurrency.sql`

以上 migration 会依次创建账号、会话、菜单、生活清单、排序函数，以及菜品和用户头像所需的公开只读 Bucket。

## 2. 微信小程序登录

| 配置 | 填写内容 | 状态 |
| --- | --- | --- |
| `WECHAT_APP_ID` | 小程序 AppID | 已填写 |
| `WECHAT_APP_SECRET` | 微信公众平台的 AppSecret | 待填写 |
| `WECHAT_ALLOWED_OPENIDS` | 管理员微信 openid，多个用逗号分隔 | 首次登录后填写 |

首次登录后，“我的 → 我的 OpenID”可以直接复制当前账号的 `openid`。将它填入白名单后重启 Node 服务，再退出并重新登录一次。

白名单只控制修改权限，所有登录账号读取同一份共享菜单数据。

## 3. 小程序域名

生产 API 默认是 `https://gufeifei.cn`，配置位置：

`../src/config/env.ts`

微信开发者工具的 `develop` 环境默认请求 `http://127.0.0.1:3000`。真机调试时不能使用手机自身的 `127.0.0.1`，需要把开发地址改为电脑局域网 IP，或者先部署 HTTPS Node 服务。

微信公众平台需要配置：

- request 合法域名：`https://gufeifei.cn`
- uploadFile 合法域名：`https://gufeifei.cn`
- downloadFile 合法域名：`https://gufeifei.cn`
- downloadFile 合法域名：Supabase 项目的精确域名，例如 `https://xxxx.supabase.co`

## 4. 服务器环境

生产服务器将真实配置保存在 `/etc/human-draft.env`，不要把本机 `.env` 上传到 Git。可参考仓库根目录 `.env.example`，使用以下命令创建并限制权限：

```bash
sudo install -m 600 /dev/null /etc/human-draft.env
sudoedit /etc/human-draft.env
```

至少需要填写：

```dotenv
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SECRET_KEY=你的服务端 Secret key
WECHAT_APP_ID=你的小程序 AppID
WECHAT_APP_SECRET=你的小程序 AppSecret
WECHAT_ALLOWED_OPENIDS=管理员openid，多个用逗号分隔
```

`SUPABASE_SECRET_KEY` 和 `WECHAT_APP_SECRET` 只能存在服务器上。systemd unit 已通过 `EnvironmentFile=/etc/human-draft.env` 读取它们。

TLS 证书和私钥也不要放进 Git。将腾讯云下载的 Nginx 完整证书链与私钥单独安装到服务器：

```bash
sudo install -d -m 700 /etc/nginx/ssl/gufeifei.cn
sudo install -m 644 /你的临时路径/gufeifei.cn_bundle.pem /etc/nginx/ssl/gufeifei.cn/
sudo install -m 600 /你的临时路径/gufeifei.cn.key /etc/nginx/ssl/gufeifei.cn/
```

仓库内的 `nginx.conf` 已使用上述路径。

配置完成后：

```bash
sudo cp deploy/human-draft-server.service /etc/systemd/system/human-draft-server.service
sudo systemctl daemon-reload
sudo systemctl restart human-draft-server
curl https://gufeifei.cn/api/health
```

当健康检查的 `configured` 为 `true` 且 `missing_config` 为空时，运行配置已完整。

## 5. 导入旧菜品

数据库和 Bucket 配置好后运行：

```bash
pnpm run import:dishes
```

脚本会导入 `public/食物待打印` 和 `public/食物已打印` 顶层图片；再次运行会按“分类 + 菜名”跳过已有记录。
