export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  recommendedFor: string;
  atsScore: number;
  layout: 'single-column' | 'two-column' | 'sidebar' | 'marissa' | 'hero' | 'banner';
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
  headerStyle: 'classic' | 'centered' | 'banner' | 'sidebar' | 'split-photo' | 'hero';
  borders: {
    sectionDivider: boolean;
    headerDivider: boolean;
  };
  icons: boolean;
}

const CANONICAL_TEMPLATES: Record<string, TemplateConfig> = {
  // ==================================================
  // TEMPLATE 1: CLASSIC ATS (NO PHOTO)
  // Purpose: Maximum ATS compatibility. Conservative corporate styling.
  // ==================================================
  'ClassicATS': {
    id: 'ClassicATS',
    name: 'Classic ATS',
    description: 'Maximum ATS compatibility with a clean single-column structure and traditional corporate styling.',
    recommendedFor: 'Software Engineers, Data Engineers, Backend Engineers, Consulting, Banking, Enterprise',
    atsScore: 99,
    layout: 'single-column',
    profilePhoto: false,
    fontFamily: 'font-sans',
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-zinc-700',
    textColor: 'text-zinc-900',
    accentColor: 'border-zinc-400',
    borderColor: 'border-zinc-300',
    spacing: {
      sectionGap: 'space-y-4 mb-4',
      itemGap: 'space-y-3',
      bulletGap: 'space-y-1',
      paddingX: 'px-14',
      paddingY: 'py-8'
    },
    headerStyle: 'classic',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },

  // ==================================================
  // TEMPLATE 2: EXECUTIVE ATS (NO PHOTO)
  // Purpose: Professional leadership resume with executive serif typography.
  // ==================================================
  'ExecutiveATS': {
    id: 'ExecutiveATS',
    name: 'Executive ATS',
    description: 'High-authority executive single-column layout with serif typography and generous spacing.',
    recommendedFor: 'Senior Engineers, Leads, Architects, Managers, Directors',
    atsScore: 98,
    layout: 'single-column',
    profilePhoto: false,
    fontFamily: 'font-serif',
    primaryColor: 'text-zinc-950',
    secondaryColor: 'text-zinc-800',
    textColor: 'text-zinc-900',
    accentColor: 'border-zinc-800',
    borderColor: 'border-zinc-400',
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

  // ==================================================
  // TEMPLATE 3: MODERN SIDEBAR (PHOTO OPTIONAL)
  // Purpose: Modern engineering profile with skills, education & certs in a narrow sidebar.
  // ==================================================
  'ModernSidebar': {
    id: 'ModernSidebar',
    name: 'Modern Sidebar',
    description: 'Modern engineering profile with a dedicated narrow sidebar for skills, education, and credentials.',
    recommendedFor: 'Developers, Data Scientists, ML Engineers, Tech Specialists',
    atsScore: 94,
    layout: 'sidebar',
    profilePhoto: true,
    fontFamily: 'font-sans',
    primaryColor: 'text-slate-900',
    secondaryColor: 'text-slate-700',
    textColor: 'text-slate-900',
    accentColor: 'border-slate-300',
    borderColor: 'border-slate-200',
    sidebarWidth: 'w-[32%]',
    sidebarBackground: 'bg-slate-50',
    sidebarBorderRight: 'border-r border-slate-200',
    spacing: {
      sectionGap: 'space-y-5 mb-5',
      itemGap: 'space-y-3.5',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-10',
      paddingY: 'py-8'
    },
    headerStyle: 'sidebar',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },

  // ==================================================
  // TEMPLATE 4: PORTFOLIO PRO (PHOTO OPTIONAL)
  // Purpose: Personal branding highlighting projects, GitHub, LinkedIn & technical accomplishments.
  // ==================================================
  'PortfolioPro': {
    id: 'PortfolioPro',
    name: 'Portfolio Pro',
    description: 'Tech-first personal branding layout with hero header, highlighted SVG badges, and project emphasis.',
    recommendedFor: 'Frontend, Full Stack, Product Engineers, Open Source Contributors',
    atsScore: 93,
    layout: 'single-column',
    profilePhoto: true,
    fontFamily: 'font-sans',
    primaryColor: 'text-indigo-950',
    secondaryColor: 'text-indigo-900',
    textColor: 'text-zinc-900',
    accentColor: 'border-indigo-500',
    borderColor: 'border-zinc-200',
    spacing: {
      sectionGap: 'space-y-5 mb-5',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-14',
      paddingY: 'py-8'
    },
    headerStyle: 'hero',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },

  // ==================================================
  // TEMPLATE 5: EUROPEAN MODERN (PHOTO OPTIONAL)
  // Purpose: European CV style with professional left accent banner and compact balanced spacing.
  // ==================================================
  'EuropeanModern': {
    id: 'EuropeanModern',
    name: 'European Modern',
    description: 'European market style featuring a sleek left accent banner, compact typography, and crisp structure.',
    recommendedFor: 'International Applications, Research, Engineering, R&D',
    atsScore: 92,
    layout: 'sidebar',
    profilePhoto: true,
    fontFamily: 'font-sans',
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-zinc-700',
    textColor: 'text-zinc-900',
    accentColor: 'border-zinc-300',
    borderColor: 'border-zinc-200',
    sidebarWidth: 'w-[33%]',
    sidebarBackground: 'bg-zinc-100/80',
    sidebarBorderRight: 'border-r border-zinc-300',
    spacing: {
      sectionGap: 'space-y-4 mb-4',
      itemGap: 'space-y-3',
      bulletGap: 'space-y-1',
      paddingX: 'px-8',
      paddingY: 'py-6'
    },
    headerStyle: 'banner',
    borders: {
      sectionDivider: true,
      headerDivider: false
    },
    icons: true
  },

  // ==================================================
  // TEMPLATE 6: PREMIUM EXECUTIVE (PHOTO OPTIONAL)
  // Purpose: High-end executive resume with balanced two-column strategy and luxury hierarchy.
  // ==================================================
  'PremiumExecutive': {
    id: 'PremiumExecutive',
    name: 'Premium Executive',
    description: 'High-end executive resume featuring a balanced two-column strategy and sophisticated typography.',
    recommendedFor: 'Senior Managers, Staff Engineers, Principal Engineers, Directors',
    atsScore: 96,
    layout: 'two-column',
    profilePhoto: true,
    fontFamily: 'font-serif',
    primaryColor: 'text-zinc-950',
    secondaryColor: 'text-amber-900',
    textColor: 'text-zinc-900',
    accentColor: 'border-amber-800/40',
    borderColor: 'border-zinc-300',
    sidebarWidth: 'w-[34%]',
    sidebarBackground: 'bg-stone-50/50',
    sidebarBorderRight: 'border-r border-stone-200',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-14',
      paddingY: 'py-9'
    },
    headerStyle: 'split-photo',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  }
};

// Aliases mapping legacy template IDs to the 6 canonical templates
export const TEMPLATE_CONFIGS: Record<string, TemplateConfig> = {
  ...CANONICAL_TEMPLATES,
  // Legacy aliases
  'TwoColumnATS': { ...CANONICAL_TEMPLATES['ModernSidebar'], id: 'TwoColumnATS' },
  'EuropeanPhotoATS': { ...CANONICAL_TEMPLATES['EuropeanModern'], id: 'EuropeanPhotoATS' },
  'PortfolioPhotoATS': { ...CANONICAL_TEMPLATES['PortfolioPro'], id: 'PortfolioPhotoATS' },
  'MarissaATS': { ...CANONICAL_TEMPLATES['PremiumExecutive'], id: 'MarissaATS' },
  'AltaATS': { ...CANONICAL_TEMPLATES['EuropeanModern'], id: 'AltaATS' },
  'MinimalATS': { ...CANONICAL_TEMPLATES['ClassicATS'], id: 'MinimalATS' },
  'ModernATS': { ...CANONICAL_TEMPLATES['ModernSidebar'], id: 'ModernATS' },
  'ModernProATS': { ...CANONICAL_TEMPLATES['PortfolioPro'], id: 'ModernProATS' },
  'ProfessionalATS': { ...CANONICAL_TEMPLATES['ClassicATS'], id: 'ProfessionalATS' }
};
