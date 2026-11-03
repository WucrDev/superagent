# fuyou 服务器部署（持续测试）

可玩 build 已部署在 fuyou 服务器，测试入口：<https://game.xiaoannurse.art/>。

作为独立静态站点运行，不占用宿主机端口、不改动其它容器。

## 组成

- `docker-compose.yml`：`superagent-game-web` 容器（nginx:alpine），只加入已有的 `fuyou_default` 网络。
- `site.conf`：容器内 nginx 站点配置（SPA 回退、gzip、静态资源缓存）。
- `edge-server.conf`：宿主机 443 nginx（`fuyou-h5-https-1`）新增的 `game.xiaoannurse.art` server block，反代到 `http://superagent-game-web:80`。
- 证书：Let's Encrypt webroot（`/home/ubuntu/letsencrypt/www`），由宿主机 `certbot.timer` 续期，renew hook 会 reload 443 nginx。

## 发布新 build

在仓库根目录：

```bash
npm ci
npm run build
rsync -az --delete dist/ fuyou:/home/ubuntu/apps/superagent-game/dist/
ssh fuyou 'chmod -R a+rX /home/ubuntu/apps/superagent-game/dist'
```

若整体替换 `dist/` 目录，重启容器让 bind mount 指向新 inode：

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

DNS 为 `game.xiaoannurse.art` A 记录指向 `134.175.187.134`；再签发证书并把 `edge-server.conf` 追加到
`/home/ubuntu/apps/fuyou/deploy/h5-ip-https.conf`，`docker exec fuyou-h5-https-1 nginx -t` 后 reload。
