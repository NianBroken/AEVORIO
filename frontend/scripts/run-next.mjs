// 命令行启动和守护进程使用同一个固定端口定义。
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import ports from '../../shared/ports.json' with { type: 'json' };
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), process.argv[2], '--hostname', '127.0.0.1', '--port', String(ports.frontend)], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
