import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

// 独立测试服务接入明确失败的内容接口，正式前后端进程保持正常服务。
test('内容接口失败时显示真实失败状态', async ({ page }) => {
  test.setTimeout(40_000);
  const failureMessage = '测试内容服务暂不可用，请检查后端连接并重新加载当前网页。';
  const contentServer = createServer((_request, response) => {
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      Code: 2001,
      Messages: failureMessage,
      Data: null,
      RequestId: 'browser-failure-state',
      Timestamp: new Date().toISOString(),
    }));
  });
  const contentPort = await listen(contentServer);
  const portProbe = createServer();
  const frontendPort = await listen(portProbe);
  await close(portProbe);
  const child = spawn(process.execPath, [
    path.join(process.cwd(), 'node_modules/next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', String(frontendPort),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, BACKEND_ORIGIN: `http://127.0.0.1:${contentPort}` },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let startupOutput = '';
  let startupError = '';
  child.stdout.on('data', (chunk: Buffer) => { startupOutput += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { startupError += chunk.toString('utf8'); });

  try {
    await expect.poll(() => startupOutput.includes('Ready in'), { timeout: 15_000 }).toBe(true);
    await page.goto(`http://127.0.0.1:${frontendPort}/products`);
    await expect(page.locator('.page-unavailable h1')).toHaveText('产品目录暂不可用');
    await expect(page.locator('.page-unavailable p')).toHaveText(failureMessage);
    await expect(page.locator('.product-tile')).toHaveCount(0);
    await expect(page.locator('.primary-nav a')).toHaveCount(3);
    expect(startupError).toBe('');
    await page.screenshot({ path: 'screenshots/content-failure-state.png' });
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    await close(contentServer);
  }
});

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return (server.address() as AddressInfo).port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
