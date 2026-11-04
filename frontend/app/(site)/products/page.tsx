import type { Metadata } from 'next';
import { PageLayout } from '../../../components/PageLayout';
import { PageUnavailable } from '../../../components/PageUnavailable';
import { ScaledPage } from '../../../components/ScaledPage';
import { SectionBlocks } from '../../../components/SectionBlocks';
import { fetchSitePage, makePageMetadata } from '../../../lib/site-data';
import { fallbackSettings } from '../../../lib/site-fallback';

// 产品分类、四十五张主图与详情按钮共用同一个独立数据库响应。
export async function generateMetadata(): Promise<Metadata> {
  return makePageMetadata('products');
}

export default async function ProductsPage() {
  const result = await fetchSitePage('products');
  if (!result.ok) {
    const settings = await fallbackSettings();
    return (
      <ScaledPage pageName="products">
        <PageLayout
          companyName={settings.companyName}
          currentPage="products"
          settings={settings}
        >
          <PageUnavailable error={result.error} title="unavailableProducts" />
        </PageLayout>
      </ScaledPage>
    );
  }

  return (
    <ScaledPage pageName="products">
      <PageLayout
        companyName={result.data.settings.companyName}
        currentPage="products"
        settings={result.data.settings}
      >
        <SectionBlocks
          categories={result.data.categories}
          products={result.data.products}
          sections={result.data.page.sections}
        />
      </PageLayout>
    </ScaledPage>
  );
}
