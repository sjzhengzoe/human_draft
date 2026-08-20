# human_draft

## 项目状态

**当前为未上线开发阶段，尚未正式发布。**

未上线阶段不保留历史代码、API、会话、表结构或数据格式的向后兼容。
当新方案取代旧方案时，应先校验并迁移现有有效业务数据，然后在同一次改动中直接切换读写、删除旧表、旧字段、双写、降级读取、兼容分支和已无入口的代码。开发数据库可直接执行结构与数据迁移，但必须在操作前核对实际记录数和依赖，操作后复查业务数据数量与用户可见结果。

同一个仓库包含微信小程序和 Node 服务端：

- `src/`：微信小程序代码
- `server/`：Node 服务端代码
- `public/`：由 Nginx 提供给小程序使用的菜单图片等静态素材
- `project.config.json`：微信开发者工具项目配置

业务图片只存放在腾讯云私有 COS，Supabase 负责数据库与登录。数据库中的 `image_assets` 是图片对象台账，上传、复制和删除会同步维护；账号图片空间统计直接聚合台账，不在接口请求中遍历 COS。

新增或修改任何业务图片功能前，必须遵循 [业务图片统一处理方案](docs/image-processing.md)。该文档是当前图片处理策略的唯一实现规范。

日志与故障排查采用 AI 定期或按需查询数据库事件、必要时查询服务器 journal 的轻量方案；当前明确不建设固定日志平台和主动告警。详见 [日志与运行观测决策](docs/logging-and-monitoring.md)。

微信开发者工具直接打开仓库根目录。本地服务端使用：

```bash
pnpm run server
```

## 更换证书

1. 下载证书到本地 gufeifei.cn_nginx
2. 部署
3. ssh gufeifei
4. cd /etc/nginx/
5. sudo cp -r /home/ubuntu/human_draft/gufeifei.cn_nginx .
6. sudo systemctl restart nginx
7. 打开 https://www.gufeifei.cn/

## 服务端部署

Nginx 从 `public/` 提供静态素材，并将 `/api/*` 反向代理到本机 Node 服务 `127.0.0.1:3000`。

线上首次安装 systemd 服务：

```bash
cd /home/ubuntu/human_draft
sudo cp deploy/human-draft-server.service /etc/systemd/system/human-draft-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now human-draft-server
sudo cp nginx.conf /etc/nginx/conf.d/human-draft.conf
sudo nginx -t
sudo nginx -s reload
```

从旧名称迁移时，先停止并禁用旧服务，再启用新服务：

```bash
sudo systemctl disable --now project-flomo-server
sudo rm -f /etc/systemd/system/project-flomo-server.service
sudo systemctl daemon-reload
```

验证：

```bash
curl https://www.gufeifei.cn/api/health
```
