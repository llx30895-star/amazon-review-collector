# Amazon Review Collector

采集 Amazon 商品评论并保存为 Markdown 文件，支持本地离线使用。

## 功能

- 支持单条链接、多条链接、Excel 批量导入
- 支持筛选 1-5 星评论
- 采集完成后直接下载 `.md` 文件
- 自动翻页加载所有评论（以页面显示的目标总数为准）

## 使用方式

### 网页版（推荐）

1. 启动本地服务：
   ```bash
   cd amazon-review-collector/web
   node server.js
   ```
2. 打开浏览器访问：http://localhost:18888
3. 输入链接 → 选择星级 → 开始采集 → 下载文件

> ⚠️ 服务需要连接 Chrome 远程调试端口。启动 Chrome 时需加参数：
> ```bash
> chrome.exe --remote-debugging-port=18800
> ```

### 命令行版

```bash
# 安装依赖（在 openclaw-zh 环境下）
node scripts/collect_reviews.js <url|excelPath|multiUrl> [star]

# 示例
node scripts/collect_reviews.js "https://www.amazon.com/dp/B0B63KGXT5" 1
node scripts/collect_reviews.js "D:\products.xlsx" 5
node scripts/collect_reviews.js "url1,url2,url3" 3
```

## 输出

文件保存至：`D:\software\obsidian\agent\Clippings\`

文件名格式：`amazon_{ASIN}_{starLabel}_{timestamp}.md`

## 项目结构

```
amazon-review-collector/
├── SKILL.md                        # Agent Skill 说明
├── run_collect.bat                  # Windows 快速启动脚本
├── scripts/
│   └── collect_reviews.js           # 核心采集脚本（独立运行）
├── references/
│   └── INPUT_FORMATS.md            # 输入格式详细说明
└── web/
    ├── server.js                   # 本地 Web 服务
    └── index.html                  # 网页前端 UI
```

## 技术栈

- **采集**：Node.js + Playwright（连接本地 Chrome CDP）
- **前端**：纯静态 HTML/CSS/JS（无框架）
- **输出**：Markdown，中文兼容

## Star 参数说明

| 参数 | 星级 |
|------|------|
| `1`  | 1星 |
| `2`  | 2星 |
| `3`  | 3星 |
| `4`  | 4星 |
| `5`  | 5星 |
