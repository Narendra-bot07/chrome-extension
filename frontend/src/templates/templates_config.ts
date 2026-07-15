export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  recommendedFor: string;
  atsScore: number;
  layout: 'single-column' | 'two-column' | 'sidebar' | 'marissa';
  profilePhoto: boolean;
  fontFamily: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  accentColor: string;
  borderColor: string;
  sidebarWidth?: string;
  sidebarBackground?: string;
  sidebarBorderRight?: string;
  spacing: {
    sectionGap: string;
    itemGap: string;
    bulletGap: string;
    paddingX: string;
    paddingY: string;
  };
  headerStyle: 'classic' | 'centered' | 'banner' | 'sidebar' | 'split-photo';
  borders: {
    sectionDivider: boolean;
    headerDivider: boolean;
  };
  icons: boolean;
}

export const TEMPLATE_CONFIGS: Record<string, TemplateConfig> = {
  // --- WITHOUT PROFILE PHOTO (2) ---
  'ExecutiveATS': {
    id: 'ExecutiveATS',
    name: 'Executive ATS',
    description: 'Elegant top-header alignment with deep black accents.',
    recommendedFor: 'Senior Engineers, Engineering Managers, Architects, Staff Engineers',
    atsScore: 98,
    layout: 'single-column',
    profilePhoto: false,
    fontFamily: 'font-serif', // Georgia/Times New Roman feel
    primaryColor: 'text-black',
    secondaryColor: 'text-black',
    textColor: 'text-black',
    accentColor: 'border-black',
    borderColor: 'border-black',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-16',
      paddingY: 'py-10'
    },
    headerStyle: 'centered',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'TwoColumnATS': {
    id: 'TwoColumnATS',
    name: 'Two-Column ATS',
    description: 'Maximum information density without reducing parsing structure compatibility.',
    recommendedFor: 'Software Engineers, AI Specialists, Data Engineers, Cybersecurity Analysts',
    atsScore: 92,
    layout: 'two-column',
    profilePhoto: false,
    fontFamily: 'font-sans',
    primaryColor: 'text-black',
    secondaryColor: 'text-black',
    textColor: 'text-black',
    accentColor: 'border-black',
    borderColor: 'border-black',
    sidebarWidth: 'w-[32%]',
    sidebarBackground: 'bg-white',
    sidebarBorderRight: 'border-r border-black',
    spacing: {
      sectionGap: 'space-y-5 mb-5',
      itemGap: 'space-y-3.5',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-12',
      paddingY: 'py-8'
    },
    headerStyle: 'classic',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },

  // --- WITH PROFILE PHOTO (3) ---
  'EuropeanPhotoATS': {
    id: 'EuropeanPhotoATS',
    name: 'European Executive',
    description: 'European market friendly layout with a left sidebar and elegant photo slot.',
    recommendedFor: 'International Applicants, Managers, Management Consultants',
    atsScore: 91,
    layout: 'sidebar',
    profilePhoto: true,
    fontFamily: 'font-sans',
    primaryColor: 'text-black',
    secondaryColor: 'text-black',
    textColor: 'text-black',
    accentColor: 'border-black',
    borderColor: 'border-black',
    sidebarWidth: 'w-[34%]',
    sidebarBackground: 'bg-zinc-50',
    sidebarBorderRight: 'border-r border-black',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-12',
      paddingY: 'py-8'
    },
    headerStyle: 'sidebar',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'PortfolioPhotoATS': {
    id: 'PortfolioPhotoATS',
    name: 'Premium Portfolio',
    description: 'Creative tech-oriented layout highlighting github, portfolios, and details.',
    recommendedFor: 'Frontend Developers, Product Designers, Creative Developers',
    atsScore: 92,
    layout: 'single-column',
    profilePhoto: true,
    fontFamily: 'font-sans',
    primaryColor: 'text-black',
    secondaryColor: 'text-black',
    textColor: 'text-black',
    accentColor: 'border-black',
    borderColor: 'border-black',
    spacing: {
      sectionGap: 'space-y-5 mb-5',
      itemGap: 'space-y-3.5',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-16',
      paddingY: 'py-8'
    },
    headerStyle: 'split-photo',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'MarissaATS': {
    id: 'MarissaATS',
    name: 'Marissa Executive',
    description: 'Two-column elite layout with right-aligned circular photo and solid headers.',
    recommendedFor: 'Executives, Product Managers, Senior Engineers, Directors',
    atsScore: 95,
    layout: 'marissa',
    profilePhoto: true,
    fontFamily: 'font-sans',
    primaryColor: 'text-black',
    secondaryColor: 'text-black',
    textColor: 'text-black',
    accentColor: 'border-black',
    borderColor: 'border-black',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-16',
      paddingY: 'py-10'
    },
    headerStyle: 'split-photo',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'AltaATS': {
    id: 'AltaATS',
    name: 'Nico Executive',
    description: 'High-contrast header banner template with a shaded left sidebar and details.',
    recommendedFor: 'Researchers, Engineers, Academics, Developers',
    atsScore: 94,
    layout: 'sidebar', // sidebar structure
    profilePhoto: true,
    fontFamily: 'font-sans',
    primaryColor: 'text-white', // Tagline name is white
    secondaryColor: 'text-black',
    textColor: 'text-black',
    accentColor: 'border-black',
    borderColor: 'border-black',
    sidebarWidth: 'w-[32%]',
    sidebarBackground: 'bg-zinc-100/70 border-r border-black',
    sidebarBorderRight: 'border-r border-black',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-0', // Spaced by columns
      paddingY: 'py-0'
    },
    headerStyle: 'banner', // Dark header banner style
    borders: {
      sectionDivider: true,
      headerDivider: false
    },
    icons: true
  }
};
