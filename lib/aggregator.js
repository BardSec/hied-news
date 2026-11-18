// Feed list, relevance filters and fetch/dedupe logic.
// Shared by server.js (Docker / local dev) and scripts/build.js (static Cloudflare Pages build).
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'HiEdCyberNews/1.0 RSS Aggregator'
  }
});

// ── Categories ────────────────────────────────────────────────────────────
// Every kept article is tagged with one of these:
//   'higher-ed' – the story is about colleges, universities or the higher-ed sector
//   'threat'    – a general attack, vulnerability or campaign that isn't about higher
//                 ed but hits technology campuses commonly run (see IMPACT_KEYWORDS)

// ── Feed sources ──────────────────────────────────────────────────────────
// `filter` controls which articles from a feed are kept:
//   'none'   – keep everything as higher-ed (the feed is already on-topic)
//   'cyber'  – higher-ed outlet: keep only cyber / IT-security stories
//   'edu'    – general security feed: keep higher-ed stories, plus stories about
//              the higher-ed technology stack (tagged 'threat')
//   'impact' – vulnerability / advisory feed: keep only stories about the
//              higher-ed technology stack (tagged 'threat'), or higher-ed stories
//
// EDUCAUSE, the Chronicle and REN-ISAC either block automated fetches or publish
// no feed, so they're reached through Google News searches.
// Feed order matters: when the same story arrives twice, the earlier feed wins
// dedupe, so higher-ed sources come first.
const GN = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const FEEDS = [
  // Google News searches — scoped by query
  { name: 'Google News – University Cyberattacks', url: GN('university cyberattack OR "university data breach"'), filter: 'none' },
  { name: 'Google News – College Ransomware',      url: GN('college OR university ransomware'),                  filter: 'none' },
  { name: 'Google News – Community Colleges',      url: GN('"community college" cyberattack OR breach OR ransomware OR hackers'), filter: 'none' },
  { name: 'Google News – Ghost Students & Aid Fraud', url: GN('"ghost students" OR "financial aid fraud" OR "fake students" college'), filter: 'none' },
  { name: 'Google News – GLBA / FSA Cybersecurity', url: GN('GLBA "safeguards rule" college OR university OR "FSA cybersecurity"'), filter: 'none' },
  { name: 'Google News – Campus Phishing',         url: GN('university OR college phishing students OR faculty'), filter: 'cyber' },
  { name: 'Google News – Campus IT Outages',       url: GN('university OR college "network outage" OR "systems offline" OR "IT outage"'), filter: 'cyber' },
  { name: 'Google News – EDUCAUSE / REN-ISAC',     url: GN('EDUCAUSE OR REN-ISAC cybersecurity'),                filter: 'none' },

  // Higher-ed outlets — keep the cyber stories
  { name: 'Higher Ed Dive',         url: 'https://www.highereddive.com/feeds/news/',         filter: 'cyber' },
  { name: 'Inside Higher Ed',       url: 'https://www.insidehighered.com/rss.xml',           filter: 'cyber' },
  { name: 'Campus Technology',      url: 'https://campustechnology.com/rss-feeds/news.aspx', filter: 'cyber' },
  { name: 'EdTech Magazine – Higher Ed', url: 'https://edtechmagazine.com/higher/rss.xml',   filter: 'cyber' },
  { name: 'EdScoop',                url: 'https://edscoop.com/feed/',                        filter: 'cyber' },
  { name: 'Internet2',              url: 'https://internet2.edu/feed/',                      filter: 'cyber' },

  // General security outlets — higher-ed stories plus threats to the campus stack
  { name: 'DataBreaches.net',   url: 'https://databreaches.net/feed/',                filter: 'edu' },
  { name: 'Comparitech',        url: 'https://www.comparitech.com/feed/',             filter: 'edu' },
  { name: 'The Record',         url: 'https://therecord.media/feed',                  filter: 'edu' },
  { name: 'Cybersecurity Dive', url: 'https://www.cybersecuritydive.com/feeds/news/', filter: 'edu' },
  { name: 'Bleeping Computer',  url: 'https://www.bleepingcomputer.com/feed/',        filter: 'edu' },
  { name: 'The Hacker News',    url: 'https://feeds.feedburner.com/TheHackersNews',   filter: 'edu' },
  { name: 'SecurityWeek',       url: 'https://feeds.feedburner.com/Securityweek',     filter: 'edu' },
  { name: 'Dark Reading',       url: 'https://www.darkreading.com/rss.xml',           filter: 'edu' },
  { name: 'Krebs on Security',  url: 'https://krebsonsecurity.com/feed/',             filter: 'edu' },
  { name: 'Help Net Security',  url: 'https://www.helpnetsecurity.com/feed/',         filter: 'impact' },

  // Government advisories
  // ICS advisories (Siemens, Rockwell…) often bundle Fortinet or VMware components but
  // aren't campus IT, so they're dropped by link path
  { name: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', filter: 'impact',
    excludeLink: /\/ics-(medical-)?advisories\// },
  { name: 'CISA News',       url: 'https://www.cisa.gov/news.xml',                         filter: 'impact' },
];

// ── Keyword lists ─────────────────────────────────────────────────────────
// Matched on word boundaries (see buildMatcher), so "hacker" won't match
// "hackathon".

// Cybersecurity and IT-security signals, used on higher-ed outlets
const CYBER_KEYWORDS = [
  'cybersecurity', 'cyber security', 'cyberattack', 'cyberattacks', 'cyber attack',
  'cyber incident', 'cyber threat', 'ransomware', 'malware', 'phishing', 'smishing',
  'data breach', 'breach', 'breached', 'hacked', 'hacker', 'hackers', 'hacking',
  'vulnerability', 'vulnerabilities', 'exploit', 'exploited', 'zero-day',
  'incident response', 'cisa', 'mfa', 'multi-factor', 'multifactor', 'credential',
  'credentials', 'infosec', 'intrusion', 'ddos', 'spyware', 'social engineering',
  'dark web', 'data leak', 'data exposure', 'identity theft', 'financial aid fraud', 'scam', 'scams',
  'ghost students', 'network outage', 'it outage', 'systems offline', 'zero trust',
  'ferpa', 'glba', 'safeguards rule', 'hipaa', 'pci', 'security awareness',
];

// Higher-ed signals. Deliberately excludes bare "academic" and "research" —
// security outlets say "academic researchers" and "security researchers" constantly.
const EDU_KEYWORDS = [
  'university', 'universities', 'college', 'colleges', 'campus', 'campuses',
  'community college', 'community colleges', 'higher education', 'higher ed',
  'faculty', 'research university', 'research universities', 'student loan',
  'financial aid', 'fafsa', 'ghost students', 'registrar', 'alumni',
  'educause', 'ren-isac', 'internet2', 'incommon', 'eduroam',
];

// Products and platforms common in higher-ed IT. A general security story that
// names one of these is likely to land on a campus security team's desk.
// Ambiguous product names are qualified ("Canvas LMS", not "Canvas"; "Exchange
// Server", not "Exchange") to keep unrelated stories out.
const IMPACT_KEYWORDS = [
  // Student information, ERP and LMS platforms
  'ellucian', 'banner erp', 'peoplesoft', 'workday', 'oracle e-business',
  'instructure', 'canvas lms', 'blackboard', 'anthology', 'd2l', 'brightspace',
  'moodle', 'kaltura', 'panopto', 'turnitin', 'powerschool', 'slate crm',
  'raiser\'s edge', 'blackbaud', 'jenzabar', 'touchnet', 'transact campus',
  'national student clearinghouse',
  // Identity and collaboration
  'shibboleth', 'incommon', 'eduroam', 'okta', 'cisco duo', 'duo security',
  'entra id', 'azure ad', 'active directory', 'microsoft 365', 'office 365',
  'exchange server', 'sharepoint', 'onedrive', 'microsoft teams', 'google workspace',
  'gmail', 'zoom', 'adobe acrobat',
  // Edge and infrastructure commonly exposed on campus networks
  'fortinet', 'fortigate', 'fortios', 'fortiweb', 'ivanti', 'pulse secure',
  'citrix', 'netscaler', 'palo alto networks', 'pan-os', 'globalprotect',
  'check point', 'cisco asa', 'cisco ios xe', 'sonicwall', 'f5 big-ip', 'big-ip', 'juniper',
  'vmware', 'esxi', 'vcenter', 'veeam', 'nutanix',
  // File transfer and service management tools hit by mass-exploitation campaigns
  'moveit', 'goanywhere', 'cleo', 'accellion', 'kiteworks', 'servicenow',
  'confluence', 'jira', 'gitlab', 'jenkins',
  // Campus-wide threats
  'emergency directive', 'patch tuesday', 'known exploited vulnerabilities', 'scattered spider',
  'help desk social engineering', 'mfa fatigue', 'infostealer', 'infostealers',
];

function buildMatcher(keywords) {
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}
const CYBER_RE  = buildMatcher(CYBER_KEYWORDS);
const EDU_RE    = buildMatcher(EDU_KEYWORDS);
const IMPACT_RE = buildMatcher(IMPACT_KEYWORDS);

function itemText(item) {
  return [
    item.title || '',
    item.contentSnippet || '',
    item.content || '',
    item.categories?.map(c => (typeof c === 'string' ? c : c?._ || '')).join(' ') || '',
  ].join(' ');
}

// Product matching only looks at the headline and the start of the summary.
// Full-text feeds mention Microsoft or Zoom in passing all the time; a story
// is only "about" the product if it leads with it.
function leadText(item) {
  return `${item.title || ''} ${(item.contentSnippet || '').slice(0, 400)}`;
}

// Each filter returns a category for a kept item, or null to drop it
const FILTERS = {
  none:   () => 'higher-ed',
  cyber:  item => (CYBER_RE.test(itemText(item)) ? 'higher-ed' : null),
  edu:    item => (EDU_RE.test(itemText(item)) ? 'higher-ed' : IMPACT_RE.test(leadText(item)) ? 'threat' : null),
  impact: item => (EDU_RE.test(leadText(item)) ? 'higher-ed' : IMPACT_RE.test(leadText(item)) ? 'threat' : null),
};

// Only pass through http(s) links — a feed could otherwise inject a
// javascript: URL that runs when a reader clicks the card.
function safeLink(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '#';
  } catch {
    return '#';
  }
}

function normalizeItem(item, feedName, category) {
  const link = safeLink(item.link || item.guid || '');
  return {
    title: item.title || 'Untitled',
    link,
    published: item.isoDate || item.pubDate || new Date().toISOString(),
    summary: item.contentSnippet || item.summary || '',
    source: feedName,
    category,
    guid: link !== '#' ? link : (item.guid || item.title),
  };
}

// Google News searches return stories years old; drop anything past this age
const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS, 10) || 365;

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    const classify = FILTERS[feed.filter] || FILTERS.none;
    const kept = [];
    for (const item of result.items || []) {
      const category = classify(item);
      if (!category) continue;
      const article = normalizeItem(item, feed.name, category);
      if (feed.excludeLink?.test(article.link)) continue;
      kept.push(article);
    }
    return kept;
  } catch (err) {
    console.warn(`[warn] Failed to fetch "${feed.name}": ${err.message}`);
    return null;
  }
}

// Fetch every feed, filter, drop stale items, dedupe and sort newest first.
// Returns { articles, feedErrors } — feedErrors counts feeds that returned nothing due to an error.
async function fetchAll() {
  let feedErrors = 0;
  const results = await Promise.all(FEEDS.map(f => fetchFeed(f).then(r => {
    if (r === null) { feedErrors++; return []; }
    return r;
  })));
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const all = results.flat().filter(a => !(new Date(a.published) < cutoff));

  // Deduplicate by link, then by normalized title — the same story often
  // arrives from several Google News queries plus the outlet's own feed
  const seenGuid = new Set();
  const seenTitle = new Set();
  const articles = all.filter(a => {
    const titleKey = a.title.toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/\W+/g, ' ').trim();
    if (seenGuid.has(a.guid) || seenTitle.has(titleKey)) return false;
    seenGuid.add(a.guid);
    seenTitle.add(titleKey);
    return true;
  });

  articles.sort((a, b) => new Date(b.published) - new Date(a.published));
  return { articles, feedErrors };
}

const sourceNames = () => FEEDS.map(f => f.name);

module.exports = { FEEDS, fetchAll, sourceNames };
