# fuyou 服务器部署（持续测试）

把 `dist/` 作为独立静态站点跑在 fuyou 服务器，不占用宿主机端口、不改动其它容器。

## 组成

- `docker-compose.yml`：`superagent-game-web` 容器（nginx:alpine），只加入已有的 `fuyou_default` 网络。
- `site.conf`：容器内 nginx 站点配置（SPA 回退、gzip、静态资源缓存）。
- 宿主机 443 的 nginx（`fuyou-h5-https-1`）按子域名反代到 `http://superagent-game-web:80`。

## 发布新 build

在仓库根目录：

```bash
npm ci
npm run build
rsync -az --delete dist/ fuyou:/home/ubuntu/apps/superagent-game/dist/
```

`dist/` 里的文件需要可读（`chmod -R a+rX`）；若整体替换目录，重启容器让 bind mount 指向新 inode：

```bash
ssh fuyou 'sudo docker restart superagent-game-web'
```

## 首次部署

```bash
ssh fuyou 'mkdir -p /home/ubuntu/apps/superagent-game'
rsync -az dist/ fuyou:/home/ubuntu/apps/superagent-game/dist/
rsync -az deploy/fuyou/docker-compose.yml deploy/fuyou/site.conf fuyou:/home/ubuntu/apps/superagent-game/
ssh fuyou 'cd /home/ubuntu/apps/superagent-game && sudo docker compose up -d'
```

子域名与证书由宿主机 443 nginx 配置（`/home/ubuntu/apps/fuyou/deploy/h5-ip-https.conf`）与 certbot webroot 管理。
