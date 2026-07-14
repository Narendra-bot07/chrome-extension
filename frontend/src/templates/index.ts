import ProfessionalATS from './ProfessionalATS';
import ModernATS from './ModernATS';
import MinimalATS from './MinimalATS';
import ModernProATS from './ModernProATS';

const templates = {
  'ats-classic': ProfessionalATS,
  'ats-modern': ModernATS,
  'minimal-professional': MinimalATS,
  'ProfessionalATS': ProfessionalATS,
  'ModernATS': ModernATS,
  'MinimalATS': MinimalATS,
  'ModernProATS': ModernProATS,
};

export const getTemplateComponent = (id: string) => {
  return templates[id] || ProfessionalATS;
};
