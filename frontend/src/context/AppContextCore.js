import { createContext, useContext } from 'react';

export const AppContext = createContext(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppProvider');
  return context;
}

export function useOptionalApp() {
  return useContext(AppContext);
}
