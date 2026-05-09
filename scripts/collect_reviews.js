/**
 * Amazon Review Collector
 * 采集 Amazon 商品指定星级评论，保存为 Obsidian Markdown 文件
 *
 * 用法：
 *   node collect_reviews.js <url|excelPath|multiUrl> [star]
 */

const { chromium } = require('C:/Users/Win11/AppData/Roaming/npm/node_modules/@qingchencloud/openclaw-zh/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const CDP_ENDPOINT = 'http://127.0.0.1:18800';
const CLIPPINGS_DIR = 'D:\\software\\obsidian\\agent\\Clippings';

const STAR_MAP = {
  '1': { label: '1star', param: 'one_star', zh: '1星' },
  '2': { label: '2star', param: 'two_star', zh: '2星' },
  '3': { label: '3star', param: 'three_star', zh: '3星' },
  '4': { label: '4star', param: 'four_star', zh: '4星' },
  '5': { label: '5star', param: 'five_star', zh: '5星' },
};

const SHOW_MORE_SELECTORS = [
  '[data-hook="show-more-button"]',
  '[data-hook="show-more-reviews-button"]',
  'button[data-hook="show-more-instantnad"]',
  '.a-text-bold[data-hook="show-more-instantnad"]',
  'span:has-text("Show more")',
  'span:has-text("Show more reviews")',
  'a:has-text("Show more")',
];

function extractASIN(url) {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  if (match) return match[1];
  const match2 = url.match(/\/product-reviews\/([A-Z0-9]{10})/);
  if (match2) return match2[1];
  return null;
}

function buildReviewsUrl(asin, starParam) {
  return `https://www.amazon.com/product-reviews/${asin}/?filterByStar=${starParam}&reviewerType=all_reviews`;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isBlockingPage(content) {
  return (
    content.includes('api-services-static-assets') ||
    content.includes('PADDING-LEFT') ||
    content.includes('please-type-characters') ||
    content.includes('We have detected an unusual traffic') ||
    content.includes('automatic robot')
  );
}

async function clickShowMore(page) {
  for (const sel of SHOW_MORE_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click({ force: true });
        return true;
      }
    } catch {}
  }
  return false;
}

/**
 * 从页面获取目标评论总数
 * 支持中文 "37 条匹配的客户评价" 和英文 "37 matching customer reviews"
 */
async function getTargetReviewCount(page) {
  try {
    const text = await page.locator('[data-hook="cr-filter-info-review-rating-count"]').textContent({ timeout: 3000 });
    if (text) {
      // 兼容中英文：37 matching customer reviews / 37 条匹配的客户评价
      const match = text.match(/(\d+)\s*(?:matching|match|条)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  } catch {}
  return null;
}

async function getCurrentPageNumber(page) {
  try {
    const active = page.locator('[data-hook="reviews-footer"] a.a-selected');
    if (await active.isVisible({ timeout: 2000 })) {
      const text = await active.textContent();
      const n = parseInt(text.trim(), 10);
      if (!isNaN(n)) return n;
    }
    const m = page.url().match(/[?&]pageNumber=(\d+)/);
    if (m) return parseInt(m[1], 10);
  } catch {}
  return 1;
}

async function getNextPageButton(page) {
  const selectors = [
    'a[data-hook="pagination-next-button"]',
    '[data-hook="pagination-next"] a',
    'a:has-text("Next page")',
    'a:has-text("下一页")',
    'a:has-text("next")',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) return btn;
    } catch {}
  }
  return null;
}

async function loadAllReviews(page, maxRounds = 80) {
  const targetCount = await getTargetReviewCount(page);
  console.log(`[i] 目标评论总数: ${targetCount !== null ? targetCount + ' 条' : '未知（将持续加载直到无变化）'}`);

  let noChangeCount = 0;
  let prevCount = 0;

  for (let round = 0; round < maxRounds; round++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1500);

    const currentCount = await page.locator('[data-hook="review"]').count();
    console.log(`[4.${round}] 已加载: ${currentCount}${targetCount !== null ? ` / ${targetCount}` : ''}`);

    // 优先尝试 Show more
    const clickedShowMore = await clickShowMore(page);
    if (clickedShowMore) {
      console.log(`[4.${round}] 已点击 Show more，等待 3s...`);
      await sleep(3000);
      noChangeCount = 0;
      const newCount = await page.locator('[data-hook="review"]').count();
      if (newCount > currentCount) continue;
    }

    // 已达目标
    if (targetCount !== null && currentCount >= targetCount) {
      console.log(`[✓] 已达到目标 ${targetCount}，停止`);
      break;
    }

    // 无变化计数
    if (currentCount === prevCount) {
      noChangeCount++;
    } else {
      noChangeCount = 0;
    }
    prevCount = currentCount;

    // 卡住 2 次 → 尝试翻页
    if (noChangeCount >= 2) {
      const pageNum = await getCurrentPageNumber(page);
      const nextBtn = await getNextPageButton(page);
      if (nextBtn) {
        console.log(`[4.${round}] Show more 卡住，尝试翻到下一页 (当前第 ${pageNum} 页)...`);
        await nextBtn.click({ force: true });
        await sleep(3000);
        noChangeCount = 0;
        continue;
      } else {
        console.log(`[4.${round}] 无法继续加载，停止`);
        break;
      }
    }

    if (noChangeCount >= 4) {
      console.log(`[WARN] 已加载 ${currentCount}，无法继续`);
      break;
    }
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  return await page.locator('[data-hook="review"]').count();
}

async function extractReviews(page) {
  return await page.evaluate(() => {
    const items = document.querySelectorAll('[data-hook="review"]');
    return Array.from(items).map(item => {
      const q = (sel) => item.querySelector(sel);
      return {
        title: q('[data-hook="review-title"]')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        rating: q('[data-hook="review-star-rating"]')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        author: q('.a-profile-name')?.textContent?.trim() || '',
        date: q('[data-hook="review-date"]')?.textContent?.trim().replace(/\s+/g, ' ') || '',
        body: q('[data-hook="review-body"]')?.textContent?.trim().replace(/\s+/g, ' ') || '',
      };
    });
  });
}

function buildMarkdown(asin, starInfo, reviews, productUrl) {
  const now = new Date().toLocaleString('zh-CN');
  let md = `# Amazon ${starInfo.zh} Reviews: ${asin}\n\n`;
  md += `> Extracted: ${now}\n`;
  md += `> Product: ${productUrl}\n\n`;
  md += `---\n\n`;

  reviews.forEach((r, i) => {
    md += `## Review ${i + 1}\n\n`;
    if (r.title) md += `**Title:** ${r.title}\n`;
    if (r.rating) md += `**Rating:** ${r.rating}\n`;
    if (r.author) md += `**Author:** ${r.author}\n`;
    if (r.date) md += `**Date:** ${r.date}\n`;
    if (r.body) md += `\n${r.body}\n`;
    md += `\n---\n\n`;
  });

  return md;
}

async function collectReviews(page, asin, starInfo) {
  const url = buildReviewsUrl(asin, starInfo.param);
  console.log(`[→] Opening: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  const content = await page.content();
  if (isBlockingPage(content)) {
    console.log('[!] Blocking page detected. Solve manually in browser, then say "继续" to resume.');
    process.exit(1);
  }

  const targetCount = await getTargetReviewCount(page);
  console.log(`[i] 页面目标评论数: ${targetCount !== null ? targetCount + ' 条' : '未知'}`);

  const finalCount = await loadAllReviews(page);
  console.log(`[i] 最终加载完成: ${finalCount} 条`);

  const reviews = await extractReviews(page);
  console.log(`[i] 提取到: ${reviews.length} 条评论`);

  const productUrl = `https://www.amazon.com/dp/${asin}`;
  const md = buildMarkdown(asin, starInfo, reviews, productUrl);

  if (!fs.existsSync(CLIPPINGS_DIR)) {
    fs.mkdirSync(CLIPPINGS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `amazon_${asin}_${starInfo.label}_${timestamp}.md`;
  const filepath = path.join(CLIPPINGS_DIR, filename);

  fs.writeFileSync(filepath, md, 'utf8');
  console.log(`[✓] Saved: ${filepath}`);

  return { asin, reviewsCount: reviews.length, targetCount, filepath };
}

function parseExcelLinks(filePath) {
  try {
    let data;
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    } catch {
      const content = fs.readFileSync(filePath, 'utf8');
      const urlMatches = content.match(/https?:\/\/www\.amazon\.com[^\s"'>]+/g);
      if (urlMatches) return [...new Set(urlMatches)];
      return [];
    }

    const urls = [];
    for (const row of data) {
      if (!row || row.length === 0) continue;
      for (const cell of row) {
        if (typeof cell === 'string' && cell.includes('amazon.com')) {
          const asin = extractASIN(cell);
          if (asin) urls.push(`https://www.amazon.com/dp/${asin}`);
          else urls.push(cell);
        }
      }
    }
    return [...new Set(urls)];
  } catch (e) {
    console.error(`[ERROR] Excel read failed: ${e.message}`);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node collect_reviews.js <url|excelPath|multiUrl> [star]');
    console.error('Stars: 1, 2, 3, 4, 5 (default: 1)');
    process.exit(1);
  }

  const input = args[0];
  const starKey = args[1] || '1';
  const starInfo = STAR_MAP[starKey] || STAR_MAP['1'];

  console.log(`[i] Star: ${starInfo.zh}`);

  let urls = [];
  if (input.includes(',') && !input.includes('.xlsx') && !input.includes('.xls')) {
    urls = input.split(',').map(u => u.trim()).filter(u => u.length > 0);
  } else if (/\.xlsx?$/i.test(input) || /\.csv$/i.test(input)) {
    urls = parseExcelLinks(input);
    console.log(`[i] Found ${urls.length} URLs in Excel`);
  } else {
    urls = [input];
  }

  if (urls.length === 0) {
    console.error('[ERROR] No URLs found.');
    process.exit(1);
  }

  console.log(`[i] Total URLs to process: ${urls.length}`);

  console.log('[1] Connecting to Chrome via CDP...');
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    console.log(`\n[${i + 1}/${urls.length}] Processing: ${urls[i]}`);
    const asin = extractASIN(urls[i]);
    if (!asin) {
      console.error(`[!] Cannot extract ASIN from: ${urls[i]}`);
      continue;
    }
    try {
      const result = await collectReviews(page, asin, starInfo);
      results.push(result);
    } catch (e) {
      console.error(`[ERROR] Failed to collect ${asin}: ${e.message}`);
    }
  }

  console.log(`\n[=== SUMMARY ===]`);
  results.forEach(r => {
    const gap = r.targetCount ? ` (目标${r.targetCount}条)` : '';
    console.log(`  ${r.asin}: ${r.reviewsCount}${gap} -> ${path.basename(r.filepath)}`);
  });
  console.log(`Total: ${results.length} products processed.`);
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
