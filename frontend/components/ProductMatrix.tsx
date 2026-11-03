'use client';

import { ArrowUpRight, ChevronRight, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ProductCategory, SiteProduct, SiteSection } from '../lib/site-types';
import { ScaledImage } from './ScaledImage';
import { SectionLabel } from './SectionLabel';

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
export function ProductMatrix({ category, products, section }: ProductMatrixProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [activeProduct, setActiveProduct] = useState<SiteProduct | null>(null);
  const [dialogFrame, setDialogFrame] = useState<DialogFrame>({ height: 900, top: 0 });

  useLayoutEffect(() => {
    if (!activeProduct) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('[data-dialog-initial-focus="true"]')?.focus();

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [activeProduct]);

  const handleDialogKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveProduct(null);
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
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
    const shell = document.querySelector<HTMLElement>('[data-scaled-layout="1440"]');
    const pageScale = Number(shell?.getAttribute('data-scale-factor'));
    const safeScale = Number.isFinite(pageScale) && pageScale > 0 ? pageScale : 1;
    setDialogFrame({ height: window.innerHeight / safeScale, top: window.scrollY / safeScale });
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
        <SectionLabel section={section} titleId={`catalog-title-${category.slug}`} />
        <div className="category-count"><span>产品样例</span><span>{String(products.length).padStart(2, '0')}</span></div>
      </header>

      <p className="category-context">{category.description}</p>

      <div aria-label={`${category.name}产品`} className="product-grid">
        {products.map((product, index) => (
          <button
            aria-haspopup="dialog"
            aria-label={`打开 ${product.name} 产品说明`}
            className="product-tile"
            data-product-slug={product.slug}
            key={product.slug}
            onClick={() => openProduct(product)}
            type="button"
          >
            <span className="product-image-frame"><ScaledImage media={product.media} sizes="224px" /></span>
            <span className="product-tile-copy">
              <span className="product-tile-index">{String(index + 1).padStart(2, '0')} / 05</span>
              <span className="product-tile-title">{product.name}</span>
              <span className="product-tile-summary">{product.subtitle}</span>
              <ChevronRight aria-hidden="true" className="product-tile-arrow" size={16} strokeWidth={1.8} />
            </span>
          </button>
        ))}
      </div>

      {activeProduct && (
        <div
          className="product-dialog-scrim"
          style={{ height: `${dialogFrame.height}px`, top: `${dialogFrame.top}px` }}
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
              <span className="dialog-image-caption">{activeProduct.categoryName} / 硬件示例</span>
            </div>
            <div className="product-dialog-copy">
              <div className="dialog-topline">
                <span>HARDWARE REFERENCE / {String(activeProduct.sortOrder).padStart(2, '0')}</span>
                <button
                  aria-label="关闭产品说明"
                  className="dialog-close"
                  data-dialog-initial-focus="true"
                  onClick={() => setActiveProduct(null)}
                  type="button"
                >
                  <X aria-hidden="true" size={20} strokeWidth={1.8} />
                </button>
              </div>
              <p className="dialog-category">{activeProduct.categoryName} · 示例产品</p>
              <h2 id="product-dialog-title">{activeProduct.name}</h2>
              <p className="dialog-subtitle">{activeProduct.subtitle}</p>
              <p className="dialog-description">{activeProduct.description}</p>
              <div className="dialog-feature-group">
                <h3>板卡方向</h3>
                <ul>
                  {activeProduct.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              </div>
              <div className="dialog-specifications">
                <h3>接口与结构</h3>
                <div>{activeProduct.specifications.map((specification) => <span key={specification}>{specification}</span>)}</div>
              </div>
              <p className="dialog-demo-note">此板卡为技术外观示例，不表示已量产或正式销售。</p>
              <span aria-hidden="true" className="dialog-index"><ArrowUpRight size={19} strokeWidth={1.7} /></span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
