// B-kini Bottom — daily reminder job. GitHub Actions runs this once a day (see .github/workflows/reminders.yml).
// It reads the house from Firestore, works out what's due/overdue/out of stock, and sends ntfy notifications.
// Run it yourself with:  HOUSE_CODE=xxxxx-... node scripts/remind.js   (add DRY_RUN=1 to only print)
const path = require('path');
require(path.join(__dirname, '..', 'config.js'));
const BK = require(path.join(__dirname, '..', 'logic.js'));
const CFG = globalThis.BK_CONFIG;

(async () => {
  const code = (process.env.HOUSE_CODE || '').trim();
  if (!code) throw new Error('HOUSE_CODE is not set. Add it under GitHub → Settings → Secrets and variables → Actions.');
  if (!CFG.firebase.projectId || !CFG.firebase.apiKey) throw new Error('config.js has no Firebase settings yet.');
  const url = 'https://firestore.googleapis.com/v1/projects/' + CFG.firebase.projectId +
    '/databases/(default)/documents/houses/' + encodeURIComponent(code) + '?key=' + CFG.firebase.apiKey;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not read the house (' + r.status + '): ' + (await r.text()).slice(0, 300));
  const doc = await r.json();
  const state = JSON.parse(doc.fields.json.stringValue);
  const today = BK.today(state.house.tz || CFG.timeZone);
  BK.normalize(state, today); // work out period hand-overs without writing anything back
  const list = BK.reminders(state, today);
  console.log(today + ': ' + list.length + ' reminder(s)');
  const click = process.env.APP_URL || undefined;
  for (const n of list) {
    console.log(' → ' + (n.to === 'all' ? 'everyone' : BK.memberName(state, n.to)) + ': ' + n.title);
    if (!process.env.DRY_RUN) await BK.send(code, n, click);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
