import React, { memo } from 'react';

/**
 * BrandLogo Component
 * Renders the official Tailr4U Logo:
 * - Application logo image (raccoon mark) on the left
 * - Tailr4U wordmark on the right (Dark Navy/White 'Tailr' with top-right floating Electric Blue accent on 'T', Electric Blue '4', Electric Blue 'U')
 */
export const BrandLogo = memo(function BrandLogo({
  size = 'md', // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number
  variant = 'full', // 'full' | 'icon' | 'wordmark'
  showIcon = true,
  className = '',
  onClick
}) {
  const sizeMap = {
    xs: { fontSize: '1.125rem', iconSize: 22 },
    sm: { fontSize: '1.375rem', iconSize: 28 },
    md: { fontSize: '1.75rem', iconSize: 34 },
    lg: { fontSize: '2.25rem', iconSize: 44 },
    xl: { fontSize: '3.25rem', iconSize: 60 },
    '2xl': { fontSize: '4.25rem', iconSize: 76 }
  };

  const currentSize = typeof size === 'number'
    ? { fontSize: `${Math.round(size * 0.75)}px`, iconSize: size }
    : (sizeMap[size] || sizeMap.md);

  const logoSrc = `${import.meta.env.BASE_URL || '/'}application-logo.png`;

  if (variant === 'icon') {
    return (
      <span 
        className={`inline-flex items-center justify-center shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
        style={{ width: `${currentSize.iconSize}px`, height: `${currentSize.iconSize}px` }}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
      >
        <img
          src={logoSrc}
          alt="Tailr4U Logo"
          width={currentSize.iconSize}
          height={currentSize.iconSize}
          decoding="async"
          className="w-full h-full object-contain filter drop-shadow-xs"
        />
      </span>
    );
  }

  return (
    <div 
      className={`inline-flex items-center gap-2.5 select-none font-sans shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {/* 1. LOGO ICON IMAGE */}
      {showIcon && (
        <img
          src={logoSrc}
          alt="Tailr4U Logo"
          width={currentSize.iconSize}
          height={currentSize.iconSize}
          decoding="async"
          className="object-contain shrink-0 filter drop-shadow-xs"
          style={{ width: `${currentSize.iconSize}px`, height: `${currentSize.iconSize}px` }}
        />
      )}

      {/* 2. BRAND NAME WORDMARK */}
      {variant !== 'icon' && (
        <span 
          className="inline-flex items-baseline font-black tracking-[-0.04em] leading-none shrink-0 filter drop-shadow-[0_2px_4px_rgba(15,23,42,0.12)]"
          style={{ fontSize: currentSize.fontSize, lineHeight: 1 }}
        >
          {/* 'T' with Top-Right Floating Blue Accent Notch */}
          <span className="relative inline-flex items-baseline text-slate-900 dark:text-slate-100 mr-[0.18em]">
            <span className="relative inline-block font-black">
              T
              {/* Floating Blue Accent Badge to the top-right of T */}
              <span 
                className="absolute -top-[0.16em] -right-[0.38em] w-[0.42em] h-[0.28em] bg-blue-500 rounded-tr-lg rounded-tl-xs rounded-br-xs rounded-bl-sm shadow-[0_2px_4px_rgba(37,99,235,0.4)] pointer-events-none"
              />
            </span>
            <span>ailr</span>
          </span>

          {/* '4' in Electric Blue */}
          <span className="text-blue-600 dark:text-blue-500 font-black ml-[0.01em] filter drop-shadow-[0_2px_4px_rgba(37,99,235,0.3)]">
            4
          </span>

          {/* 'U' in Electric Blue */}
          <span className="text-blue-600 dark:text-blue-500 font-black ml-[0.01em] filter drop-shadow-[0_2px_4px_rgba(37,99,235,0.3)]">
            U
          </span>
        </span>
      )}
    </div>
  );
});

export default BrandLogo;
