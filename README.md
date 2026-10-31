# 随机蛋糕

黑底单页小站。打开就能看到会发光的蛋糕、彩色粒子和转动的轨道光环。点击「随机蛋糕」会短促闪一下、换成另一种蛋糕，并迸出一圈新粒子。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端里给出的本地地址。手机竖屏、横屏都会铺满黑底，按钮按手指尺寸来点。

## 构建

```bash
npm run build
```

静态文件输出到 `dist/`。

## Netlify

`netlify.toml` 已写好：构建命令是 `npm run build`，发布目录是 `dist`。单页路由会回退到 `/index.html`。
