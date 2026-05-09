# Amazon Review Collector - 输入格式说明

## 1. 单条链接

直接传入 Amazon 商品链接，系统自动提取 ASIN 并构建评论页 URL。

```
https://www.amazon.com/dp/B0B63KGXT5
https://www.amazon.com/gp/product/B0B63KGXT5
```

## 2. 多条链接（逗号分隔）

用逗号分隔多个 URL，适用于批量采集：

```
采集 https://www.amazon.com/dp/B0B63KGXT5,https://www.amazon.com/dp/B0ABC123
```

注意：逗号两侧不要有空格，或空格会被自动 trim。

## 3. Excel 文件

传入 `.xlsx` / `.xls` / `.csv` 文件路径，脚本读取第一张 sheet 中所有包含 `amazon.com` 的单元格。

支持格式：

| 格式 | 说明 |
|------|------|
| A 列直接填 URL | 每行一个链接 |
| 任意列包含 URL | 自动扫描所有列 |
| 列名为 "Link" / "URL" / "链接" | 优先读取列名匹配 |

Excel 示例：

| Link | 备注 |
|------|------|
| https://www.amazon.com/dp/B0B63KGXT5 | 产品1 |
| https://www.amazon.com/dp/B0ABC123 | 产品2 |

## 4. 星级参数

在链接或文件路径后指定：

```
采集 <url> 5星
采集 <excelPath> 3星
```

可选值：`1星` `2星` `3星` `4星` `5星`，默认 `1星`。

## 5. ASIN 提取规则

脚本按以下顺序查找 ASIN：

1. URL 中的 `/dp/ASIN`（优先级最高）
2. URL 中的 `/product-reviews/ASIN`
3. URL 中的 `/gp/product/ASIN`

ASIN 格式：10位字母+数字，如 `B0B63KGXT5`、`B0ABC123XY`

## 6. 输出文件命名

```
amazon_{ASIN}_{starLabel}_{timestamp}.md
例：amazon_B0B63KGXT5_1star_2026-05-09T06-05-13.md
```

保存路径：`D:\software\obsidian\agent\Clippings\`
