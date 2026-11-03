import { ArrowDownRight, ArrowUpRight, MoveRight } from 'lucide-react';
import Link from 'next/link';
import type { ProductCategory, SiteProduct, SiteSection } from '../lib/site-types';
import { ScaledImage } from './ScaledImage';
import { ProductMatrix } from './ProductMatrix';
import { SectionLabel } from './SectionLabel';

interface ContentSectionProps {
  section: SiteSection;
  className?: string;
}

// 不同结构化板块使用各自的内容规则与排版类型，且统一支持数据库中的媒体替换。
export function SectionBlocks({
  sections,
  categories,
  products = [],
}: {
  sections: SiteSection[];
  categories?: ProductCategory[];
  products?: SiteProduct[];
}) {
  return (
    <>
      {sections.map((section) => <SectionRenderer categories={categories} key={section.sectionKey} products={products} section={section} />)}
    </>
  );
}

function SectionRenderer({
  section,
  categories = [],
  products,
}: {
  section: SiteSection;
  categories?: ProductCategory[];
  products: SiteProduct[];
}) {
  switch (section.sectionType) {
    case 'hero':
      return <HeroBlock section={section} />;
    case 'editorial':
    case 'engineering':
    case 'craft':
      return <EditorialBlock section={section} />;
    case 'board-showcase':
    case 'principles':
      return <FeatureStripBlock section={section} />;
    case 'workflow':
    case 'timeline':
      return <ProcessBlock section={section} />;
    case 'validation':
      return <ValidationBlock section={section} />;
    case 'applications':
    case 'capabilities':
    case 'disciplines':
      return <CapabilityBlock section={section} />;
    case 'collaboration':
      return <CollaborationBlock section={section} />;
    case 'quote':
      return <QuoteBlock section={section} />;
    case 'closing':
      return <ClosingBlock section={section} />;
    case 'category-overview':
      return <CategoryOverviewBlock categories={categories} section={section} />;
    case 'product-matrix':
      {
        const categorySlug = readText(section.content, 'category');
        const category = categories.find((item) => item.slug === categorySlug);
        if (!category) return <section aria-label={section.title} className="missing-content" data-section-id={section.sectionKey} />;
        const categoryProducts = products.filter((item) => item.categorySlug === category.slug);
        return <ProductMatrix category={category} products={categoryProducts} section={section} />;
      }
    case 'selection-guide':
      return <SelectionGuideBlock section={section} />;
    default:
      return <EditorialBlock section={section} />;
  }
}

function HeroBlock({ section }: ContentSectionProps) {
  const isHome = section.sectionKey.startsWith('H');
  const isProducts = section.sectionKey.startsWith('P');
  const imageClass = isHome ? 'hero-artwork' : 'story-hero-artwork';

  return (
    <section aria-label={section.title} className={`hero-block ${isHome ? 'hero-home' : 'hero-story'}`} data-section-id={section.sectionKey}>
      <div aria-hidden="true" className="hero-circuit-stamp">AE / 01</div>
      {section.media && <div className="hero-image-frame"><ScaledImage className={imageClass} media={section.media} priority sizes="1440px" /></div>}
      <div className="hero-copy">
        <p className="hero-eyebrow"><span className="eyebrow-dot" />{readText(section.content, 'eyebrow') || '硬件工程 / 电路设计 / 开源实践'}</p>
        <h1>{section.title}</h1>
        <p className="hero-subtitle">{section.subtitle}</p>
        <p className="hero-description">{section.description}</p>
        <div className="hero-actions">
          {isProducts
            ? <a className="hero-action-primary" href="#product-catalog">浏览板卡目录 <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.7} /></a>
            : <Link className="hero-action-primary" href="/products">查看产品 <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.7} /></Link>}
          {isHome || isProducts
            ? <Link className="hero-action-quiet" href="/about">了解工程思路 <MoveRight aria-hidden="true" size={18} strokeWidth={1.7} /></Link>
            : <a className="hero-action-quiet" href="#about-methods">阅读工程方法 <MoveRight aria-hidden="true" size={18} strokeWidth={1.7} /></a>}
        </div>
      </div>
      <div aria-hidden="true" className="hero-index">01 <span>/</span> {isProducts ? '13' : '12'}</div>
      <p className="hero-note">{readText(section.content, 'note') || 'DESIGN / CIRCUIT / PRACTICE'}</p>
    </section>
  );
}

function EditorialBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, 'points');

  return (
    <section className={`editorial-block editorial-order-${section.sortOrder % 4}`} data-section-id={section.sectionKey} id={section.sectionKey.startsWith('A02') ? 'about-methods' : undefined}>
      <SectionLabel section={section} showDescription={false} />
      {section.media && (
        <figure className="editorial-figure">
          <div className="editorial-image-frame"><ScaledImage className="editorial-image" media={section.media} /></div>
          <figcaption><span>AE / CIRCUIT NOTE</span><span>{section.media.width} × {section.media.height}</span></figcaption>
        </figure>
      )}
      <div className="editorial-copy">
        {section.subtitle && <p className="editorial-standfirst">{section.subtitle}</p>}
        <p>{section.description}</p>
        {points.length > 0 && <ul className="detail-points">{points.map((point, index) => <li key={`${index}-${point}`}><span>{String(index + 1).padStart(2, '0')}</span>{point}</li>)}</ul>}
      </div>
    </section>
  );
}

function FeatureStripBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, 'points');
  return (
    <section className="feature-strip-block" data-section-id={section.sectionKey}>
      {section.media && <div className="strip-visual"><ScaledImage className="editorial-image" media={section.media} /></div>}
      <div className="strip-reading">
        <SectionLabel section={section} />
        <p className="strip-subtitle">{section.subtitle}</p>
        <ul className="detail-points">{points.map((point, index) => <li key={point}><span>{String(index + 1).padStart(2, '0')}</span>{point}</li>)}</ul>
      </div>
    </section>
  );
}

function ProcessBlock({ section }: ContentSectionProps) {
  const steps = readStringList(section.content, 'steps');
  return (
    <section className="process-block" data-section-id={section.sectionKey}>
      <SectionLabel section={section} className="process-heading" />
      <div className="process-track">
        {steps.map((step, index) => (
          <article className="process-step" key={step}>
            <span className="process-counter">0{index + 1}</span>
            <span aria-hidden="true" className="process-pip" />
            <p>{step}</p>
            <span className="process-connector" />
          </article>
        ))}
      </div>
      <p className="process-footnote">{section.subtitle || '以明确的输入、记录和复查来完成每个工程阶段。'}</p>
    </section>
  );
}

function ValidationBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, 'points');
  return (
    <section className="validation-block" data-section-id={section.sectionKey}>
      <SectionLabel section={section} />
      {section.media && <div className="validation-art"><ScaledImage className="editorial-image" media={section.media} /></div>}
      <p className="validation-subtitle">{section.subtitle}</p>
      <ul className="validation-list">
        {points.map((point, index) => <li key={point}><span className="validation-step">0{index + 1}</span><span>{point}</span><span className="validation-status">检查记录</span></li>)}
      </ul>
    </section>
  );
}

function CapabilityBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, 'points');
  return (
    <section className="capability-block" data-section-id={section.sectionKey}>
      <SectionLabel section={section} />
      {section.media && <div className="capability-art"><ScaledImage className="editorial-image" media={section.media} /></div>}
      <ol className="capability-list">
        {points.map((point, index) => (
          <li key={point}>
            <span className="capability-number">0{index + 1}</span>
            <span className="capability-line" />
            <p>{point}</p>
            <ArrowDownRight aria-hidden="true" size={17} strokeWidth={1.7} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function CollaborationBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, 'points');
  const steps = readStringList(section.content, 'steps');
  const items = points.length > 0 ? points : steps;
  return (
    <section className="collaboration-block" data-section-id={section.sectionKey}>
      <SectionLabel section={section} />
      <div className="collaboration-copy">
        <p className="collaboration-subtitle">{section.subtitle}</p>
        <ol className="collaboration-steps">
          {items.map((item, index) => <li key={item}><span>0{index + 1}</span><span>{item}</span><MoveRight aria-hidden="true" size={15} /></li>)}
        </ol>
        <small>{readText(section.content, 'status') || '内容为工程方法示例，不代表商业服务承诺。'}</small>
      </div>
    </section>
  );
}

function QuoteBlock({ section }: ContentSectionProps) {
  return (
    <section className="quote-block" data-section-id={section.sectionKey}>
      <span className="quote-mark" aria-hidden="true">“</span>
      <div className="quote-copy">
        <p>{section.subtitle}</p>
        <p>{section.description}</p>
      </div>
      <span className="quote-reference">ENGINEERING NOTE / {String(section.sortOrder).padStart(2, '0')}</span>
    </section>
  );
}

function ClosingBlock({ section }: ContentSectionProps) {
  const links = readStringList(section.content, 'links');
  const primary = links.includes('products') ? '/products' : '/about';
  const secondary = primary === '/products' ? '/about' : '/products';
  const primaryText = primary === '/products' ? '探索产品目录' : '继续阅读企业介绍';
  const secondaryText = secondary === '/about' ? '了解工程方法' : '查看硬件示例';

  return (
    <section className="closing-block" data-section-id={section.sectionKey}>
      <div className="closing-topline"><span>下一个工程问题</span><ArrowDownRight aria-hidden="true" size={20} /></div>
      <h2>{section.title}</h2>
      <p>{section.description}</p>
      <Link className="closing-primary" href={primary}>{primaryText}<ArrowUpRight aria-hidden="true" size={18} /></Link>
      <Link className="closing-secondary" href={secondary}>{secondaryText}<MoveRight aria-hidden="true" size={17} /></Link>
    </section>
  );
}

function CategoryOverviewBlock({ categories, section }: { categories: ProductCategory[]; section: SiteSection }) {
  return (
    <section className="category-overview-block" data-section-id={section.sectionKey} id="product-catalog">
      <SectionLabel section={section} />
      <div className="category-index">
        {categories.map((category) => (
          <a className="category-index-row" href={`#catalog-${category.slug}`} key={category.slug}>
            <span className="category-index-number">{String(category.sortOrder).padStart(2, '0')}</span>
            <span className="category-index-title">{category.name}</span>
            <span className="category-index-description">{category.description}</span>
            <ArrowDownRight aria-hidden="true" size={17} strokeWidth={1.7} />
          </a>
        ))}
      </div>
    </section>
  );
}

function SelectionGuideBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, 'points');
  return (
    <section className="selection-block" data-section-id={section.sectionKey}>
      <div className="selection-head"><SectionLabel section={section} /><p>{section.subtitle}</p></div>
      <ol className="selection-list">
        {points.map((point, index) => <li key={point}><span>0{index + 1}</span><p>{point}</p><ArrowUpRight aria-hidden="true" size={15} /></li>)}
      </ol>
    </section>
  );
}

function readText(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === 'string' ? value : '';
}

function readStringList(content: Record<string, unknown>, key: string): string[] {
  const value = content[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
