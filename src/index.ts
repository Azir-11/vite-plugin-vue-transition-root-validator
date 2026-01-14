import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { Lang } from './types.ts';
import { getMessageHeader } from './i18n.ts';

/**
 * Vite DevServer 类型（精简版）
 */
type DevServerLike = {
  ws: {
    send: (payload: { type: 'error'; err: { message: string; stack?: string } }) => void;
    on: (event: string, listener: (payload: any, client: any) => void) => void;
  };
  config: {
    logger: {
      warn: (msg: string) => void;
      info: (msg: string) => void;
    };
  };
};

type DevClientLike = {
  send?: {
    (payload: { type: 'error'; err: { message: string; stack?: string } }): void;
    (event: string, payload?: any): void;
  };
};

/**
 * Vite ResolvedConfig 类型（精简版）
 */
type ResolvedConfigLike = {
  command: 'serve' | 'build' | string;
};

/**
 * 发送错误覆盖层到客户端（优先定向发送，避免首屏时广播命中不到当前 client）
 */
function sendErrorOverlay(args: { server: DevServerLike; message: string; lang: Lang; client?: DevClientLike }) {
  const { server, message, lang, client } = args;
  const payload = {
    type: 'error',
    err: {
      message: getMessageHeader(lang),
      stack: message
    }
  } as const;

  if (client?.send) {
    client.send(payload);
    return;
  }

  server.ws.send(payload);
}

/**
 * 客户端上报的消息载荷
 */
type ClientReportPayload = {
  message: string;
  /** 用于 ACK 去重/确认（客户端可不传，服务端会回退使用 message 截断值） */
  key?: string;
  /** 客户端运行时语言（推荐从 main.ts 传入并上报），用于决定 overlay header 语言 */
  lang?: Lang;
};

/**
 * Vite 插件：Vue Root Validator
 *
 * 用于检测 Vue 组件在 <Transition> 内渲染时的多根节点问题
 *
 * @returns Vite 插件对象
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import vitePluginVueRootValidator from 'vite-plugin-vue-transition-root-validator';
 *
 * export default defineConfig({
 *   plugins: [
 *     vitePluginVueRootValidator()
 *   ]
 * });
 * ```
 */
export default function vitePluginVueRootValidator() {
  let resolved: ResolvedConfigLike;

  return {
    name: 'vite-plugin-vue-transition-root-validator',
    apply: 'serve' as const, // 仅在开发环境应用

    /**
     * 保存解析后的配置
     */
    configResolved(config: ResolvedConfigLike) {
      resolved = config;
    },

    /**
     * 配置开发服务器
     * 监听客户端上报的警告消息，并通过 error overlay 显示
     */
    configureServer(server: DevServerLike) {
      if (resolved.command !== 'serve') return;

      // 用于去重，避免同一客户端重复发送相同消息
      const lastByClient = new WeakMap<object, string>();

      // 监听客户端上报的警告
      server.ws.on('vite-plugin-vue-transition-root-validator:vue-warn', (payload: ClientReportPayload, client: object) => {
        if (!payload?.message) return;

        // 去重处理
        const key = payload.key ?? payload.message.slice(0, 800);
        const prev = lastByClient.get(client as unknown as object);
        if (prev === key) {
          // 仍然回 ACK，避免客户端重试积压
          (client as any as DevClientLike)?.send?.('vite-plugin-vue-transition-root-validator:ack', { key });
          return;
        }
        lastByClient.set(client as unknown as object, key);

        const effectiveLang: Lang = payload.lang ?? 'en';

        // 发送错误覆盖层
        sendErrorOverlay({
          server,
          message: payload.message,
          lang: effectiveLang,
          client: client as any as DevClientLike
        });

        // 回 ACK，通知客户端该消息已被处理（用于清理重试队列）
        (client as any as DevClientLike)?.send?.('vite-plugin-vue-transition-root-validator:ack', { key });
      });
    },

    /**
     * 解析虚拟模块
     * 处理 'virtual:vue-root-validator' 模块的导入
     */
    resolveId(id: string) {
      if (id === 'virtual:vue-root-validator') {
        // 返回一个虚拟模块 ID，加上 \0 前缀表示这是一个虚拟模块
        return '\0virtual:vue-root-validator';
      }
      return null;
    },

    /**
     * 加载虚拟模块
     * 返回虚拟模块的代码内容
     */
    load(id: string) {
      if (id === '\0virtual:vue-root-validator') {
        const clientEntryTs = fileURLToPath(new URL('./client.ts', import.meta.url));
        const clientEntryJs = fileURLToPath(new URL('./client.js', import.meta.url));
        const clientEntry = existsSync(clientEntryTs) ? clientEntryTs : clientEntryJs;
        const clientUrl = `/@fs/${clientEntry.replace(/\\/g, '/')}`;

        // 返回虚拟模块代码：重新导出 client.ts 的函数
        return `
// 虚拟模块：vue-root-validator
// 此模块由 vite-plugin-vue-transition-root-validator 插件自动生成

import { setupVueRootValidator } from ${JSON.stringify(clientUrl)};

// 重新导出函数
export { setupVueRootValidator };
`;
      }
      return null;
    }
  };
}


