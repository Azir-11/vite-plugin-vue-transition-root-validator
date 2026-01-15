declare module 'virtual:vue-transition-root-validator' {
  export interface SetupOptions {
    lang?: 'en' | 'zh';
    disableAfterFirstError?: boolean;
  }

  export function setupVueRootValidator(app: import('vue').App, options?: SetupOptions): void;
}
