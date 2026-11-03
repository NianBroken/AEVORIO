import type { Metadata } from 'next';
import { ScaledPage } from '../components/ScaledPage';
import { fetchSitePage, makePageMetadata } from '../lib/site-data';
import { PageLayout } from '../components/PageLayout';
import { PageUnavailable } from '../components/PageUnavailable';
import { SectionBlocks } from '../components/SectionBlocks';
import { DEMO_SITE_SETTINGS } from '../lib/site-types';

// 首页分别从数据库读取自己的 SEO 内容和十二个独立展示板块。
export async function generateMetadata(): Promise<Metadata> {
  return makePageMetadata('home');
}

export default async function HomePage() {
  const result = await fetchSitePage('home');
  if (!result.ok) {
    return (
      <ScaledPage pageName="home">
        <PageLayout companyName={DEMO_SITE_SETTINGS.companyName} currentPage="home" settings={DEMO_SITE_SETTINGS}>
          <PageUnavailable error={result.error} title="首页内容暂不可用" />
        </PageLayout>
      </ScaledPage>
    );
  }

  return (
    <ScaledPage pageName="home">
      <PageLayout companyName={result.data.settings.companyName} currentPage="home" settings={result.data.settings}>
        <SectionBlocks sections={result.data.page.sections} />
      </PageLayout>
    </ScaledPage>
  );
}

