"use client";

import { ManagedIcon } from "./ManagedIcon";
import { useSiteContent } from "./ContentProvider";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type {
  ProductCategory,
  SiteProduct,
  SiteSection,
} from "../lib/site-types";
import { ScaledImage } from "./ScaledImage";
import { SectionLabel } from "./SectionLabel";

interface ProductMatrixProps {
  category: ProductCategory;
  products: SiteProduct[];
  section: SiteSection;
}

interface DialogFrame {
  height: number;
  top: number;
}

// 图片、文字与同页原生键盘弹窗始终对应一条唯一的 MySQL 示例产品记录。
export function ProductMatrix({
  category,
  products,
  section,
}: ProductMatrixProps) {
  const { copy } = useSiteContent();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [activeProduct, setActiveProduct] = useState<SiteProduct | null>(null);
  const [dialogFrame, setDialogFrame] = useState<DialogFrame>({
    height: 900,
    top: 0,
  });

  useLayoutEffect(() => {
    if (!activeProduct) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = "hidden";
    dialogRef.current
      ?.querySelector<HTMLElement>('[data-dialog-initial-focus="true"]')
      ?.focus();

    return () => {
      document.documentElement.style.overflowY = previousOverflow;
      previousFocus?.focus();
    };
  }, [activeProduct]);

  const handleDialogKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveProduct(null);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openProduct = (product: SiteProduct): void => {
    const shell = document.querySelector<HTMLElement>(
      '[data-scaled-layout="1440"]',
    );
    const pageScale = Number(shell?.getAttribute("data-scale-factor"));
    const safeScale =
      Number.isFinite(pageScale) && pageScale > 0 ? pageScale : 1;
    setDialogFrame({
      height: window.innerHeight / safeScale,
      top: window.scrollY / safeScale,
    });
    setActiveProduct(product);
  };

  return (
    <section
      aria-labelledby={`catalog-title-${category.slug}`}
      className="product-category-section"
      data-category={category.slug}
      data-product-count={products.length}
      data-section-id={section.sectionKey}
      id={`catalog-${category.slug}`}
    >
      <header className="product-category-header">
        <SectionLabel
          section={section}
          titleId={`catalog-title-${category.slug}`}
        />
        <div className="category-count">
          <span>{copy("productCountLabel")}</span>
          <span>{String(products.length).padStart(2, "0")}</span>
        </div>
      </header>

      <p className="category-context">{category.description}</p>
      {section.subtitle && (
        <p className="category-context">{section.subtitle}</p>
      )}
      {Boolean(section.content.note) && (
        <p className="category-context">{String(section.content.note)}</p>
      )}

      {!products.length && <p>{copy("emptyProducts")}</p>}
      <div
        aria-label={copy("productGridLabel").replace("{name}", category.name)}
        className="product-grid"
      >
        {products.map((product, index) => (
          <button
            aria-haspopup="dialog"
            aria-label={copy("openProductLabel").replace(
              "{name}",
              product.name,
            )}
            className="product-tile"
            data-product-slug={product.slug}
            key={product.slug}
            onClick={() => openProduct(product)}
            type="button"
          >
            <span className="product-image-frame">
              <ScaledImage media={product.media} sizes="224px" />
            </span>
            <span className="product-tile-copy">
              <span className="product-tile-index">
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(products.length).padStart(2, "0")}
              </span>
              <span className="product-tile-title">{product.name}</span>
              <span className="product-tile-summary">{product.subtitle}</span>
              <ManagedIcon
                name={copy("productArrowIcon")}
                aria-hidden
                className="product-tile-arrow"
                size={16}
              />
            </span>
          </button>
        ))}
      </div>

      {activeProduct && (
        <div
          className="product-dialog-scrim"
          style={{
            height: `${dialogFrame.height}px`,
            top: `${dialogFrame.top}px`,
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setActiveProduct(null);
          }}
        >
          <div
            aria-labelledby="product-dialog-title"
            aria-modal="true"
            className="product-dialog"
            data-product-detail={activeProduct.slug}
            onKeyDown={handleDialogKeys}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="product-dialog-visual">
              <ScaledImage media={activeProduct.media} priority sizes="360px" />
              <span className="dialog-image-caption">
                {activeProduct.categoryName} / {copy("dialogCaption")}
              </span>
            </div>
            <div className="product-dialog-copy">
              <div className="dialog-topline">
                <span>
                  {copy("dialogReference")} /{" "}
                  {String(activeProduct.sortOrder).padStart(2, "0")}
                </span>
                <button
                  aria-label={copy("closeProductLabel")}
                  className="dialog-close"
                  data-dialog-initial-focus="true"
                  onClick={() => setActiveProduct(null)}
                  type="button"
                >
                  <ManagedIcon name={copy("closeIcon")} aria-hidden size={20} />
                </button>
              </div>
              <p className="dialog-category">
                {activeProduct.categoryName}
                {activeProduct.isDemo ? ` · ${copy("demoProductLabel")}` : ""}
              </p>
              <h2 id="product-dialog-title">{activeProduct.name}</h2>
              {activeProduct.model && <p>{activeProduct.model}</p>}
              {activeProduct.icon && (
                <ManagedIcon name={activeProduct.icon} size={24} aria-hidden />
              )}
              <p className="dialog-subtitle">{activeProduct.subtitle}</p>
              <p className="dialog-description">{activeProduct.description}</p>
              <div className="dialog-feature-group">
                <h3>{copy("featuresTitle")}</h3>
                <ul>
                  {activeProduct.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className="dialog-specifications">
                <h3>{copy("specificationsTitle")}</h3>
                <div>
                  {activeProduct.specifications.map((specification) => (
                    <span key={specification}>{specification}</span>
                  ))}
                </div>
              </div>
              {!!activeProduct.tags?.length && (
                <div className="product-tags">
                  {activeProduct.tags.map((tag, index) => (
                    <span key={`${index}-${tag}`}>{tag}</span>
                  ))}
                </div>
              )}
              {!!activeProduct.gallery?.length && (
                <div className="product-gallery">
                  {activeProduct.gallery.map((media, index) => (
                    <div key={`${index}-${media.id}`}>
                      <ScaledImage media={media} />
                    </div>
                  ))}
                </div>
              )}
              {activeProduct.isDemo && (
                <p className="dialog-demo-note">{copy("demoNote")}</p>
              )}
              <span aria-hidden="true" className="dialog-index">
                <ManagedIcon name={copy("dialogIcon")} size={19} />
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
