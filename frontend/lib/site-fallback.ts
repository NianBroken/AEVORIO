import 'server-only';
import { readFile, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEMO_SITE_SETTINGS, type SiteSettings } from './site-types';

const cacheDirectory = path.join(
  process.cwd(),
  'storage',
  process.env.SITE_CACHE_NAMESPACE ?? 'published',
);
const cacheFile = path.join(cacheDirectory, 'last-published-settings.json');
let remembered: SiteSettings | undefined;

// 故障页使用最近一次已发布的公共文案，正常页面始终读取实时接口。
export async function rememberSettings(settings: SiteSettings): Promise<void> {
  if (JSON.stringify(remembered) === JSON.stringify(settings)) return;
  remembered = settings;
  await mkdir(cacheDirectory, { recursive: true });
  const temporary = path.join(cacheDirectory, randomUUID() + '.tmp');
  try {
    await writeFile(temporary, JSON.stringify(settings), 'utf8');
    await rename(temporary, cacheFile);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function fallbackSettings(): Promise<SiteSettings> {
  if (remembered) return remembered;
  try {
    remembered = JSON.parse(await readFile(cacheFile, 'utf8')) as SiteSettings;
    return remembered;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return DEMO_SITE_SETTINGS;
  }
}
