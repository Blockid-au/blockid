---
name: publish
description: "Publish a new SEO insight article. Use when user says 'publish article', 'write blog', 'new insight', or 'create content'."
arguments: [topic]
---

# Publish Insight — BlockID.au

Publish a new SEO-optimized article to /insights/.

**Argument:** `$0` — topic or title (optional, will use queue if empty)

## Steps

1. **If topic provided:** Create a custom article on the given topic
2. **If no topic:** Trigger the auto-publish cron to pick next from queue

### Manual publish:
```bash
CRON_SECRET=$(grep 'CRON_SECRET=' web/.env | head -1 | cut -d= -f2)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/publish-insight | python3 -m json.tool
```

### Custom topic:
1. Add topic to `web/content/insights/topic-queue.json`
2. Run the cron to generate and publish
3. Verify at `https://blockid.au/insights/{slug}`

### Verify:
- Check article loads (200)
- Check sitemap includes it
- Check insights listing shows it