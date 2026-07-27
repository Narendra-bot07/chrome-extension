import React from 'react';
import TailorRender from '../components/Resume/TailorRender';
import { toRenderableResume } from '../utils/renderableResume';

export const getTemplateComponent = (id: string) => {
  // Returns the config-driven TailorRender engine wrapper matching the target configuration name
  return function TemplateWrapper({
    resume,
    sectionOrder,
    layoutLevel
  }: {
    resume: any,
    sectionOrder?: string[],
    layoutLevel?: number
  }) {
    return React.createElement(TailorRender, {
      resume: toRenderableResume(resume),
      templateName: id,
      sectionOrder,
      layoutLevel
    });
  };
};
