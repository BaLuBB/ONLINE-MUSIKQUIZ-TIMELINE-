/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ENABLE_LOCAL_MODE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __LOCAL_MODE__: boolean;
