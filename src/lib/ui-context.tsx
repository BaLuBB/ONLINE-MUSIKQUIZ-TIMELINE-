import { createContext, useContext } from 'react';

export type DialogName = 'create' | 'join' | 'howto' | null;

export interface UIContextValue {
  dialog: DialogName;
  open(d: Exclude<DialogName, null>, opts?: { code?: string }): void;
  close(): void;
  joinCode: string;
}

export const UIContext = createContext<UIContextValue | null>(null);
export function useUI(): UIContextValue {
  const v = useContext(UIContext);
  if (!v) throw new Error('useUI außerhalb des Providers');
  return v;
}
