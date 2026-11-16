const { config } = require('../dist/config');
const { login, queryExperiments, getSummary } = require('../dist/pl/client');
const dotenv = require('dotenv');
dotenv.config();

(async () => {
  const session = await login(config.plUsername, config.plPassword);
  console.log('[DEBUG] 登录成功');

  const page1 = await queryExperiments(session, 'Experiment', null, 5, ['小作品']);
  console.log('[DEBUG] 第一页 rows:', page1.items.length);
  console.log('[DEBUG] first row:', JSON.stringify(page1.items[0]).slice(0, 300));
  const lastId = page1.items[page1.items.length - 1].ID;
  console.log('[DEBUG] 游标 lastId:', lastId);

  const page2 = await queryExperiments(session, 'Experiment', lastId, 5, ['小作品']);
  const ids1 = new Set(page1.items.map(i => i.ID));
  const dup = page2.items.filter(i => ids1.has(i.ID)).length;
  console.log('[DEBUG] 第二页 rows:', page2.items.length, '与第一页重复:', dup);

  const s = await getSummary(session, page1.items[0].ID, 'Experiment');
  console.log('[DEBUG] GetSummary OK, Description type:', Array.isArray(s.Data.Description) ? 'array' : typeof s.Data.Description, 'User:', s.Data.User && s.Data.User.Nickname);
})().catch((e) => { console.error('[DEBUG] FAILED:', e.message); process.exit(1); });
