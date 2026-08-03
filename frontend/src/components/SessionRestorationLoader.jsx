import React from 'react';
import { motion } from 'framer-motion';
import { BrandLogo } from './BrandLogo';

export default function SessionRestorationLoader({
  label = "Restoring Session & User Profile...",
  sublabel = "Syncing workspace credentials & preferences",
  minHeight = "min-h-[480px]"
}) {
  return (
    <div className={`w-full ${minHeight} flex flex-col items-center justify-center p-6 relative overflow-hidden select-none font-sans bg-transparent`}>
      {/* Ambient Background Aura */}
      <div className="absolute w-72 h-72 bg-[#00bda5]/15 rounded-full blur-3xl -top-10 -left-10 pointer-events-none animate-pulse" />
      <div className="absolute w-72 h-72 bg-blue-500/10 rounded-full blur-3xl -bottom-10 -right-10 pointer-events-none animate-pulse" />

      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xs flex flex-col items-center text-center relative z-10"
      >
        {/* Animated Icon Ring */}
        <div className="relative mb-6">
          {/* Radar Ring */}
          <motion.div
            animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#00bda5] via-blue-500 to-orange-500 blur-md opacity-30"
          />

          {/* Rotating Conic Border */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#00bda5] via-blue-500 to-amber-500 opacity-70 p-[1.5px]"
          />

          {/* Logo Card */}
          <div className="relative p-3 rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800 shadow-2xl flex items-center justify-center">
            <BrandLogo size={44} variant="icon" />
          </div>
        </div>

        {/* Shimmering Loading Bar */}
        <div className="w-48 h-1.5 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-full overflow-hidden relative shadow-inner mb-4">
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              repeat: Infinity,
              duration: 1.4,
              ease: "easeInOut"
            }}
            className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#00bda5] to-transparent rounded-full shadow-[0_0_12px_#00bda5]"
          />
        </div>

        {/* Primary Status Text */}
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-[#00bda5] animate-ping" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider bg-gradient-to-r from-zinc-800 via-zinc-900 to-zinc-700 dark:from-zinc-100 dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">
            {label}
          </h4>
        </div>

        {/* Sublabel */}
        {sublabel && (
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 max-w-[220px] leading-relaxed">
            {sublabel}
          </p>
        )}
      </motion.div>
    </div>
  );
}
