const PDFParser = require('pdf2json');
const { homedir } = require('os');

const parser = new PDFParser();

parser.on('pdfParser_dataReady', (data) => {
  const page = data.Pages[0];
  const texts = page.Texts.map(t => ({
    x: Math.round(t.x * 10) / 10,
    y: Math.round(t.y * 10) / 10,
    text: decodeURIComponent(t.R.map(r => r.T).join(''))
  }));
  texts.sort((a,b) => b.y - a.y || a.x - b.x);
  texts.filter(t => t.x >= 5 && t.x <= 80).slice(0,60).forEach(t =>
    console.log(`x=${t.x.toFixed(1)} y=${t.y.toFixed(1)} | ${t.text}`)
  );
});

parser.loadPDF(`${homedir()}/Desktop/011626 WellsFargo.pdf`);
