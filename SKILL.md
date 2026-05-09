---
name: amazon-review-collector
description: 采集 Amazon 商品评论并保存到 Obsidian。适用场景：(1) 输入单条 Amazon 商品链接；(2) 输入多条逗号分隔的链接；(3) 输入包含链接的 Excel 文件路径；(4) 指定要采集的星级（1-5，默认1星）。输出为 Markdown 文件保存到 D:\software\obsidian\agent\Clippings。使用 Playwright 连接本地 Chrome（CDP: http://127.0.0.1:18800）进行采集，无需启动新浏览器。使用 Node.js + Playwright 编写脚本。
---

# Amazon Review Collector

采集 Amazon 商品指定星级的评论，保存为 Obsidian Markdown 文件。

## 输入格式

支持三种输入模式，由输入内容自动判断：

| 模式 | 示例 | 说明 |
|------|------|------|
| 单条链接 | `https://www.amazon.com/dp/B0B63KGXT5` | 自动构建评论页 URL |
| 多条链接 | `url1,url2,url3` | 逗号分隔，依次处理 |
| Excel 文件 | `D:\products.xlsx` | 读取 A 列或 Link 列的所有 URL |

## 星级参数

| 值 | 说明 |
|----|------|
| `1`（默认）| 1星评论 |
| `2` | 2星评论 |
| `3` | 3星评论 |
| `4` | 4星评论 |
| `5` | 5星评论 |

## 执行流程

### 步骤 1：解析输入

1. 判断输入类型：URL / Excel 路径 / 多条逗号分隔
2. 从 URL 提取 ASIN（`/dp/ASIN` 或 `/product-reviews/ASIN`）
3. 构建评论页：`https://www.amazon.com/product-reviews/{ASIN}/?filterByStar=one_star&reviewerType=all_reviews`

### 步骤 2：连接 Chrome

```
CDP_ENDPOINT = http://127.0.0.1:18800
chromium.connectOverCDP(CDP_ENDPOINT)
```

使用已打开的 Chrome，不启动新浏览器。

### 步骤 3：检测并处理拦截页

打开评论页后检测拦截页（验证码 / Robot Check）：

```javascript
function isBlockingPage(content) {
  return (
    content.includes('api-services-static-assets') ||
    content.includes('PADDING-LEFT') ||
    content.includes('please-type-characters') ||
    content.includes('We have detected an unusual traffic')
  );
}
```

- **检测到拦截**：打印 `ACTION_REQUIRED`，用户手动处理后说"继续"恢复
- **未检测到**：继续执行

### 步骤 4：获取目标评论总数

进入评论页后，首先从以下元素提取目标评论数：

```javascript
const text = await page.locator('[data-hook="cr-filter-info-review-rating-count"]').textContent();
// 英文: "37 matching customer reviews" → 提取 37
// 中文: "37 条匹配的客户评价" → 提取 37
```

此数值作为主要完成判定条件。

### 步骤 5：加载所有评论

循环滚动 + 点击 "Show more" 按钮，直到达到目标总数：

```javascript
for (let round = 0; round < 50; round++) {
  // 滚动到底部
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1500);

  // 获取当前已加载数量
  const currentCount = page.locator('[data-hook="review"]').count();

  // 已达目标 → 提前结束
  if (targetCount !== null && currentCount >= targetCount) break;

  // 无变化超过 4 次 → 停止尝试
  if (noChangeCount >= 4) break;

  // 点击 Show more
  const clicked = await clickShowMore(page);
  if (clicked) {
    await sleep(3000);
    noChangeCount = 0; // 点击后重置
  } else {
    // 按钮消失但未达目标 → 等待重试
    if (currentCount < targetCount) await sleep(2000);
    if (!clickShowMore()) noChangeCount++;
  }
}
```

Show more 按钮选择器：

```javascript
const SHOW_MORE_SELECTORS = [
  '[data-hook="show-more-button"]',
  '[data-hook="show-more-reviews-button"]',
  'button[data-hook="show-more-instantnad"]',
  '.a-text-bold[data-hook="show-more-instantnad"]',
  'span:has-text("Show more")',
  'span:has-text("Show more reviews")',
  'a:has-text("Show more")',
];
```

**完成判定规则（优先级从高到低）：**
1. 当前已加载数量 ≥ 目标总数 → 完成
2. Show more 按钮不存在且已无变化 → 停止
3. 无变化次数 ≥ 4 次 → 停止（可能是动态加载上限）

### 步骤 6：提取评论数据

```javascript
const reviews = await page.evaluate(() => {
  const items = document.querySelectorAll('[data-hook="review"]');
  return Array.from(items).map(item => ({
    title: querySelector('[data-hook="review-title"]')?.textContent?.trim(),
    rating: querySelector('[data-hook="review-star-rating"]')?.textContent?.trim(),
    author: querySelector('.a-profile-name')?.textContent?.trim(),
    date: querySelector('[data-hook="review-date"]')?.textContent?.trim(),
    body: querySelector('[data-hook="review-body"]')?.textContent?.trim(),
  }));
});
```

### 步骤 7：写入 Obsidian Clippings

```javascript
const CLIPPINGS_DIR = 'D:\\software\\obsidian\\agent\\Clippings';
const filename = `amazon_${ASIN}_${starLabel}_${timestamp}.md`;
const filepath = `${CLIPPINGS_DIR}\\${filename}`;
```

文件内容模板：

```markdown
# Amazon {星级}星 Reviews: {ASIN}

> Extracted: {时间}
> Product: https://www.amazon.com/dp/{ASIN}

---

## Review 1
**Title:** ...
**Rating:** ...
**Author:** ...
**Date:** ...
{正文}
...
```

### 步骤 8：处理多条链接

按顺序处理每个 URL，循环执行步骤 2-6。

## 使用示例

```
采集 1 星评论（默认）：
采集 https://www.amazon.com/dp/B0B63KGXT5

采集 5 星评论：
采集 https://www.amazon.com/dp/B0B63KGXT5 5星

采集多条：
采集 https://url1,https://url2

采集 Excel：
采集 D:\products.xlsx
```

## 错误处理

- **CDP 连接失败**：检查 Chrome 是否开启远程调试端口（`--remote-debugging-port=18800`）
- **页面无评论**：打印警告并跳过，继续处理下一条
- **拦截页**：暂停等待人工处理，不要反复重试
- **Excel 读取失败**：提示检查文件路径是否正确

## 相关文件

- `scripts/collect_reviews.js` — 可独立运行的采集脚本
- `references/INPUT_FORMATS.md` — Excel 输入格式说明
