"use client";
import { ManagedIcon } from "./ManagedIcon";
import { useSiteContent } from "./ContentProvider";
import type { CSSProperties } from "react";
import { textList } from "../../shared/content";
import Link from "next/link";
import type {
  ProductCategory,
  SiteProduct,
  SiteSection,
} from "../lib/site-types";
import { ScaledImage } from "./ScaledImage";
import { ProductMatrix } from "./ProductMatrix";
import { SectionLabel } from "./SectionLabel";

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
      {sections.map((section) => (
        <ManagedSection key={section.sectionKey} section={section}>
          <SectionRenderer
            categories={categories}
            products={products}
            section={section}
          />
        </ManagedSection>
      ))}
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
    case "hero":
      return <HeroBlock section={section} />;
    case "editorial":
    case "engineering":
    case "craft":
      return <EditorialBlock section={section} />;
    case "board-showcase":
    case "principles":
      return <FeatureStripBlock section={section} />;
    case "workflow":
    case "timeline":
      return <ProcessBlock section={section} />;
    case "validation":
      return <ValidationBlock section={section} />;
    case "applications":
    case "capabilities":
    case "disciplines":
      return <CapabilityBlock section={section} />;
    case "collaboration":
      return <CollaborationBlock section={section} />;
    case "quote":
      return <QuoteBlock section={section} />;
    case "closing":
      return <ClosingBlock section={section} />;
    case "category-overview":
      return (
        <CategoryOverviewBlock categories={categories} section={section} />
      );
    case "product-matrix": {
      const category = categories.find(
        (item) => item.id === section.categoryId,
      );
      if (!category)
        return (
          <section
            aria-label={section.title}
            className="missing-content"
            data-section-id={section.sectionKey}
          />
        );
      const categoryProducts = products.filter(
        (item) => item.categorySlug === category.slug,
      );
      return (
        <ProductMatrix
          category={category}
          products={categoryProducts}
          section={section}
        />
      );
    }
    case "selection-guide":
      return <SelectionGuideBlock section={section} />;
    default:
      return <EditorialBlock section={section} />;
  }
}

function HeroBlock({ section }: ContentSectionProps) {
  const isHome = section.sectionKey.startsWith("H");
  const imageClass = isHome ? "hero-artwork" : "story-hero-artwork";

  return (
    <section
      aria-label={section.title}
      className={`hero-block ${isHome ? "hero-home" : "hero-story"}`}
      data-section-id={section.sectionKey}
    >
      <div aria-hidden="true" className="hero-circuit-stamp">
        {readText(section.content, "stamp")}
      </div>
      {section.media && (
        <div className="hero-image-frame">
          <ScaledImage
            className={imageClass}
            media={section.media}
            priority
            sizes="1440px"
          />
        </div>
      )}
      <div className="hero-copy">
        <span className="managed-detail-label">
          {readText(section.content, "label")}
        </span>
        <p className="hero-eyebrow">
          <span className="eyebrow-dot" />
          {readText(section.content, "eyebrow")}
        </p>
        <h1>{section.title}</h1>
        <p className="hero-subtitle">{section.subtitle}</p>
        <p className="hero-description">{section.description}</p>
        <div className="hero-actions">
          <Link
            className="hero-action-primary"
            href={readText(section.content, "primaryHref")}
          >
            {readText(section.content, "primaryText")}
            <ManagedIcon
              name={readText(section.content, "primaryIcon")}
              aria-hidden
            />
          </Link>
          <Link
            className="hero-action-quiet"
            href={readText(section.content, "secondaryHref")}
          >
            {readText(section.content, "secondaryText")}
            <ManagedIcon
              name={readText(section.content, "secondaryIcon")}
              aria-hidden
            />
          </Link>
        </div>
      </div>
      <div aria-hidden="true" className="hero-index">
        {String(section.sortOrder).padStart(2, "0")}
      </div>
      <p className="hero-note">{readText(section.content, "note")}</p>
    </section>
  );
}

function EditorialBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, "points");

  return (
    <section
      className={`editorial-block editorial-order-${section.sortOrder % 4}`}
      data-section-id={section.sectionKey}
      id={section.sectionKey.startsWith("A02") ? "about-methods" : undefined}
    >
      <SectionLabel section={section} showDescription={false} />
      {section.media && (
        <figure className="editorial-figure">
          <div className="editorial-image-frame">
            <ScaledImage className="editorial-image" media={section.media} />
          </div>
          <figcaption>
            <span>{readText(section.content, "imageCaption")}</span>
            <span>
              {section.media.caption ||
                `${section.media.width} × ${section.media.height}`}
            </span>
          </figcaption>
        </figure>
      )}
      <div className="editorial-copy">
        {section.subtitle && (
          <p className="editorial-standfirst">{section.subtitle}</p>
        )}
        <p>{section.description}</p>
        {points.length > 0 && (
          <ul className="detail-points">
            {points.map((point, index) => (
              <li key={`${index}-${point}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {point}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FeatureStripBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, "points");
  return (
    <section
      className="feature-strip-block"
      data-section-id={section.sectionKey}
    >
      {section.media && (
        <div className="strip-visual">
          <ScaledImage className="editorial-image" media={section.media} />
        </div>
      )}
      <div className="strip-reading">
        <SectionLabel section={section} />
        <p className="strip-subtitle">{section.subtitle}</p>
        <ul className="detail-points">
          {points.map((point, index) => (
            <li key={point}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ProcessBlock({ section }: ContentSectionProps) {
  const steps = readStringList(section.content, "steps");
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
      <p className="process-footnote">{section.subtitle}</p>
    </section>
  );
}

function ValidationBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, "points");
  return (
    <section className="validation-block" data-section-id={section.sectionKey}>
      <SectionLabel section={section} />
      {section.media && (
        <div className="validation-art">
          <ScaledImage className="editorial-image" media={section.media} />
        </div>
      )}
      <p className="validation-subtitle">{section.subtitle}</p>
      <ul className="validation-list">
        {points.map((point, index) => (
          <li key={`${index}-${point}`}>
            <span className="validation-step">0{index + 1}</span>
            <span>{point}</span>
            <span className="validation-status">
              {readText(section.content, "validationStatus")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CapabilityBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, "points");
  return (
    <section className="capability-block" data-section-id={section.sectionKey}>
      <SectionLabel section={section} />
      {section.subtitle && <p className="section-deck">{section.subtitle}</p>}
      {section.media && (
        <div className="capability-art">
          <ScaledImage className="editorial-image" media={section.media} />
        </div>
      )}
      <ol className="capability-list">
        {points.map((point, index) => (
          <li key={point}>
            <span className="capability-number">0{index + 1}</span>
            <span className="capability-line" />
            <p>{point}</p>
            <ManagedIcon
              name={readText(section.content, "arrowIcon")}
              aria-hidden
              size={17}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function CollaborationBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, "points");
  const steps = readStringList(section.content, "steps");
  const items = [...points, ...steps];
  return (
    <section
      className="collaboration-block"
      data-section-id={section.sectionKey}
    >
      <SectionLabel section={section} />
      <div className="collaboration-copy">
        <p className="collaboration-subtitle">{section.subtitle}</p>
        <ol className="collaboration-steps">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>
              <span>0{index + 1}</span>
              <span>{item}</span>
              <ManagedIcon
                name={readText(section.content, "arrowIcon")}
                aria-hidden
                size={15}
              />
            </li>
          ))}
        </ol>
        <small>{readText(section.content, "status")}</small>
      </div>
    </section>
  );
}

function QuoteBlock({ section }: ContentSectionProps) {
  return (
    <section className="quote-block" data-section-id={section.sectionKey}>
      <span className="quote-mark" aria-hidden="true">
        “
      </span>
      <div className="quote-copy">
        <span className="managed-detail-label">
          {readText(section.content, "label")}
        </span>
        <h2>{section.title}</h2>
        <p>{section.subtitle}</p>
        <p>{section.description}</p>
        <small>{readText(section.content, "note")}</small>
      </div>
      <span className="quote-reference">
        {readText(section.content, "quoteReference")} /{" "}
        {String(section.sortOrder).padStart(2, "0")}
      </span>
    </section>
  );
}

function ClosingBlock({ section }: ContentSectionProps) {
  const primary = readText(section.content, "primaryHref");
  const secondary = readText(section.content, "secondaryHref");
  const primaryText = readText(section.content, "primaryText");
  const secondaryText = readText(section.content, "secondaryText");

  return (
    <section className="closing-block" data-section-id={section.sectionKey}>
      <div className="closing-topline">
        <span>{readText(section.content, "closingLabel")}</span>
        <ManagedIcon
          name={readText(section.content, "arrowIcon")}
          aria-hidden
          size={20}
        />
      </div>
      <div className="closing-heading">
        <span className="managed-detail-label">
          {readText(section.content, "label")}
        </span>
        <h2>{section.title}</h2>
        {section.subtitle && (
          <p className="closing-subtitle">{section.subtitle}</p>
        )}
      </div>
      <div className="closing-copy">
        <p>{section.description}</p>
        <Link className="closing-primary" href={primary}>
          {primaryText}
          <ManagedIcon
            name={readText(section.content, "primaryIcon")}
            aria-hidden
          />
        </Link>
        <Link className="closing-secondary" href={secondary}>
          {secondaryText}
          <ManagedIcon
            name={readText(section.content, "secondaryIcon")}
            aria-hidden
          />
        </Link>
      </div>
    </section>
  );
}

function CategoryOverviewBlock({
  categories,
  section,
}: {
  categories: ProductCategory[];
  section: SiteSection;
}) {
  return (
    <section
      className="category-overview-block"
      data-section-id={section.sectionKey}
      id="product-catalog"
    >
      <SectionLabel section={section} />
      {section.subtitle && <p>{section.subtitle}</p>}
      <div className="category-index">
        {categories.map((category) => (
          <a
            className="category-index-row"
            href={`#catalog-${category.slug}`}
            key={category.slug}
          >
            <span className="category-index-number">
              {String(category.sortOrder).padStart(2, "0")}
            </span>
            <span className="category-index-title">
              {category.icon && (
                <ManagedIcon name={category.icon} size={17} aria-hidden />
              )}
              {category.media && (
                <span className="category-thumb">
                  <ScaledImage media={category.media} />
                </span>
              )}
              {category.name}
            </span>
            <span className="category-index-description">
              {category.description}
            </span>
            <ManagedIcon
              name={readText(section.content, "arrowIcon")}
              aria-hidden
              size={17}
            />
          </a>
        ))}
      </div>
    </section>
  );
}

function SelectionGuideBlock({ section }: ContentSectionProps) {
  const points = readStringList(section.content, "points");
  return (
    <section className="selection-block" data-section-id={section.sectionKey}>
      <div className="selection-head">
        <SectionLabel section={section} />
        <p>{section.subtitle}</p>
      </div>
      <ol className="selection-list">
        {points.map((point, index) => (
          <li key={`${index}-${point}`}>
            <span>0{index + 1}</span>
            <p>{point}</p>
            <ManagedIcon
              name={readText(section.content, "arrowIcon")}
              aria-hidden
              size={15}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function readText(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === "string" ? value : "";
}

function readStringList(
  content: Record<string, unknown>,
  key: string,
): string[] {
  return textList(content[key]);
}

function ManagedSection({
  section,
  children,
}: {
  section: SiteSection;
  children: React.ReactNode;
}) {
  const { settings } = useSiteContent();
  const media = settings.media?.find(
    (m) => m.id === section.content.backgroundMedia,
  );
  const background = String(section.content.background ?? "");
  const inlineMedia = [
    "hero",
    "editorial",
    "engineering",
    "craft",
    "board-showcase",
    "principles",
    "validation",
    "applications",
    "capabilities",
    "disciplines",
  ].includes(section.sectionType);
  return (
    <div
      className="managed-section"
      data-style={String(section.content.style ?? "default")}
      data-has-bg={Boolean(background || media)}
      style={
        {
          background: background || undefined,
          backgroundImage: media ? `url(${media.url})` : undefined,
          backgroundSize: "cover",
          "--managed-image-fit": String(section.content.imageFit ?? "contain"),
          "--managed-image-position": String(
            section.content.imagePosition ?? "center",
          ),
        } as CSSProperties
      }
    >
      {!inlineMedia && section.media && (
        <figure className="managed-extra-image">
          <ScaledImage media={section.media} />
          {section.media.caption && (
            <figcaption>{section.media.caption}</figcaption>
          )}
        </figure>
      )}
      {children}
    </div>
  );
}
