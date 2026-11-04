import type { Metadata } from 'next';
import { PageLayout } from '../../../components/PageLayout';
import { PageUnavailable } from '../../../components/PageUnavailable';
import { ScaledPage } from '../../../components/ScaledPage';
import { SectionBlocks } from '../../../components/SectionBlocks';
import { fetchSitePage, makePageMetadata } from '../../../lib/site-data';
import { fallbackSettings } from '../../../lib/site-fallback';

// 企业介绍版块以数据库中已确认边界的示例内容独立整理。
export async function generateMetadata(): Promise<Metadata> {
  return makePageMetadata('about');
}

export default async function AboutPage() {
  const result = await fetchSitePage('about');
  if (!result.ok) {
    const settings = await fallbackSettings();
    return (
      <ScaledPage pageName="about">
        <PageLayout
          companyName={settings.companyName}
          currentPage="about"
          settings={settings}
        >
          <PageUnavailable error={result.error} title="unavailableAbout" />
        </PageLayout>
      </ScaledPage>
    );
  }

  return (
    <ScaledPage pageName="about">
      <PageLayout
        companyName={result.data.settings.companyName}
        currentPage="about"
        settings={result.data.settings}
      >
        <SectionBlocks sections={result.data.page.sections} />
      </PageLayout>
    </ScaledPage>
  );
}
