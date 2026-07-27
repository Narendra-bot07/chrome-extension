// Centralized Framer Motion Production Motion System for TailorFlow AI
// Designed for fast, subtle, Linear/Raycast/Apple-grade UI feel (60 FPS)

// 1. Page Entrance & Exit Variants
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 12
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.2, 0, 0, 1]
    }
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: {
      duration: 0.2,
      ease: [0.2, 0, 0, 1]
    }
  }
};

// 2. Stagger Container Variant (Cascading Children 40-50ms apart, max 250ms)
export const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02
    }
  }
};

// 3. Card & Section Entrance Variants (Fade, Translate 12px, Scale 0.98 -> 1)
export const cardVariants = {
  initial: {
    opacity: 0,
    y: 12,
    scale: 0.98
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 30
    }
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.15, ease: "easeOut" }
  }
};

export const fadeUp = {
  initial: {
    opacity: 0,
    y: 12
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 380,
      damping: 28
    }
  }
};

// 4. Modal Backdrop & Card Variants
export const backdropVariants = {
  initial: {
    opacity: 0,
    backdropFilter: "blur(0px)"
  },
  animate: {
    opacity: 1,
    backdropFilter: "blur(8px)",
    transition: { duration: 0.2, ease: "easeOut" }
  },
  exit: {
    opacity: 0,
    backdropFilter: "blur(0px)",
    transition: { duration: 0.15, ease: "easeIn" }
  }
};

export const modalVariants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 10
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 420,
      damping: 30
    }
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 6,
    transition: { duration: 0.15, ease: "easeInOut" }
  }
};

// 5. Dropdown & Context Menu Variants (180ms)
export const dropdownVariants = {
  initial: {
    opacity: 0,
    scale: 0.96,
    y: -6
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.18,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -4,
    transition: {
      duration: 0.12,
      ease: "easeIn"
    }
  }
};

// 6. Drawer Variants (Slide from right with subtle fade & blur)
export const drawerVariants = {
  initial: {
    x: "100%",
    opacity: 0
  },
  animate: {
    x: "0%",
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 350,
      damping: 32
    }
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.2, 0, 0, 1]
    }
  }
};

// 7. Toast Notification Variants
export const toastVariants = {
  initial: {
    opacity: 0,
    y: -16,
    scale: 0.95
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 450,
      damping: 28
    }
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.95,
    transition: { duration: 0.15, ease: "easeIn" }
  }
};

// 8. Reusable Button Interaction Motion Props
export const buttonMotion = {
  whileHover: { y: -2, transition: { type: "spring", stiffness: 500, damping: 25 } },
  whileTap: { scale: 0.98, transition: { type: "spring", stiffness: 600, damping: 30 } }
};
