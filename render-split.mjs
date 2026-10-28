// Renders the kb page for #4471's split the way the desk sees it, from the same data and logic
// the .svx page uses. Run: node render-split.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dataDir = path.join(root, 'src/lib/data');

const reports = JSON.parse(fs.readFileSync(path.join(dataDir, 'reports-4471.json'), 'utf8'));
const notes = JSON.parse(fs.readFileSync(path.join(dataDir, 'desk-notes.json'), 'utf8'));
const tenants = {};
for (const f of fs.readdirSync(path.join(dataDir, 'tenants'))) {
  const t = JSON.parse(fs.readFileSync(path.join(dataDir, 'tenants', f), 'utf8'));
  tenants[t.handle] = t;
}

const HINT = { 'booking-v2': 'DD/MM/YYYY', 'booking-v3': 'MM/DD/YYYY' };

function dayFirst(locale) {
  const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12)))
    .map((p) => p.type);
  return order.indexOf('day') < order.indexOf('month');
}

function causeOf(r, t) {
  if (!t || !dayFirst(t.locale)) return null;
  return r.channel === 'form' && HINT[t.form].startsWith('MM') ? 'hint' : 'parser';
}

const uniqueById = (rs) => [...new Map(rs.map((r) => [r.id, r])).values()];
const merged = uniqueById(reports).filter((r) => r.mergedInto === 4471);

const byCause = new Map();
for (const r of merged) {
  const c = causeOf(r, tenants[r.tenant]) ?? 'unplaced';
  byCause.set(c, [...(byCause.get(c) ?? []), r]);
}

const groups = [...byCause.entries()]
  .map(([cause, rs]) => {
    const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
    return {
      cause,
      reports: rs,
      tenants: new Set(rs.map((r) => r.tenant)).size,
      channels: rs.reduce((n, r) => ({ ...n, [r.channel]: (n[r.channel] ?? 0) + 1 }), {}),
      firstSeen: days[0],
      lastSeen: days[days.length - 1],
    };
  })
  .sort((a, b) => b.reports.length - a.reports.length);

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function fnv1a(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function deskRef(signature) {
  const t = signature.trim();
  const a = fnv1a(t, 0x811c9dc5);
  const b = fnv1a(t, 0x9e3779b9);
  let bits = (BigInt(a) << 8n) | BigInt(b & 0xff);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return `DR-${out.slice(0, 4)}-${out.slice(4)}`;
}

const svx = fs.readFileSync(path.join(root, 'src/routes/kb/incidents/4471/split/+page.svx'), 'utf8');
const signature = svx.match(/^signature:\s*(.+)$/m)[1].trim();
const reviewed = svx.match(/^reviewed:\s*(.+)$/m)[1].trim();
const ageDays = Math.floor((Date.now() - new Date(reviewed).getTime()) / 86_400_000);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const channelText = (c) =>
  Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ×${n}`)
    .join(' · ');

const rows = groups
  .map(
    (g) => `      <tr>
        <td><code>${esc(g.cause)}</code></td>
        <td>${g.reports.length}</td>
        <td>${g.tenants}</td>
        <td class="tags">${esc(channelText(g.channels))}</td>
        <td>${g.firstSeen} → ${g.lastSeen}</td>
      </tr>`,
  )
  .join('\n');

const moved = notes.oneDayMove.filter((id) => merged.some((r) => r.id === id));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>#4471 · split: two problems, not one · support kb</title>
<style>
  :root {
    --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e0d8;
    --accent: #2f6f5e; --warn: #b4501f; --warn-bg: #fbeee6; --note-bg: #eef5f2;
    --mono: ui-monospace, 'Cascadia Code', Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #171716; --fg: #ecebe6; --muted: #9c9a93; --line: #34332f;
      --accent: #6fbfa6; --warn: #f0905d; --warn-bg: #3a2418; --note-bg: #1d2c27;
    }
  }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, sans-serif; }
  .kb { max-width: 760px; margin: 0 auto; padding: 2rem 16px 4rem; }
  .crumb { font: 0.8rem var(--mono); text-decoration: none; color: var(--muted); }
  h1 { margin: 0.25rem 0 0.5rem; line-height: 1.2; }
  h2 { margin-top: 2rem; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); font-size: 0.85rem; margin: 0; }
  .status { border: 1px solid var(--line); border-radius: 99px; padding: 0 0.6rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }
  th, td { border-bottom: 1px solid var(--line); padding: 0.35rem 0.5rem; text-align: left; }
  code { font-family: var(--mono); font-size: 0.88em; }
  a { color: var(--accent); }
  aside { border-left: 4px solid var(--accent); padding: 0.5rem 1rem; margin: 1rem 0; background: var(--note-bg); }
  aside.warn { border-color: var(--warn); background: var(--warn-bg); }
  .sum { font-size: 1.1rem; }
  .tags { color: var(--muted); font-size: 0.85em; }
  .stamp { margin: 2rem 0 0; font: 0.85rem var(--mono); color: var(--muted); }
  .stamp b { color: var(--accent); letter-spacing: 0.04em; }
  footer { margin-top: 3rem; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--line); padding-top: 1rem; }
</style>
</head>
<body>
<div class="kb">
  <header>
    <a class="crumb" href="/kb">support desk · kb</a>
    <h1>#4471 · split: two problems, not one</h1>
    <p class="meta">
      <span>owner <b>support desk</b></span>
      <span class="status proposed">proposed</span>
      <span>reviewed ${reviewed} · ${ageDays} days ago</span>
    </p>
  </header>
  <main>
    <p>#4471 was opened as one issue: "dates parse mm/dd in eu locales". It is not one issue. The
    export holds <strong>412 unique reports</strong> (427 rows; 15 ids appear twice because the export pages
    overlap) and they come from <strong>two different bugs</strong>.</p>

    <aside class="warn">The desk merged on subject alone (<a href="/kb/decisions/0001-dedupe-by-subject">decision 0001</a>). The
    two bugs share subjects, so they share a ticket. One fix queued will not close both.</aside>

    <h2>The two problems</h2>

    <p class="sum"><strong>${merged.length}</strong> reports merged into #4471 · <strong>${groups.length}</strong> problems</p>
    <table>
      <thead>
        <tr><th>problem</th><th>reports</th><th>tenants</th><th>channels</th><th>seen</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>

    <h3><code>parser</code> — ${groups.find((g) => g.cause === 'parser').reports.length} reports</h3>
    <p>The shared parser reads every date month first. Every tenant on file writes the day first, so
    their dates come out flipped. This is the bug the ticket describes, and it is the larger one.</p>
    <ul>
      <li>11 tenants, all of them: harbour.dental 52, kettle.books 47, nine.lanterns 44, morrow.tax 40,
      long.table 39, ridge.clinic 36, stone.and.sons 30, lantern.row 28, alder.physio 23,
      pale.harbour 21, copper.studio 19.</li>
      <li>Every channel: app 204, email 150, form 25.</li>
      <li>Seen 2026-04-01 → 2026-10-04.</li>
      <li>Intake tagged 356 of these <code>parser</code> and 23 <code>hint</code>. Intake reads the browser locale, which is
      not the tenant's locale, so its tag is a guess.</li>
    </ul>

    <h3><code>hint</code> — ${groups.find((g) => g.cause === 'hint').reports.length} reports</h3>
    <p>Three tenants run <code>booking-v3</code>, whose date field prints <code>MM/DD/YYYY</code>. Their people type what the
    hint tells them, month first, and the form reads it the tenant's way. The date is wrong before
    the parser ever sees it. This is a second bug with a second fix.</p>
    <ul>
      <li>alder.physio 12, copper.studio 11, pale.harbour 10.</li>
      <li>Form only: 33 of 33.</li>
      <li>Seen 2026-04-17 → 2026-09-22.</li>
      <li>Intake tagged 15 of these <code>parser</code> and 18 <code>hint</code>.</li>
    </ul>

    <h2>What the counts do not show</h2>
    <p>Five reports describe a <strong>one-day</strong> shift, not a month swap: ${moved.join(', ')}. They are filed under <code>parser</code> by tenant, as the desk reads them, and they are
    footnoted here rather than counted apart. R-41344 names two clients in two time zones on one
    meeting, which points at a third cause the desk has not opened a ticket for.</p>

    <h2>What to do</h2>
    <ol>
      <li>Keep #4471 for <code>parser</code>: 379 reports, one fix in the shared parser.</li>
      <li>Open a ticket for <code>hint</code>: 33 reports, one fix in <code>booking-v3</code>'s date field.</li>
      <li>Read the tenant's locale and form before you merge, not the subject line. Decision 0001 needs
      a replacement record; this page does not change it.</li>
    </ol>

    <p class="stamp">desk ref <b>${deskRef(signature)}</b></p>
  </main>
  <footer>Pages are written by people. Tables and charts are built from data at render time.</footer>
</div>
</body>
</html>
`;

const out = path.join(root, 'src/routes/kb/incidents/4471/split/page.html');
fs.writeFileSync(out, html);
console.log('wrote', out);
console.log('groups:', groups.map((g) => `${g.cause}=${g.reports.length}`).join(' '));
console.log('desk ref:', deskRef(signature));
