import React from 'react';

export function PageContainer({
  as: Component = 'div',
  mode = 'wide',
  workspace = false,
  className = '',
  children
}) {
  return (
    <Component
      className={[
        'page-container',
        `page-container--${mode}`,
        workspace ? 'page-container--workspace' : '',
        className
      ].filter(Boolean).join(' ')}
    >
      {children}
    </Component>
  );
}

export default PageContainer;
