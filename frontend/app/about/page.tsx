import type { Metadata } from 'next';
import { PageLayout } from '../../components/PageLayout';
import { PageUnavailable } from '../../components/PageUnavailable';
import { ScaledPage } from '../../components/ScaledPage';
import { SectionBlocks } from '../../components/SectionBlocks';
import { fetchSitePage, makePageMetadata } from '../../lib/site-data';
import { DEMO_SITE_SETTINGS } from '../../lib/site-types';

// 企业介绍版块以数据库中已确认边界的示例内容独立整理。
export async function generateMetadata(): Promise<Metadata> {
  return makePageMetadata('about');
}

export default async function AboutPage() {
  const result = await fetchSitePage('about');
  if (!result.ok) {
    return (
      <ScaledPage pageName="about">
        <PageLayout companyName={DEMO_SITE_SETTINGS.companyName} currentPage="about" settings={DEMO_SITE_SETTINGS}>
          <PageUnavailable error={result.error} title="企业介绍暂不可用" />
        </PageLayout>
      </ScaledPage>
    );
  }

  return (
    <ScaledPage pageName="about">
      <PageLayout companyName={result.data.settings.companyName} currentPage="about" settings={result.data.settings}>
        <SectionBlocks sections={result.data.page.sections} />
      </PageLayout>
    </ScaledPage>
  );
}
