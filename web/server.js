/**
 * Amazon Review Collector - Local Web Server
 * 
 * 启动方式：
 *   cd D:\选品agent\skills\web
 *   node server.js
 * 
 * 然后打开浏览器访问：http://localhost:18888
 */

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Lazy-load playwright only when needed
let _chromium = null;
async function getChromium() {
  if (!_chromium) {
    _chromium = require('C:/Users/Win11/AppData/Roaming/npm/node_modules/@qingchencloud/openclaw-zh/node_modules/playwright').chromium;
  }
  return _chromium;
}

// Auto-start Chrome if not running, then connect via CDP
let _browser = null;

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function ensureBrowser() {
  const Chromium = await getChromium();

  // Try connecting to existing Chrome at 18800
  try {
    const browser = await Chromium.connectOverCDP(CDP_ENDPOINT);
    const ctx = browser.contexts()[0] || await browser.newContext();
    const page = ctx.pages()[0] || await ctx.newPage();
    console.log('[Chrome] Connected to existing Chrome @18800');
    return { browser, context: ctx, page };
  } catch {
    // No Chrome at 18800 — launch our own Chrome with persistent context (Playwright requirement)
    console.log('[Chrome] No Chrome @18800, launching new one...');
    try {
      const { browser, context, page } = await Chromium.launchPersistentContext(
        'C:\\Users\\Win11\\AppData\\Local\\Google\\Chrome\\User Data',
        {
          headless: false,
          executablePath: CHROME_PATH,
          args: [
            '--remote-debugging-port=18800',
            '--no-first-run',
            '--no-default-browser-check',
          ],
        }
      );
      console.log('[Chrome] New Chrome launched successfully');
      return { browser, context, page };
    } catch (launchErr) {
      console.error('[Chrome] Launch failed:', launchErr.message);
      throw new Error('无法启动 Chrome。请确认已安装 Google Chrome。错误: ' + launchErr.message);
    }
  }
}

const CDP_ENDPOINT = 'http://127.0.0.1:18800';
const CLIPPINGS_DIR = 'D:\\software\\obsidian\\agent\\Clippings';
const PORT = 18888;
const HOST = '0.0.0.0'; // 接受所有网络接口
const STATIC_DIR = __dirname;

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

function extractASIN(inputUrl) {
  const match = inputUrl.match(/\/dp\/([A-Z0-9]{10})/);
  if (match) return match[1];
  const match2 = inputUrl.match(/\/product-reviews\/([A-Z0-9]{10})/);
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

async function getTargetReviewCount(page) {
  try {
    const text = await page.locator('[data-hook="cr-filter-info-review-rating-count"]').textContent({ timeout: 3000 });
    if (text) {
      const match = text.match(/(\d+)\s*(?:matching|match|条)/);
      if (match) return parseInt(match[1], 10);
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
    // Try URL
    const url = page.url();
    const m = url.match(/[?&]pageNumber=(\d+)/);
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
  let totalLoaded = 0;
  let noChangeCount = 0;
  let prevCount = 0;
  let currentPage = 1;

  for (let round = 0; round < maxRounds; round++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1500);

    const currentCount = await page.locator('[data-hook="review"]').count();

    // Try Show more first
    const clickedShowMore = await clickShowMore(page);
    if (clickedShowMore) {
      console.log(`[load] Round ${round}: clicked Show more, waiting 3s...`);
      await sleep(3000);
      noChangeCount = 0;
      const newCount = await page.locator('[data-hook="review"]').count();
      if (newCount > currentCount) continue; // new reviews loaded, keep going
      // Show more clicked but no new reviews
    }

    // Check if we reached target
    if (targetCount !== null && currentCount >= targetCount) {
      console.log(`[load] Reached target: ${currentCount}/${targetCount}`);
      break;
    }

    // Count check
    if (currentCount === prevCount) {
      noChangeCount++;
    } else {
      noChangeCount = 0;
    }
    prevCount = currentCount;

    // Stuck for 2 rounds with no button → try pagination
    if (noChangeCount >= 2) {
      const pageNum = await getCurrentPageNumber(page);
      const nextBtn = await getNextPageButton(page);

      if (nextBtn) {
        console.log(`[load] Stuck at ${currentCount}, trying next page (current: ${pageNum})...`);
        await nextBtn.click({ force: true });
        await sleep(3000);
        noChangeCount = 0;
        currentPage++;
        continue;
      } else {
        console.log(`[load] No more pages/buttons. Stuck at ${currentCount}`);
        break;
      }
    }

    // Still nothing after 4 rounds → stop
    if (noChangeCount >= 4) {
      console.log(`[load] No change for 4 rounds, stopping at ${currentCount}`);
      break;
    }
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  const finalCount = await page.locator('[data-hook="review"]').count();
  console.log(`[load] Done. Final: ${finalCount} reviews`);
  return finalCount;
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

async function collectReviewsForASIN(asin, starInfo, page) {
  const reviewsUrl = buildReviewsUrl(asin, starInfo.param);

  await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  const content = await page.content();
  if (isBlockingPage(content)) {
    return { asin, success: false, reason: 'BLOCKING_PAGE' };
  }

  const targetCount = await getTargetReviewCount(page);
  const loadedCount = await loadAllReviews(page);
  const reviews = await extractReviews(page);

  const productUrl = `https://www.amazon.com/dp/${asin}`;
  const md = buildMarkdown(asin, starInfo, reviews, productUrl);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `amazon_${asin}_${starInfo.label}_${timestamp}.md`;
  const filepath = path.join(CLIPPINGS_DIR, filename);

  if (!fs.existsSync(CLIPPINGS_DIR)) {
    fs.mkdirSync(CLIPPINGS_DIR, { recursive: true });
  }
  fs.writeFileSync(filepath, md, 'utf8');

  return {
    asin,
    success: true,
    reviewsCount: reviews.length,
    targetCount,
    filename,
    filepath,
    md,
    starLabel: starInfo.zh,
    productUrl,
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, content, filename, contentType = 'text/markdown; charset=utf-8') {
  const encodedFilename = encodeURIComponent(filename);
  // Add UTF-8 BOM so Windows Notepad can open the file correctly
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const body = Buffer.concat([bom, Buffer.from(content, 'utf8')]);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
    'Content-Length': body.byteLength,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Serve static HTML
  if (pathname === '/' || pathname === '/index.html') {
    const htmlPath = path.join(STATIC_DIR, 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end('index.html not found');
    }
    return;
  }

  // API: collect reviews
  if (pathname === '/api/collect' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { urls, star = '1', format = 'download' } = JSON.parse(body);
        if (!urls || urls.length === 0) {
          return sendJson(res, 400, { error: 'No URLs provided' });
        }

        const starInfo = STAR_MAP[star] || STAR_MAP['1'];
        const results = [];

        const { browser, context, page } = await ensureBrowser();
        _browser = browser;

        for (const inputUrl of urls) {
          const asin = extractASIN(inputUrl);
          if (!asin) {
            results.push({ asin: inputUrl, success: false, reason: 'INVALID_URL' });
            continue;
          }
          try {
            const result = await collectReviewsForASIN(asin, starInfo, page);
            results.push(result);
          } catch (e) {
            results.push({ asin, success: false, reason: e.message });
          }
        }

        // Do NOT close browser — keep it open for reuse

        // Always return JSON so the page stays (never replace the page with file download)
        return sendJson(res, 200, { results });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    });
    return;
  }

  // API: download file
  if (pathname === '/api/download' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { md, filename } = JSON.parse(body);
        if (!md || !filename) {
          return sendJson(res, 400, { error: 'Missing md or filename' });
        }
        return sendFile(res, md, filename);
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    });
    return;
  }

  // API: status check
  if (pathname === '/api/status' && req.method === 'GET') {
    const { url: testUrl } = parsedUrl.query;
    if (!testUrl) return sendJson(res, 400, { error: 'url required' });
    const asin = extractASIN(testUrl);
    return sendJson(res, 200, {
      asin,
      cdpConnected: true,
      clippingsDir: CLIPPINGS_DIR,
    });
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`Amazon Review Collector Web UI`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://0.0.0.0:${PORT}`);
  console.log(`CDP: ${CDP_ENDPOINT}`);
  console.log(`Output: ${CLIPPINGS_DIR}`);
});
