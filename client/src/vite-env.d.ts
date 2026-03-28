/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. https://your.host or http://192.168.1.10:8787 — overrides auto-detected API URL */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
