import React from 'react';
import TailorRender from '../components/Resume/TailorRender';
import { toRenderableResume } from '../utils/renderableResume';

export const getTemplateComponent = (id: string) => {
  // Returns the config-driven TailorRender engine wrapper matching the target configuration name
  return function TemplateWrapper({
    resume,
    sectionOrder,
    layoutLevel,
    isExporting,
    disablePhotoModal
  }: {
    resume: any,
    sectionOrder?: string[],
    layoutLevel?: number,
    isExporting?: boolean,
    disablePhotoModal?: boolean
  }) {
    // isExporting was dropped here (never destructured, never forwarded),
    // so every consumer of this wrapper -- including PrintLayout.tsx (the
    // actual Playwright/PDF route, which explicitly passes isExporting=true)
    // -- silently fell back to TailorRender's default isExporting=false.
    // That put the interactive "click to add photo" placeholder (dashed
    // circle + camera icon) into exported PDFs for every resume with no
    // photo_url, instead of rendering nothing.
    return React.createElement(TailorRender, {
      resume: toRenderableResume(resume),
      templateName: id,
      sectionOrder,
      layoutLevel,
      isExporting,
      disablePhotoModal
    });
  };
};
