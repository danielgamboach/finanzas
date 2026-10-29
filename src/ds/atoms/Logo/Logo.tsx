import React from 'react';
import './Logo.css';

/**
 * Kai Finance: the mark (same file as the favicon, /icon.svg) and, unless `markOnly`, the name beside it:
 * "Kai" bold and the product ("Finance") light. Kai will have other products later; `product` swaps the second word.
 */
export function Logo({ size = 'md', markOnly, product = 'Finance', className }: { size?: 'sm' | 'md' | 'lg'; markOnly?: boolean; product?: string; className?: string }) {
  const px = size === 'sm' ? 20 : size === 'lg' ? 40 : 28;
  return (
    <span className={['ds-logo', `ds-logo--${size}`, className].filter(Boolean).join(' ')} role="img" aria-label={`Kai ${product}`}>
      <img className="ds-logo__mark" src="/icon.svg" alt="" width={px} height={px} aria-hidden="true" />
      {!markOnly && (
        <span className="ds-logo__name" aria-hidden="true">
          <span className="ds-logo__kai">Kai</span> <span className="ds-logo__product">{product}</span>
        </span>
      )}
    </span>
  );
}
