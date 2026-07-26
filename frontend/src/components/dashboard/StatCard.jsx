import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { EmptyStateHint } from './EmptyStateHint';

function AnimatedNumber({ value }) {
  const isNumber = typeof value === 'number' && !isNaN(value);
  const spring = useSpring(0, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (current) => Math.round(current));
  const [currentVal, setCurrentVal] = useState(isNumber ? value : 0);

  useEffect(() => {
    if (isNumber) {
      spring.set(value);
      const unsubscribe = display.on("change", (latest) => setCurrentVal(latest));
      return () => unsubscribe();
    }
  }, [value, isNumber]);

  if (!isNumber) return <span>{value}</span>;
  return <motion.span className="tabular-nums">{currentVal}</motion.span>;
}

export function StatCard({
  title,
  value,
  suffix = '',
  icon: Icon,
  variant = 'default',
  trend,
  trendLabel,
  hint,
  hintActionLabel,
  onHintAction,
  iconColorClass = 'text-tf-text-secondary',
  className
}) {
  const isHero = variant === 'hero';
  const isZero = value === 0 || value === '0' || value === '0%';

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className={twMerge(
        "rounded-xl border border-tf-border bg-tf-surface p-4 flex flex-col justify-between transition-shadow shadow-sm hover:shadow-md select-none",
        isHero && "p-5 bg-tf-surface border-tf-border-strong relative overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-tf-text-tertiary">
          {title}
        </span>
        {Icon && (
          <div className={twMerge("w-8 h-8 rounded-md flex items-center justify-center bg-tf-surface-2 shrink-0 border border-tf-border", iconColorClass)}>
            <Icon size={18} strokeWidth={1.75} />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className={twMerge("font-semibold tracking-tight text-tf-text flex items-baseline gap-1", isHero ? "text-3xl" : "text-2xl")}>
          <AnimatedNumber value={value} />
          {suffix && <span className="text-base font-normal text-tf-text-secondary">{suffix}</span>}
        </div>

        {trend != null && (
          <div className="mt-1.5 flex items-center gap-1 text-xs font-medium">
            {trend >= 0 ? (
              <span className="inline-flex items-center gap-0.5 text-tf-success">
                <TrendingUp size={14} />
                <span>+{trend}%</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-tf-danger">
                <TrendingDown size={14} />
                <span>{trend}%</span>
              </span>
            )}
            {trendLabel && <span className="text-tf-text-tertiary font-normal">{trendLabel}</span>}
          </div>
        )}

        {isZero && hint ? (
          <div className="mt-2 pt-2 border-t border-tf-border">
            <EmptyStateHint message={hint} actionLabel={hintActionLabel} onAction={onHintAction} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
