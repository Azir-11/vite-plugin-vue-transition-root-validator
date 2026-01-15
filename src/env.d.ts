declare module 'virtual:vue-transition-root-validator' {
  import type { App } from 'vue';

  export type Lang = 'en' | 'zh';

  export interface SetupOptions {
    /** 界面语言，默认 'en' */
    lang?: Lang;
    /** 是否在检测到错误后自动禁用检测（避免重复报错），默认 false */
    disableAfterFirstError?: boolean;
  }

  export function setupVueRootValidator(app: App, options?: SetupOptions): void;
}
