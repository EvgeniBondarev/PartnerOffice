/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес API Studio2 (без завершающего слэша). Пусто — тот же origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
