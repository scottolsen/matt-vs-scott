const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ATHLETES = {
  matt: {
    name: 'Matt Phippen',
    stravaId: '2844018',
    url: 'https://www.strava.com/athletes/2844018'
  },
  scott: {
    name: 'Scott Olsen',
    stravaId: '736553',
    url: 'https://www.strava.com/athletes/736553'
  }
};

const DATA_FILE = path.join(__dirname, '..', 'data.json');

async function scrapeAthleteStats(page, url) {
  console.log(`Scraping: ${url}`);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for the stats to load
  await page.waitForSelector('[class*="Stat"]', { timeout: 10000 }).catch(() => {
    console.log('Warning: Could not find stat elements, trying alternative selectors...');
  });

  // Try to find the Current Month section and extract data
  // Strava uses various class names, so we'll try multiple approaches

  let distance = null;
  let movingTime = null;

  // Approach 1: Look for the stats in the sidebar
  try {
    // The Current Month section typically contains Distance and Moving Time
    const pageContent = await page.content();

    // Try to extract from the page using evaluate
    const stats = await page.evaluate(() => {
      // Look for elements containing "Current Month"
      const currentMonthSection = Array.from(document.querySelectorAll('*')).find(el =>
        el.textContent.includes('Current Month') && el.children.length > 0
      );

      if (!currentMonthSection) {
        // Alternative: look for stat containers
        const distanceEl = document.querySelector('[data-testid="stat_distance"]');
        const timeEl = document.querySelector('[data-testid="stat_moving_time"]');

        if (distanceEl && timeEl) {
          return {
            distance: distanceEl.textContent.trim(),
            movingTime: timeEl.textContent.trim()
          };
        }
      }

      // Try finding by text patterns
      const allText = document.body.innerText;
      const distanceMatch = allText.match(/Distance\s*([\d,.]+\s*(?:mi|km))/i);
      const timeMatch = allText.match(/Moving Time\s*([\d:]+)/i);

      // Alternative: Look for the specific stat layout Strava uses
      const statSections = document.querySelectorAll('section, div[class*="stat"], div[class*="Stat"]');

      for (const section of statSections) {
        const text = section.innerText;
        if (text.includes('Current Month')) {
          // Extract distance (number followed by mi or km)
          const dMatch = text.match(/([\d,.]+)\s*(mi|km)/i);
          // Extract time (HH:MM:SS format)
          const tMatch = text.match(/(\d{1,2}:\d{2}:\d{2})/);

          if (dMatch && tMatch) {
            return {
              distance: `${dMatch[1]} ${dMatch[2]}`,
              movingTime: tMatch[1]
            };
          }
        }
      }

      return null;
    });

    if (stats) {
      distance = stats.distance;
      movingTime = stats.movingTime;
    }
  } catch (error) {
    console.error('Error extracting stats:', error.message);
  }

  // Approach 2: Use more specific selectors if approach 1 failed
  if (!distance || !movingTime) {
    try {
      // Take a screenshot for debugging
      await page.screenshot({ path: `/tmp/strava-debug-${Date.now()}.png` });

      // Try evaluating the entire page structure
      const result = await page.evaluate(() => {
        // Strava renders stats in a specific pattern
        // Look for the sidebar stats container
        const sidebar = document.querySelector('aside, [class*="sidebar"], [class*="Sidebar"]');
        if (sidebar) {
          const text = sidebar.innerText;
          const distMatch = text.match(/([\d,.]+)\s*(mi|km)/i);
          const timeMatch = text.match(/(\d{1,2}:\d{2}:\d{2})/);

          if (distMatch && timeMatch) {
            return {
              distance: `${distMatch[1]} ${distMatch[2]}`,
              movingTime: timeMatch[1]
            };
          }
        }

        // Fallback: search entire page
        const bodyText = document.body.innerText;
        const lines = bodyText.split('\n');

        let foundCurrentMonth = false;
        let dist = null;
        let time = null;

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('Current Month')) {
            foundCurrentMonth = true;
          }
          if (foundCurrentMonth) {
            if (!dist) {
              const dMatch = lines[i].match(/^([\d,.]+)\s*(mi|km)$/i);
              if (dMatch) dist = `${dMatch[1]} ${dMatch[2]}`;
            }
            if (!time) {
              const tMatch = lines[i].match(/^(\d{1,2}:\d{2}:\d{2})$/);
              if (tMatch) time = tMatch[1];
            }
            if (dist && time) break;
          }
        }

        if (dist && time) {
          return { distance: dist, movingTime: time };
        }

        return null;
      });

      if (result) {
        distance = result.distance;
        movingTime = result.movingTime;
      }
    } catch (error) {
      console.error('Fallback extraction failed:', error.message);
    }
  }

  return { distance, movingTime };
}

async function main() {
  console.log('Starting Strava scraper...');
  console.log(`Time: ${new Date().toISOString()}`);

  // Load existing data
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.log('No existing data file, creating new one');
    data = {
      lastUpdated: null,
      contestants: {
        matt: { name: ATHLETES.matt.name, stravaId: ATHLETES.matt.stravaId, distance: '0 mi', movingTime: '0:00:00' },
        scott: { name: ATHLETES.scott.name, stravaId: ATHLETES.scott.stravaId, distance: '0 mi', movingTime: '0:00:00' }
      }
    };
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  let hasUpdates = false;

  // Scrape each athlete
  for (const [key, athlete] of Object.entries(ATHLETES)) {
    try {
      const stats = await scrapeAthleteStats(page, athlete.url);

      if (stats.distance && stats.movingTime) {
        console.log(`${athlete.name}: ${stats.distance}, ${stats.movingTime}`);

        // Update data if we got new values
        if (data.contestants[key].distance !== stats.distance ||
            data.contestants[key].movingTime !== stats.movingTime) {
          data.contestants[key].distance = stats.distance;
          data.contestants[key].movingTime = stats.movingTime;
          hasUpdates = true;
        }
      } else {
        console.log(`Warning: Could not extract stats for ${athlete.name}`);
        console.log(`Keeping existing values: ${data.contestants[key].distance}, ${data.contestants[key].movingTime}`);
      }
    } catch (error) {
      console.error(`Error scraping ${athlete.name}:`, error.message);
      console.log(`Keeping existing values for ${athlete.name}`);
    }

    // Add delay between requests to be polite
    await page.waitForTimeout(2000);
  }

  await browser.close();

  // Update timestamp and save
  if (hasUpdates) {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('\nData updated successfully!');
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('\nNo updates detected, keeping existing data.');
  }
}

main().catch(error => {
  console.error('Scraper failed:', error);
  process.exit(1);
});
