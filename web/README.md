# Amazon 评论采集器 - 本地部署说明

## 功能概述

通过浏览器网页采集 Amazon 商品的任意星级评论（1-5星），自动翻页加载全部评论，采集完成后直接下载 `.md` 文件（Obsidian 兼容格式）。

---

## 文件说明

```
web/
├── index.html          # 网页前端（纯静态，无需服务器即可预览）
├── server.js          # Node.js 后端服务（提供 API 和数据采集能力）
└── 启动公网访问.bat   # 一键启动脚本（Windows）
```

---

## 快速开始

### 第一步：确认 Chrome 已开启远程调试端口

**必须先完成，否则无法采集。**

1. 关闭所有 Chrome 窗口
2. 按 `Win + R`，输入以下命令回车：

```
chrome.exe --remote-debugging-port=18800
```

> 如果 Chrome 安装在其他路径，使用完整路径，例如：
> ```
> "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=18800
> ```

### 第二步：启动本地服务

双击运行 `启动公网访问.bat`

脚本会自动检测并选择连接方案：
- 优先使用 Cloudflare Tunnel（如已安装 cloudflared）
- 备选使用 SSH Tunnel（系统自带，无需安装）

运行后会生成公网链接，格式如：
- Cloudflare：`https://xxxx.trycloudflare.com`
- SSH：`https://xxxxx.localhost.run`

**把公网链接发给其他人，他们即可使用采集器。**

> ⚠️ 链接为临时链接，关闭 bat 窗口后链接失效。

---

## 本地访问（不发布公网）

如果只需要自己使用，不需要发布公网：

1. 打开 PowerShell，进入目录：
   ```powershell
   cd D:\选品agent\skills\web
   ```

2. 启动服务：
   ```powershell
   node server.js
   ```

3. 浏览器打开：
   ```
   http://localhost:18888
   ```

---

## 使用方法

### 输入模式

| 模式 | 说明 |
|------|------|
| 单条链接 | 输入一个 Amazon 商品链接 |
| 多条链接 | 逗号分隔，或每行一个 |
| Excel 文件 | 支持 .xlsx/.xls/.csv，文件中需包含 amazon.com 链接 |

### 星级筛选

支持 1-5 星选择，默认为 1 星评论。

### 采集过程说明

1. 输入链接 → 选择星级 → 点击"开始采集"
2. 页面自动加载所有评论（自动翻页）
3. 完成后显示结果卡片
4. 点击"下载 .md"保存文件

### 输出文件

保存位置：`D:\software\obsidian\agent\Clippings\`

文件格式：`amazon_{ASIN}_{starLabel}_{时间戳}.md`

---

## 常见问题

### Q: 点击"开始采集"后显示 `ECONNREFUSED 127.0.0.1:18800`
**A:** **已解决。** 程序现在会自动检测 Chrome 是否在运行，如未运行会自动启动。无需手动打开 Chrome 或加参数。

如果仍然报错，检查 Chrome 是否安装在没有权限的目录（ ProgramData 等），脚本会自动启动自己的 Chrome 实例。

### Q: 只采集到 100 条，实际有更多
**A:** 已修复。程序会自动翻页加载全部评论，更新到最新版本即可。

### Q: 公网链接打不开
**A:** 确认 bat 窗口还在运行（不要关闭）。链接为临时链接，关闭后需重新生成。

### Q: cloudflared 下载失败
**A:** 脚本会自动降级使用 SSH 隧道方案（ssh 命令系统自带，无需下载）。

### Q: 想让链接永久有效
**A:** 注册 localhost.run 账号并绑定 SSH 密钥，可以获得永久域名。或者使用 Cloudflare Tunnel 注册账号获得永久链接。

---

## 技术架构

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│   浏览器     │ ──── │  Node.js    │ ──── │ Chrome CDP   │
│  (网页前端)   │ JSON  │  server.js  │      │ 18800端口    │
└─────────────┘      └─────────────┘      └──────────────┘
                           │
                    ┌──────┴──────┐
                    │ Playwright   │
                    │ 采集+翻页    │
                    └─────────────┘
```

---

## 部署到公网的原理

```
用户浏览器 ──HTTPS──> Cloudflare Tunnel / SSH Tunnel ──HTTP──> 你的电脑 ──CDP──> Chrome
```

所有数据都从你的电脑转发，不经过任何第三方服务器。

---

## 更新日志

- **v1.0** 基础功能，支持单条/多条链接、星级筛选
- **v2.0** 修复翻页问题，支持自动翻页加载全部评论
- **v3.0** 优化下载逻辑，页面不再跳转
- **v4.0** 支持 SSH Tunnel，无需下载 cloudflared

---

最后更新：2026-05-09
