---
name: renew-nginx-certificate
description: Renew and deploy the gufeifei.cn Nginx TLS certificate for human_draft on Tencent Cloud. Use when the user provides a certificate ZIP or asks to 更新证书, 更新腾讯云证书, 更换 Nginx 证书, 修复证书过期, renew HTTPS, or deploy gufeifei.cn certificate files.
---

# Renew Nginx Certificate

Safely validate and deploy the downloaded certificate without committing its private key.

## Fixed project details

- Local repository: `/Users/gufeifei/Sites/human_draft`
- Server login: `ssh gufeifei`
- Server repository: `/home/ubuntu/human_draft`
- Repository certificate: `gufeifei.cn_nginx/gufeifei.cn_bundle.pem`
- Protected server key: `/etc/nginx/gufeifei.cn_nginx/gufeifei.cn.key`
- Nginx config: `/etc/nginx/conf.d/human-draft.conf`
- Health check: `https://www.gufeifei.cn/api/health`

## Workflow

1. Locate the supplied ZIP. Run `scripts/verify-certificate-zip.sh <zip>` before changing files.
2. Stop if the certificate is expired, not yet valid, has the wrong hostname, or the certificate, CSR, and key public-key hashes do not match.
3. Compare the verified `.pem`, `.crt`, and `.csr` with `gufeifei.cn_nginx/`. Update only changed public files. Never copy or commit `.key` into the repository.
4. Run `git status` and preserve unrelated changes. Commit and publish the public certificate update through the normal GitHub workflow.
5. Upload the verified key to `/tmp/gufeifei.cn.key` with `scp`. On the server, install it using owner `root`, group `root`, and mode `600` at the protected key path, then delete the temporary copy.
6. Pull the latest `main` on the server. Verify the deployed repository certificate and protected private key hashes match before touching Nginx.
7. Copy the repository `nginx.conf` to the configured Nginx path. Run `sudo nginx -t`; reload only when the test succeeds.
8. Verify HTTPS without `-k`, check the served certificate dates, and confirm the health response reports `human-draft-server`.
9. Remove local temporary extraction directories. Keep the user's original ZIP unless explicitly asked to delete it.

## Tencent Cloud access

- Connect from the user's Mac with the existing SSH alias: `ssh gufeifei`.
- When the user authorizes direct terminal operation, perform the deployment through this alias instead of asking the user to copy commands manually.
- Use non-interactive `ssh gufeifei '<commands>'` for bounded checks and changes; use an interactive session only when diagnostics require it.
- Never record, request, print, or modify SSH credentials, private SSH keys, passwords, or the alias definition.
- Confirm the remote directory is `/home/ubuntu/human_draft` before making changes.
- Exit interactive SSH sessions after verification.

## Safety rules

- Never print, read into chat, commit, or store private-key contents in logs.
- Never use `curl -k` as the final verification.
- Never reload Nginx after a failed configuration test.
- Keep the currently running certificate and service intact until the replacement has passed all checks.
- If the server certificate is valid but the API fails, diagnose the Node service separately rather than changing TLS files.

## Expected Nginx paths

Use the renewable certificate directly from the checked-out repository while keeping the key outside Git:

```nginx
ssl_certificate     /home/ubuntu/human_draft/gufeifei.cn_nginx/gufeifei.cn_bundle.pem;
ssl_certificate_key /etc/nginx/gufeifei.cn_nginx/gufeifei.cn.key;
```
