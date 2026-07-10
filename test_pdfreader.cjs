const { PdfReader } = require('pdfreader');
const { readFileSync } = require('fs');
const { homedir } = require('os');

const buffer = readFileSync(`${homedir()}/Desktop/011626 WellsFargo.pdf`);
const items = [];

new PdfReader().parseBuffer(buffer, (err, item) => {
  if (err) { console.error(err); return; }
  if (!item) {
    items
      .filter(i => i.x >= 5 && i.x <= 80)
      .sort((a,b) => b.y - a.y || a.x - b.x)
      .slice(0, 60)
      .forEach(i => console.log(`x=${i.x.toFixed(2)} y=${i.y.toFixed(2)} | ${i.text}`));
    return;
  }
  if (item.text && item.x !== undefined) {
    items.push({ x: item.x, y: item.y, text: item.text.trim() });
  }
});
