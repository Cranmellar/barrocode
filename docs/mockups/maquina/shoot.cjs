const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.6 });
  for (const n of ['a', 'b', 'c']) {
    await p.goto('file://' + __dirname + '/' + n + '.html');
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: __dirname + '/maquina-' + n + '.png' });
  }
  await b.close();
})();
