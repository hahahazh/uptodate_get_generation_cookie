const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generate() {
  const svgContent = fs.readFileSync(path.join(__dirname, 'extension/icons/icon.svg'), 'utf8');
  
  // HTML wrapper for perfect sizing
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            width: 100vw; 
            height: 100vh; 
            background: transparent;
          }
          svg {
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `;

  console.log('Launching Puppeteer to render icons...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const sizes = [16, 48, 128];
  
  for (const size of sizes) {
    console.log(`Generating icon${size}.png...`);
    await page.setViewport({ width: size, height: size });
    await page.screenshot({ 
      path: path.join(__dirname, `extension/icons/icon${size}.png`), 
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: true // ensures transparent background
    });
  }

  await browser.close();
  console.log('Done!');
}

generate().catch(console.error);
