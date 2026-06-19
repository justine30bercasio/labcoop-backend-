const app = require('./src/index');
const http = require('http');

const server = http.createServer(app);
server.listen(3002, () => {
  const test = (method, path, body) => new Promise((resolve) => {
    const opts = { hostname: 'localhost', port: 3002, path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  (async () => {
    console.log('--- GET /api/auth/accounts ---');
    const r1 = await test('GET', '/api/auth/accounts');
    console.log(r1.status, r1.body);

    console.log('--- POST /api/auth/login (Juan) ---');
    const r2 = await test('POST', '/api/auth/login', { childName: 'Juan' });
    console.log(r2.status, r2.body);

    const token = JSON.parse(r2.body).token;
    console.log('--- GET /api/accounts/:id (with auth) ---');
    const opts = { hostname: 'localhost', port: 3002, path: '/api/accounts/00000000-0000-0000-0000-000000000001', method: 'GET', headers: { 'Authorization': `Bearer ${token}` } };
    const r3 = await new Promise((resolve) => {
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.end();
    });
    console.log(r3.status, r3.body);

    server.close();
  })();
});
