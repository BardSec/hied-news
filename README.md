# HiEd Cyber News

A news aggregator for **higher-ed IT and cybersecurity teams**. It collects campus cyber incidents, ghost-student and financial-aid fraud, GLBA/FERPA compliance and EDUCAUSE/REN-ISAC news, plus general attacks and vulnerabilities that are likely to hit colleges and universities. It pulls from 26 sources, filters for relevance, deduplicates and shows the results in a searchable web page.

Live site: https://hied-news.edtechirl.com (also https://hied-news.pages.dev)

Companion to [k12-cyber-news](../k12-cyber-news) (K12) and [ressec-news](../ressec-news) (research security).

## Categories

Every article is tagged with one of two categories, shown as a badge and filterable with **Show**:

- **Higher Ed:** the story is about colleges, universities or the higher-ed sector.
- **Threat Watch:** a general security story that isn't about higher ed but names technology campuses commonly run: ERP/SIS/LMS platforms (Ellucian, PeopleSoft, Workday, Canvas, D2L…), identity and collaboration (Microsoft 365, Okta, Duo, Shibboleth, Google Workspace…), edge and infrastructure (Fortinet, Ivanti, Citrix, Palo Alto, VMware…), file-transfer tools (MOVEit, GoAnywhere…), CISA's Known Exploited Vulnerabilities additions and Patch Tuesday.

Product matching only looks at the headline and the first 400 characters of the summary, so stories that mention a product in passing don't count. The list is `IMPACT_KEYWORDS` in `lib/aggregator.js`.

## How it works

- **Production:** a static site on Cloudflare Pages. A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs every 30 minutes. It fetches every feed, writes `dist/data/articles.json` and deploys `dist/` to Pages. If the fetch looks unhealthy (fewer than 20 articles, or more than half the feeds failing), the build fails and the last good deploy stays live.
- **Local dev / Docker:** `server.js` serves the same frontend and the same `/data/*.json` paths from an in-memory cache that refreshes every 15 minutes.

Both use the same feed list and filters in `lib/aggregator.js`.

## Sources

| Group | Sources | Filter |
|---|---|---|
| Google News searches | University cyberattacks, college ransomware, community colleges, ghost students & aid fraud, GLBA / FSA cybersecurity, campus phishing, campus IT outages, EDUCAUSE / REN-ISAC | None (scoped by query); phishing and outages use Cyber |
| Higher-ed outlets | Higher Ed Dive, Inside Higher Ed, Campus Technology, EdTech Magazine Higher Ed, EdScoop, Internet2 | Cyber |
| Security outlets | DataBreaches.net, Comparitech, The Record, Cybersecurity Dive, Bleeping Computer, The Hacker News, SecurityWeek, Dark Reading, Krebs on Security | Edu |
| Vulnerability / advisories | Help Net Security, CISA Advisories (ICS advisories excluded), CISA News | Impact |

Filters:
- **None:** keep everything, tagged Higher Ed.
- **Cyber:** keep stories with a cybersecurity or IT-security term, tagged Higher Ed.
- **Edu:** keep higher-ed stories (Higher Ed), plus stories about the campus technology stack (Threat Watch).
- **Impact:** like Edu, but the higher-ed check also only looks at the headline and lead.

Matching is on whole words. When the same story arrives from several feeds, the first feed in `FEEDS` wins, so higher-ed sources come first. EDUCAUSE, the Chronicle and REN-ISAC block automated fetches or publish no feed, so they're covered by Google News searches.

To add a source, add an entry to `FEEDS` in `lib/aggregator.js`.

## Running locally

```bash
npm install
npm run dev      # http://localhost:3000, auto-restarts on change
npm run build    # produce the static site in dist/
```

## Running with Docker

```bash
docker compose up -d --build
```

Available at `http://localhost:30305` (bound to loopback).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port (Docker sets `30305`) |
| `MAX_AGE_DAYS` | `365` | Drop articles older than this. Google News searches otherwise return stories years old |
| `MIN_ARTICLES` | `20` | Static build fails, and skips the deploy, below this many articles |

## Deployment (Cloudflare Pages)

- Pages project: `hied-news`, production branch `main`.
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN` (Pages edit permission) and `CLOUDFLARE_ACCOUNT_ID`.
- The workflow runs on push to `main`, every 30 minutes, and on manual dispatch (**Actions → Build & deploy → Run workflow**).
- Custom domain: `hied-news.edtechirl.com`, a proxied CNAME to `hied-news.pages.dev` in the edtechirl.com zone, plus a custom domain on the Pages project.
- **Keepalive:** GitHub disables scheduled workflows in public repos after 60 days with no commits. When the last commit is 25+ days old, the scheduled run pushes an empty `keepalive` commit as `github-actions[bot]`. Run the workflow by hand with **force_keepalive** to test it.

## API (Docker / local server only)

| Endpoint | Description |
|---|---|
| `GET /data/articles.json` | All cached articles (each has a `category`), plus `lastFetched` |
| `GET /data/sources.json` | Configured source names |
| `GET /api/articles` | Paginated list. Query params: `q`, `source`, `page`, `limit` (max 500) |
| `GET /api/refresh` | Force a refresh (at most once per minute) |

## RSS feed

Each build also writes `feed.xml`, an RSS 2.0 feed of the 50 newest articles, at `<site>/feed.xml`. Pages link to it from a `<link rel="alternate">` tag and from the **Subscribe** card in the sidebar.

- Site name, description and URL for the feed come from `site.json`.
- `lib/feed.js` is identical in all three news repos.
- The feed exists only in the static build (`npm run build`), not in the local Express server.

## Sponsor

The EdTech IRL news sites are sponsored by [SoftwareStudioK12](https://softwarestudiok12.com/). Each page shows a sponsor card in the sidebar and a "Sponsored by" line in the footer, both with a disclosure that the sponsor is the author's company and has no say in which articles appear.

- The sponsor's name, logo, link, per-site message, call to action, disclosure and `utm_source` live in the `sponsor` section of `site.json`. Edit that to change the sponsor or its message.
- At build time, `lib/sponsor.js` (identical in all three repos) replaces the `<!-- SPONSOR_CARD -->` and `<!-- SPONSOR_FOOTER -->` placeholders in `index.html`.
- The local Express server serves `public/` unbuilt, so it doesn't show the sponsor block.
- Sponsor links carry UTM tags (`utm_medium=sponsor`, `utm_campaign=edtechirl-news`, `utm_content=sidebar|footer`). Clicks show up in SoftwareStudioK12's analytics. The news sites themselves track nothing.
- The logo is `public/brand/sponsor-softwarestudiok12.svg`, a light-only copy of the mark from softwarestudiok12.com. The original switches its lines to white in dark mode, which would vanish on these white cards.

## Branding (EdTech IRL network)

This site is one of three EdTech IRL news feeds: [K12 Cyber Watch](https://news.edtechirl.com/), [HiEd Cyber News](https://hied-news.edtechirl.com/) and [ResSec News](https://ressec-news.edtechirl.com/). Each has the same top bar and footer linking the three sites and the [EdTech IRL blog](https://www.edtechirl.com/).

- `public/brand/brand.css` is **identical in all three repos**. It sets the light theme, the network bar, the footer and each site's accent colors. Edit it in one repo and copy it to the other two.
- Each page picks its accent with `<html data-site="k12|hied|ressec">`. Accents: K12 blue `#1D4ED8`, HiEd teal `#0F766E`, ResSec orange `#B45309` for text with `#FF8200` for highlights. The EdTech IRL coral `#FD5353` is used only in the top bar.
- `public/brand/` also holds the IRL badge (`edtechirl-badge-64.png`, `-180.png`, `favicon-32.png`).

## Tech stack

- Node.js 20 / Express (local server only)
- [rss-parser](https://github.com/rbren/rss-parser)
- Vanilla JS frontend
- GitHub Actions + Cloudflare Pages (production), Docker (local)
