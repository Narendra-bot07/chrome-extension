import React, { memo } from 'react';

/**
 * BrandLogo Component
 * Renders the official Tailr4U Logo [Logo Image] + [Brand Wordmark]
 * 
 * Features:
 * - Application logo image (raccoon mark) on the left
 * - 3D Tailr4U wordmark text on the right (Navy Tailr, Electric Blue 4, Vibrant Orange U)
 * - Responsive size presets (xs, sm, md, lg, xl, 2xl) or custom numeric size
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
          className="w-full h-full object-contain filter drop-shadow-xs"
        />
      </span>
    );
  }

  return (
    <div 
      className={`inline-flex items-center gap-2.5 font-black tracking-[-0.04em] select-none font-sans ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {/* 1. LOGO ICON IMAGE */}
      {showIcon && (
        <img 
          src={logoSrc} 
          alt="Tailr4U Logo" 
          className="object-contain shrink-0 filter drop-shadow-xs"
          style={{ width: `${currentSize.iconSize}px`, height: `${currentSize.iconSize}px` }}
        />
      )}

      {/* 2. BRAND NAME WORDMARK */}
      {variant !== 'icon' && (
        <span 
          className="inline-flex items-baseline filter drop-shadow-[0_3px_5px_rgba(15,23,42,0.12)]"
          style={{ fontSize: currentSize.fontSize, lineHeight: 1 }}
        >
          {/* 'T' with Top-Left Electric Blue Accent Notch */}
          <span className="relative inline-flex items-baseline text-slate-900 dark:text-slate-100">
            <span className="relative">
              <span 
                className="absolute -top-[0.08em] -left-[0.08em] w-[0.35em] h-[0.35em] bg-blue-500 rounded-tl-sm rounded-tr-md rounded-bl-sm shadow-[0_2px_4px_rgba(37,99,235,0.4)]"
              />
              T
            </span>
            <span>ailr</span>
          </span>

          {/* '4' in Electric Blue */}
          <span className="text-blue-600 dark:text-blue-500 ml-[0.01em] filter drop-shadow-[0_2px_4px_rgba(37,99,235,0.3)]">
            4
          </span>

          {/* 'U' in Vibrant Orange */}
          <span className="text-orange-500 dark:text-orange-400 ml-[0.01em] filter drop-shadow-[0_2px_4px_rgba(249,115,22,0.3)]">
            U
          </span>
        </span>
      )}
    </div>
  );
});

export default BrandLogo;
