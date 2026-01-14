import type { Lang } from './types.ts';

export type TransitionRootMessageContext = {
  file?: string;
  url?: string;
  routeKey?: string;
  component?: string;
};

const translations = {
  zh: {
    messageHeader: '[vite-plugin-vue-transition-root-validator] 检测到 Vue Transition 多根节点错误',
    setupInstructions: `
如何在项目中启用此插件：

1. 在 vite.config.ts 中添加插件：
   import vitePluginVueRootValidator from 'vite-plugin-vue-transition-root-validator';

   plugins: [
     vitePluginVueRootValidator()
   ]

2. 在 src/main.ts 中初始化：
   import { setupVueRootValidator } from 'virtual:vue-root-validator';

   const app = createApp(App);
   setupVueRootValidator(app, { lang: 'zh' });
   app.mount('#app');
`
  },
  en: {
    messageHeader: '[vite-plugin-vue-transition-root-validator] Vue Transition Multiple Root Nodes Error',
    setupInstructions: `
How to enable this plugin in your project:

1. Add plugin in vite.config.ts:
   import vitePluginVueRootValidator from 'vite-plugin-vue-transition-root-validator';

   plugins: [
     vitePluginVueRootValidator()
   ]

2. Initialize in src/main.ts:
   import { setupVueRootValidator } from 'virtual:vue-root-validator';

   const app = createApp(App);
   setupVueRootValidator(app, { lang: 'en' });
   app.mount('#app');
`
  }
};

export function formatTransitionRootMessage(lang: Lang, ctx: TransitionRootMessageContext): string {
  if (lang === 'zh') {
    const title = 'Vue <Transition> 要求插槽内容具有单一的“元素根节点”。';
    const lines: string[] = [];
    lines.push(title);

    if (ctx.file) lines.push(`\n文件: ${ctx.file}`);
    if (ctx.url) lines.push(`URL: ${ctx.url}`);

    const meta: string[] = [];
    if (ctx.component) meta.push(`component=${ctx.component}`);
    if (ctx.routeKey) meta.push(`key=${ctx.routeKey}`);
    if (meta.length) lines.push(`上下文: ${meta.join(' ')}`);

    lines.push(
      '\n如何修复:\n' +
        `- 在${ctx.file ? `文件 ${ctx.file}` : '该组件'}的 <template> 最外层添加一个容器标签（如 <div> / <main>），把所有内容包起来，确保最终只渲染出一个根“标签元素”。\n` +
        '- 根节点不能是多个并列元素（Fragment/多根），也不能是纯文本或注释。\n' +
        '- 如果根部使用了 v-if / v-else，确保每个分支都只渲染一个根标签元素。'
    );

    lines.push(
      '\n为什么会这样:\n' +
        'Vue 的 <Transition> 需要把过渡 class 应用在一个真实的 DOM 元素上；' +
        '当插槽内容渲染出的根节点不是“单一元素”（例如 Fragment、多根、纯文本或注释）时，就无法执行进入/离开过渡。'
    );

    lines.push('\n相关文档:\nhttps://cn.vuejs.org/guide/built-ins/transition#the-transition-component');

    return lines.join('\n');
  }

  // English
  const title = 'Vue <Transition> requires a single element root node in its slot.';
  const lines: string[] = [];
  lines.push(title);

  if (ctx.file) lines.push(`\nFile: ${ctx.file}`);
  if (ctx.url) lines.push(`URL: ${ctx.url}`);

  const meta: string[] = [];
  if (ctx.component) meta.push(`component=${ctx.component}`);
  if (ctx.routeKey) meta.push(`key=${ctx.routeKey}`);
  if (meta.length) lines.push(`Context: ${meta.join(' ')}`);

  lines.push(
    '\nHow to fix:\n' +
      `- In the <template> of ${ctx.file ? `file ${ctx.file}` : 'this component'}, wrap everything with a single container element (e.g. <div> / <main>), so the final render has exactly one root *element*.\n` +
      '- The root cannot be a Fragment (multiple siblings), plain text, or a comment.\n' +
      '- If you use v-if / v-else at the root, ensure each branch renders exactly one root element.'
  );

  lines.push(
    '\nWhy this happens:\n' +
      'Vue <Transition> needs to apply transition classes to a real DOM element. ' +
      'If the slot content renders a non-element root (Fragment/multiple roots/text/comment), Vue cannot animate it.'
  );

  lines.push('\nDocs:\nhttps://cn.vuejs.org/guide/built-ins/transition#the-transition-component');

  return lines.join('\n');
}

export function getMessageHeader(lang: Lang): string {
  return translations[lang].messageHeader;
}

export function getSetupInstructions(lang: Lang): string {
  return translations[lang].setupInstructions;
}
