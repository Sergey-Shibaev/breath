// Локальный сервер для предпросмотра приложения на компьютере. Без зависимостей.
// Запуск: node dev-server.js  →  http://localhost:8137
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 8137;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    // Сохранение иконок, нарисованных страницей tools/make-icons.html (только имена вида icon-*.png в папку icons).
    if (req.method === 'POST' && url.pathname === '/__save-icon') {
      const name = url.searchParams.get('name') || '';
      if (!/^icon-[a-z0-9-]+\.png$/.test(name)) {
        res.writeHead(400);
        res.end();
        return;
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
        fs.writeFileSync(path.join(root, 'icons', name), Buffer.concat(chunks));
        res.writeHead(204);
        res.end();
      });
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.join(root, pathname);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Не найдено');
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`Дыхание: http://localhost:${port}`));
