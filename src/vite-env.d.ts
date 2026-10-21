/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ENABLE_LOCAL_MODE?: string;
  /** Lokaler Testmodus: 'demo' erzwingt Demo-Töne statt iTunes-Vorschauen. */
  readonly VITE_LOCAL_AUDIO?: string;
  /** 'local' | 'p2p': bevorzugter Modus, wenn kein Supabase konfiguriert ist. */
  readonly VITE_BACKEND?: string;
  readonly VITE_PEER_HOST?: string;
  readonly VITE_PEER_PORT?: string;
  readonly VITE_PEER_PATH?: string;
  readonly VITE_PEER_SECURE?: string;
  /** JSON-Liste von ICE-Servern (STUN/TURN) */
  readonly VITE_ICE_SERVERS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __LOCAL_MODE__: boolean;
declare const __P2P_MODE__: boolean;
