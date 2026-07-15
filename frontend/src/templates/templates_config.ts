export interface TemplateConfig {
  id: string;
  name: string;
  fontFamily: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  accentColor: string;
  borderColor: string;
  layout: 'single-column' | 'two-column' | 'sidebar';
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
  headerStyle: 'classic' | 'centered' | 'banner' | 'sidebar';
  borders: {
    sectionDivider: boolean;
    headerDivider: boolean;
  };
  icons: boolean;
}

export const TEMPLATE_CONFIGS: Record<string, TemplateConfig> = {
  'ProfessionalATS': {
    id: 'ProfessionalATS',
    name: 'Professional ATS',
    fontFamily: 'font-serif', // e.g. Georgia / Times New Roman
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-zinc-700',
    textColor: 'text-zinc-800',
    accentColor: 'border-zinc-900',
    borderColor: 'border-zinc-300',
    layout: 'single-column',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-10',
      paddingY: 'py-8'
    },
    headerStyle: 'centered',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: false
  },
  'ExecutiveATS': {
    id: 'ExecutiveATS',
    name: 'Executive ATS',
    fontFamily: 'font-sans',
    primaryColor: 'text-indigo-900',
    secondaryColor: 'text-zinc-700',
    textColor: 'text-zinc-800',
    accentColor: 'border-indigo-900',
    borderColor: 'border-indigo-100',
    layout: 'single-column',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-12',
      paddingY: 'py-10'
    },
    headerStyle: 'centered',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'MinimalATS': {
    id: 'MinimalATS',
    name: 'Minimal ATS',
    fontFamily: 'font-serif',
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-zinc-600',
    textColor: 'text-zinc-800',
    accentColor: 'border-zinc-200',
    borderColor: 'border-zinc-200',
    layout: 'single-column',
    spacing: {
      sectionGap: 'space-y-5 mb-5',
      itemGap: 'space-y-3',
      bulletGap: 'space-y-1',
      paddingX: 'px-8',
      paddingY: 'py-6'
    },
    headerStyle: 'classic',
    borders: {
      sectionDivider: false,
      headerDivider: false
    },
    icons: false
  },
  'CorporateATS': {
    id: 'CorporateATS',
    name: 'Corporate ATS',
    fontFamily: 'font-sans',
    primaryColor: 'text-blue-900',
    secondaryColor: 'text-zinc-700',
    textColor: 'text-zinc-800',
    accentColor: 'border-blue-900',
    borderColor: 'border-blue-200',
    layout: 'single-column',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-2',
      paddingX: 'px-10',
      paddingY: 'py-8'
    },
    headerStyle: 'banner',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'ModernATS': {
    id: 'ModernATS',
    name: 'Modern ATS',
    fontFamily: 'font-sans',
    primaryColor: 'text-indigo-950',
    secondaryColor: 'text-indigo-700',
    textColor: 'text-zinc-800',
    accentColor: 'border-indigo-900',
    borderColor: 'border-indigo-200',
    layout: 'single-column',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-10',
      paddingY: 'py-8'
    },
    headerStyle: 'classic',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'TechnicalATS': {
    id: 'TechnicalATS',
    name: 'Technical ATS',
    fontFamily: 'font-mono',
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-zinc-700',
    textColor: 'text-zinc-900',
    accentColor: 'border-zinc-900',
    borderColor: 'border-zinc-300',
    layout: 'single-column',
    spacing: {
      sectionGap: 'space-y-4 mb-4',
      itemGap: 'space-y-2',
      bulletGap: 'space-y-1',
      paddingX: 'px-6',
      paddingY: 'py-6'
    },
    headerStyle: 'classic',
    borders: {
      sectionDivider: true,
      headerDivider: false
    },
    icons: false
  },
  'CompactATS': {
    id: 'CompactATS',
    name: 'Compact ATS',
    fontFamily: 'font-sans',
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-zinc-700',
    textColor: 'text-zinc-800',
    accentColor: 'border-zinc-900',
    borderColor: 'border-zinc-300',
    layout: 'single-column',
    spacing: {
      sectionGap: 'space-y-3 mb-3',
      itemGap: 'space-y-2',
      bulletGap: 'space-y-0.5',
      paddingX: 'px-6',
      paddingY: 'py-6'
    },
    headerStyle: 'classic',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: false
  },
  'SidebarATS': {
    id: 'SidebarATS',
    name: 'Sidebar ATS',
    fontFamily: 'font-sans',
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-indigo-700',
    textColor: 'text-zinc-800',
    accentColor: 'border-indigo-900',
    borderColor: 'border-zinc-200',
    layout: 'sidebar',
    sidebarWidth: 'w-[32%]',
    sidebarBackground: 'bg-zinc-50/60',
    sidebarBorderRight: 'border-r border-zinc-200',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-8',
      paddingY: 'py-8'
    },
    headerStyle: 'sidebar',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  },
  'ModernProATS': {
    id: 'ModernProATS',
    name: 'Modern Pro ATS',
    fontFamily: 'font-sans',
    primaryColor: 'text-zinc-900',
    secondaryColor: 'text-indigo-700',
    textColor: 'text-zinc-800',
    accentColor: 'border-indigo-900',
    borderColor: 'border-zinc-200',
    layout: 'sidebar',
    sidebarWidth: 'w-[32%]',
    sidebarBackground: 'bg-zinc-50/60',
    sidebarBorderRight: 'border-r border-zinc-200',
    spacing: {
      sectionGap: 'space-y-6 mb-6',
      itemGap: 'space-y-4',
      bulletGap: 'space-y-1.5',
      paddingX: 'px-8',
      paddingY: 'py-8'
    },
    headerStyle: 'sidebar',
    borders: {
      sectionDivider: true,
      headerDivider: true
    },
    icons: true
  }
};
