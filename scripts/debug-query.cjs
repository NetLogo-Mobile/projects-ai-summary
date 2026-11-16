const pl = require('plweb');
const dotenv = require('dotenv');
dotenv.config();

pl.setConfig({
  baseURL: process.env.PL_BASE_URL || 'https://physics-api-cn.turtlesim.com',
  timeout: 10000,
  consolelog: false,
  consoleResponse: false,
  consoleError: true,
  checkHttpsAgent: false
});

(async () => {
  const user = new pl.User();
  user.username = process.env.PL_USERNAME;
  user.password = process.env.PL_PASSWORD;
  await user.user.login();

  const resp = await user.projects.query('Experiment', { take: -5, skip: 0, from: null });
  console.log('[DEBUG] top-level keys:', Object.keys(resp));
  console.log('[DEBUG] Status/Message:', resp.Status, resp.Message);
  console.log('[DEBUG] typeof Data:', typeof resp.Data, 'isArray:', Array.isArray(resp.Data));
  if (resp.Data && !Array.isArray(resp.Data)) {
    console.log('[DEBUG] Data keys:', Object.keys(resp.Data));
    console.log('[DEBUG] Data.$values length:', (resp.Data.$values || []).length);
  }
  const rows = Array.isArray(resp.Data) ? resp.Data : (resp.Data && resp.Data.$values) || [];
  console.log('[DEBUG] rows length:', rows.length);
  console.log('[DEBUG] first row sample:', JSON.stringify(rows[0]).slice(0, 500));
  console.log('[DEBUG] raw first page JSON:', JSON.stringify(resp).slice(0, 2000));
})().catch((e) => { console.error('[DEBUG] FAILED:', e.message); process.exit(1); });
