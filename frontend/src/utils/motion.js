export const MOTION = Object.freeze({
  duration: Object.freeze({
    instant: 0.08,
    fast: 0.14,
    base: 0.20,
    slow: 0.28,
    emphasis: 0.42
  }),
  ease: Object.freeze({
    standard: [0.2, 0, 0, 1],
    enter: [0.16, 1, 0.3, 1],
    exit: [0.4, 0, 1, 1]
  }),
  spring: Object.freeze({
    soft: { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 },
    snappy: { type: 'spring', stiffness: 440, damping: 32, mass: 0.7 }
  })
});

export const pageVariants = {
  initial: { opacity: 0, y: 8, filter: 'blur(3px)' },
  animate: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: MOTION.duration.base, ease: MOTION.ease.enter }
  },
  exit: {
    opacity: 0, y: -4, filter: 'blur(0px)',
    transition: { duration: MOTION.duration.fast, ease: MOTION.ease.exit }
  }
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: MOTION.duration.base } },
  exit: { opacity: 0, transition: { duration: MOTION.duration.fast } }
};

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1, y: 0,
    transition: { duration: MOTION.duration.base, ease: MOTION.ease.enter }
  },
  exit: { opacity: 0, y: -2, transition: { duration: MOTION.duration.fast } }
};

export const contentReveal = {
  initial: { opacity: 0, scale: 0.99 },
  animate: {
    opacity: 1, scale: 1,
    transition: { duration: MOTION.duration.base, ease: MOTION.ease.enter }
  },
  exit: { opacity: 0, transition: { duration: MOTION.duration.fast } }
};

export const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } }
};

export const cardVariants = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: MOTION.spring.soft },
  exit: {
    opacity: 0, scale: 0.985,
    transition: { duration: MOTION.duration.fast, ease: MOTION.ease.exit }
  }
};

export const listItemVariants = {
  initial: { opacity: 0, y: 6, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1, transition: MOTION.spring.soft },
  exit: {
    opacity: 0, y: -3, scale: 0.99,
    transition: { duration: MOTION.duration.fast }
  }
};

export const backdropVariants = {
  initial: { opacity: 0, backdropFilter: 'blur(0px)' },
  animate: {
    opacity: 1, backdropFilter: 'blur(8px)',
    transition: { duration: MOTION.duration.base, ease: MOTION.ease.standard }
  },
  exit: {
    opacity: 0, backdropFilter: 'blur(0px)',
    transition: { duration: MOTION.duration.fast, ease: MOTION.ease.exit }
  }
};

export const modalVariants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: MOTION.spring.soft },
  exit: {
    opacity: 0, scale: 0.98, y: 4,
    transition: { duration: MOTION.duration.fast, ease: MOTION.ease.exit }
  }
};

export const popoverVariants = {
  initial: { opacity: 0, scale: 0.97, y: 4 },
  animate: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: MOTION.duration.fast, ease: MOTION.ease.enter }
  },
  exit: {
    opacity: 0, scale: 0.98, y: 2,
    transition: { duration: MOTION.duration.instant, ease: MOTION.ease.exit }
  }
};
export const dropdownVariants = popoverVariants;

export const drawerVariants = {
  right: {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1, transition: MOTION.spring.soft },
    exit: { x: '100%', opacity: 0, transition: { duration: MOTION.duration.base } }
  },
  left: {
    initial: { x: '-100%', opacity: 0 },
    animate: { x: 0, opacity: 1, transition: MOTION.spring.soft },
    exit: { x: '-100%', opacity: 0, transition: { duration: MOTION.duration.base } }
  }
};

export const toastVariants = {
  initial: { opacity: 0, x: 16, y: -6, scale: 0.98 },
  animate: { opacity: 1, x: 0, y: 0, scale: 1, transition: MOTION.spring.soft },
  exit: {
    opacity: 0, x: 12, scale: 0.98,
    transition: { duration: MOTION.duration.fast, ease: MOTION.ease.exit }
  }
};

export const buttonMotion = {
  whileHover: { y: -1, transition: MOTION.spring.snappy },
  whileTap: { y: 0, scale: 0.98, transition: MOTION.spring.snappy }
};

export const reducedVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: MOTION.duration.fast } },
  exit: { opacity: 0, transition: { duration: MOTION.duration.instant } }
};
