# Playwright Demo Recording Script — BlockID.au CTO Demo

## Purpose
Step-by-step guide for recording the live product demo on blockid.au using Playwright. The recorded footage will be used in the 1-minute and 3-minute pitch videos (see `/.claude/goals/video-production-plan.md`).

---

## Prerequisites

```bash
# Install Playwright with Chromium
npx playwright install chromium

# Verify installation
npx playwright --version
```

## Viewport & Recording Settings

| Setting | Value |
|---------|-------|
| Resolution | 1920x1080 |
| Frame rate | 30fps |
| Browser | Chromium (headless: false) |
| Color profile | sRGB |
| Device scale factor | 1 |
| Slow motion | 100ms per action (for visible typing) |

---

## Recording Methods

### Method A: Playwright Script (Recommended)

Run the automated script that performs the full demo flow with precise timing:

```bash
npx playwright test record-demo.spec.ts --headed --slowmo=100
```

### Method B: Playwright Codegen + Screen Capture

Use Playwright codegen for interactive recording, then capture with OBS or similar:

```bash
# Launch codegen with correct viewport
npx playwright codegen \
  --viewport-size="1920,1080" \
  --color-scheme=dark \
  https://blockid.au

# Simultaneously record with OBS at 1920x1080 30fps
# Or on macOS: QuickTime Player > New Screen Recording
# Or on Linux: ffmpeg -f x11grab -video_size 1920x1080 -framerate 30 -i :0 demo-raw.mp4
```

### Method C: Playwright Video Recording (Built-in)

Configure Playwright to record video automatically:

```typescript
// playwright.config.ts override
use: {
  video: {
    mode: 'on',
    size: { width: 1920, height: 1080 },
  },
  viewport: { width: 1920, height: 1080 },
  launchOptions: {
    slowMo: 100,
  },
}
```

---

## Demo Flow — 11 Steps (~37 seconds total)

Each step includes the action, expected duration, and which video timestamp it maps to.

---

### Step 1: Open Homepage — Hero Section
**Duration:** 3 seconds | **Video timestamp:** 1-min [0:25], 3-min [0:30]

```typescript
await page.goto('https://blockid.au', { waitUntil: 'networkidle' });
// Wait for hero section to fully render (animations, images)
await page.waitForSelector('[data-testid="hero-section"], .hero, h1', { state: 'visible' });
await page.waitForTimeout(3000); // Hold for 3 seconds
```

**Frame export note:** Capture a clean screenshot at 1.5s for thumbnail/cover frame.

---

### Step 2: Scroll to SVI Input — Animated Glow Border
**Duration:** 2 seconds | **Video timestamp:** 1-min [0:27], 3-min [0:32]

```typescript
// Scroll smoothly to the SVI input section
const sviInput = page.locator('[data-testid="svi-input"], textarea, .svi-search');
await sviInput.scrollIntoViewIfNeeded();
await page.waitForTimeout(500); // Let glow animation cycle
await page.waitForTimeout(1500); // Hold on glow border
```

**Frame export note:** Capture the glowing border animation — this is a key visual.

---

### Step 3: Type Startup Description (Slow Typing)
**Duration:** 5 seconds | **Video timestamp:** 1-min [0:29], 3-min [0:34]

```typescript
const description = 'An AI-powered recruitment platform for Australian SMEs using NLP to match candidates';

// Type character by character for visible typing effect
await sviInput.click();
await sviInput.pressSequentially(description, { delay: 55 });
// 55ms per character x ~85 chars = ~4.7s
```

**Timing note:** Adjust `delay` value to hit exactly 5 seconds. At 85 characters:
- 55ms/char = 4.7s
- 60ms/char = 5.1s

---

### Step 4: Input Badge Appears — "Idea Analysis"
**Duration:** 1 second | **Video timestamp:** 1-min [0:34], 3-min [0:39]

```typescript
// Wait for the input classification badge to appear
await page.waitForSelector('text=Idea Analysis', { state: 'visible', timeout: 5000 });
await page.waitForTimeout(1000); // Hold on badge
```

**Frame export note:** Capture badge appearance for feature highlight frames.

---

### Step 5: Email Field — Type Email
**Duration:** 2 seconds | **Video timestamp:** 1-min [0:35], 3-min [0:40]

```typescript
const emailField = page.locator('input[type="email"], [data-testid="email-input"]');
await emailField.scrollIntoViewIfNeeded();
await emailField.click();
await emailField.pressSequentially('demo@blockid.au', { delay: 80 });
await page.waitForTimeout(500);
```

---

### Step 6: Click "Get My SVI"
**Duration:** 1 second | **Video timestamp:** 1-min [0:37], 3-min [0:42]

```typescript
const submitButton = page.locator('button:has-text("Get My SVI")');
await submitButton.scrollIntoViewIfNeeded();
await page.waitForTimeout(300); // Brief pause before click
await submitButton.click();
await page.waitForTimeout(700); // Show click feedback
```

---

### Step 7: SSE Status Bar Animating
**Duration:** 10 seconds (real-time) | **Video timestamp:** 1-min [0:38], 3-min [0:43]

```typescript
// These appear sequentially via SSE — just wait and record
const statuses = [
  'Analyzing',
  'Researching',
  'Generating',
];

for (const status of statuses) {
  await page.waitForSelector(`text=/${status}/i`, { state: 'visible', timeout: 30000 });
  console.log(`Status visible: ${status}`);
}

// Wait for the final report to appear
await page.waitForSelector('[data-testid="svi-report"], .svi-report, .report', {
  state: 'visible',
  timeout: 60000,
});
```

**Production note:** The actual SSE stream takes 30-60 seconds in production. For the video:
- **1-min version:** Speed up this segment to 3-4 seconds in post (2-3x speed).
- **3-min version:** Show 8-10 seconds of the status transitions at normal speed, then cut.
- Consider adding a subtle time-lapse indicator overlay in post-production.

---

### Step 8: Report Appears — SVI Score Gauge
**Duration:** 3 seconds | **Video timestamp:** 1-min [0:41], 3-min [0:50]

```typescript
// Wait for score gauge animation to complete
await page.waitForSelector('[data-testid="svi-score"], .score-gauge, .svi-gauge', {
  state: 'visible',
});
await page.waitForTimeout(3000); // Hold on the score gauge
```

**Frame export note:** This is the MONEY SHOT. Capture:
1. Score gauge fully animated (for thumbnail)
2. Score number visible (for social media stills)

---

### Step 9: Scroll Through Report Pages
**Duration:** 5 seconds | **Video timestamp:** 1-min [0:44], 3-min [0:53]

```typescript
const sections = ['Executive Summary', 'Market', 'Product'];

for (const section of sections) {
  const heading = page.locator(`text=/${section}/i`).first();
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500); // Pause on each section
}
```

**Timing note:** 3 sections x 1.5s pause = 4.5s + scroll time = ~5s total.

---

### Step 10: Show Recommendations with Action Buttons
**Duration:** 3 seconds | **Video timestamp:** 3-min [1:00]

```typescript
// Scroll to recommendations section
const recommendations = page.locator('text=/Recommend/i').first();
await recommendations.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);

// Highlight action buttons (hover for visual feedback)
const actionButton = page.locator('button:has-text("Build"), a:has-text("Build")').first();
if (await actionButton.isVisible()) {
  await actionButton.hover();
  await page.waitForTimeout(2000);
}
```

---

### Step 11: Scroll Back to Top — "New Analysis" Button
**Duration:** 2 seconds | **Video timestamp:** end of both versions

```typescript
// Smooth scroll to top
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await page.waitForTimeout(1000);

// Highlight the new analysis option
const newAnalysis = page.locator('text=/New analysis|Start over|Try another/i').first();
if (await newAnalysis.isVisible()) {
  await newAnalysis.hover();
}
await page.waitForTimeout(1000);
```

---

## Complete Playwright Test File

Save as `web/tests/record-demo.spec.ts`:

```typescript
import { test } from '@playwright/test';

test('Record BlockID SVI demo flow', async ({ page }) => {
  // Set viewport
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Step 1: Open homepage
  await page.goto('https://blockid.au', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Step 2: Scroll to SVI input
  const sviInput = page.locator('textarea').first();
  await sviInput.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);

  // Step 3: Type description
  await sviInput.click();
  await sviInput.pressSequentially(
    'An AI-powered recruitment platform for Australian SMEs using NLP to match candidates',
    { delay: 55 }
  );

  // Step 4: Wait for badge
  await page.waitForTimeout(1000);

  // Step 5: Type email
  const emailField = page.locator('input[type="email"]').first();
  await emailField.click();
  await emailField.pressSequentially('demo@blockid.au', { delay: 80 });

  // Step 6: Click submit
  const submitBtn = page.locator('button:has-text("Get My SVI")');
  await submitBtn.click();

  // Step 7: Wait for SSE processing and report
  await page.waitForSelector('.svi-report, [data-testid="svi-report"]', {
    state: 'visible',
    timeout: 120000,
  });
  await page.waitForTimeout(3000);

  // Step 8-9: Scroll through report
  for (const section of ['Executive Summary', 'Market', 'Product']) {
    const heading = page.locator(`text=/${section}/i`).first();
    if (await heading.isVisible()) {
      await heading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
    }
  }

  // Step 10: Recommendations
  await page.waitForTimeout(3000);

  // Step 11: Back to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(2000);
});
```

---

## Post-Recording Checklist

### Frame Exports (for Remotion compositions)
- [ ] `hero-clean.png` — Homepage hero at 0s (thumbnail background)
- [ ] `svi-input-glow.png` — Input with glow border
- [ ] `typing-midway.png` — Input with partial text
- [ ] `badge-idea-analysis.png` — Badge visible
- [ ] `sse-analyzing.png` — Status bar mid-analysis
- [ ] `score-gauge-full.png` — Final SVI score (MONEY SHOT)
- [ ] `report-executive.png` — Executive summary page
- [ ] `report-market.png` — Market analysis page
- [ ] `recommendations.png` — Action buttons section

### Video Segments to Cut
| Segment | Start | End | Use In |
|---------|-------|-----|--------|
| Hero reveal | 0:00 | 0:03 | Both videos |
| Input + typing | 0:03 | 0:10 | Both videos |
| SSE processing | 0:10 | 0:20 | 3-min (speed up for 1-min) |
| Score reveal | 0:20 | 0:23 | Both videos |
| Report scroll | 0:23 | 0:28 | 3-min full, 1-min quick cut |
| Recommendations | 0:28 | 0:31 | 3-min only |
| Return to top | 0:31 | 0:33 | Both videos |

### Quality Checks
- [ ] No browser UI visible (use `--hide-scrollbars` flag or crop in post)
- [ ] No cursor jitter during typing sequences
- [ ] All animations completed before moving to next step
- [ ] No error toasts or console warnings visible
- [ ] Dark mode consistent throughout (if applicable)
- [ ] Email address shows `demo@blockid.au` clearly

### File Output
```
web/src/remotion/assets/demo/
  demo-raw.mp4          # Full unedited recording
  demo-hero.mp4         # Step 1 clip
  demo-input.mp4        # Steps 2-5 clip
  demo-submit.mp4       # Steps 6-7 clip
  demo-report.mp4       # Steps 8-10 clip
  demo-close.mp4        # Step 11 clip
  frames/               # PNG exports for Remotion overlays
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| SSE takes too long | Record raw, speed up in post-production |
| Glow animation not visible | Ensure CSS animations are enabled, no `prefers-reduced-motion` |
| Score gauge not animating | Wait for `requestAnimationFrame` to complete, add extra delay |
| Email field not found | Check if it appears conditionally after typing description |
| Button disabled | Ensure both description and email are filled before clicking |
| Recording too large | Use `ffmpeg -i demo-raw.mp4 -crf 23 -preset medium demo-compressed.mp4` |
