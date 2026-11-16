const { config } = require('../dist/config');
const { login, queryExperiments } = require('../dist/pl/client');
const dotenv = require('dotenv');
dotenv.config();

const CUTOFF = new Date('2026-10-08T00:00:00+08:00').getTime();

(async () => {
  const session = await login(config.plUsername, config.plPassword);
  for (const category of ['Experiment', 'Discussion']) {
    let cursor = null;
    let total = 0;
    let sinceCutoff = 0;
    let oldestSeen = null;
    for (let page = 0; page < 100; page++) {
      const { items } = await queryExperiments(session, category, cursor, 20, null);
      if (items.length === 0) break;
      for (const it of items) {
        total++;
        const d = it.SortingDate ?? it.CreationDate;
        if (d) {
          const t = new Date(d).getTime();
          if (!oldestSeen || t < oldestSeen) oldestSeen = t;
          if (t >= CUTOFF) sinceCutoff++;
        }
      }
      const last = items[items.length - 1];
      const ld = last.SortingDate ?? last.CreationDate;
      if (ld && new Date(ld).getTime() < CUTOFF) break;
      if (!last.ID || last.ID === cursor) break;
      cursor = last.ID;
    }
    console.log(`[COUNT] ${category}: 自2026-10-08以来约 ${sinceCutoff} 条（共扫描 ${total} 条，最早见到 ${oldestSeen ? new Date(oldestSeen).toISOString().slice(0, 10) : 'N/A'}）`);
  }
})().catch((e) => { console.error('[COUNT] FAILED:', e.message); process.exit(1); });
