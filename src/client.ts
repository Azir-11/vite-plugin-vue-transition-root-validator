import type { App, AppConfig, ComponentPublicInstance } from 'vue';
import type { Lang } from './types.ts';
import { formatTransitionRootMessage } from './i18n.ts';

/**
 * Vue Transition 警告关键字
 * 用于识别 Vue 运行时发出的 Transition 多根节点警告
 */
const VUE_TRANSITION_WARN = 'Component inside <Transition> renders non-element root node that cannot be animated.';

/**
 * 客户端配置选项
 */
type SetupOptions = {
  /** 界面语言，默认 'en' */
  lang?: Lang;
  /** 是否在检测到错误后自动禁用检测（避免重复报错），默认 false */
  disableAfterFirstError?: boolean;
};

/**
 * HMR 发送的消息载荷
 */
type Payload = {
  key: string;
  message: string;
  lang: Lang;
};

/**
 * 从 Vue 警告信息中提取组件名称
 * 示例: "at <Index onVnodeUnmounted=... key="/test" ... >"
 */
function extractComponentName(text: string): string | undefined {
  const m = text.match(/at <([^\s>]+)/);
  return m?.[1];
}

/**
 * 从 Vue 警告信息中提取路由 key
 * 示例: key="/test"
 */
function extractRouteKey(text: string): string | undefined {
  // eslint-disable-next-line no-useless-escape
  const m = text.match(/key=\"([^\"]+)\"/);
  return m?.[1];
}

/**
 * 获取组件实例可能对应的文件路径
 */
function guessViewFileFromInstance(instance: ComponentPublicInstance | null | undefined): string | undefined {
  if (!instance) return undefined;

  // eslint-disable-next-line dot-notation
  return (instance.$options as any)['__file'];
}

/**
 * 获取组件实例可能对应的文件路径
 */
function getViewUrlFromInstance(instance: ComponentPublicInstance | null | undefined): string | undefined {
  if (!instance) return undefined;

  return instance.$el?.baseURI;
}

/**
 * 检查插件是否已经安装
 */
function alreadyInstalled(): boolean {
  // eslint-disable-next-line dot-notation
  return Boolean((globalThis as any)['__VITE_PLUGIN_VUE_ROOT_VALIDATOR_INSTALLED__']);
}

/**
 * 标记插件已安装
 */
function markInstalled() {
  // eslint-disable-next-line dot-notation
  (globalThis as any)['__VITE_PLUGIN_VUE_ROOT_VALIDATOR_INSTALLED__'] = true;
}

/**
 * 通过 HMR WebSocket 向 Vite 服务器发送消息
 */
type HotLike = {
  send?: (event: string, payload: unknown) => void;
  on?: (event: string, cb: (data: any) => void) => void;
};

const pendingPayloads = new Map<string, Payload>();
let listenersBound = false;
let retryTimer: number | null = null;
let retryDelayMs = 200;

function getHot(): HotLike | undefined {
  return (import.meta as any).hot as HotLike | undefined;
}

function trySendNow(payload: Payload): boolean {
  const hot = getHot();
  if (!hot?.send) return false;

  try {
    hot.send('vite-plugin-vue-transition-root-validator:vue-warn', payload);
    return true;
  } catch {
    return false;
  }
}

function scheduleRetry() {
  if (retryTimer !== null) return;

  // 轻量兜底：如果错过了 vite:ws:connect 事件，也会在短时间内尝试重发。
  retryTimer = globalThis.setTimeout(() => {
    retryTimer = null;
    flushPendingPayloads();

    // 如果还有积压，继续重试（指数退避，避免持续高频）
    if (pendingPayloads.size) {
      retryDelayMs = Math.min(retryDelayMs * 2, 2000);
      scheduleRetry();
    }
  }, retryDelayMs) as unknown as number;
}

function flushPendingPayloads() {
  if (!pendingPayloads.size) return;

  // fire-and-forget：是否送达由服务端 ACK 决定；未 ACK 的会继续重试
  for (const p of pendingPayloads.values()) {
    trySendNow(p);
  }
}

function bindHmrListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const hot = getHot();
  if (!hot?.on) return;

  // 连接建立后立刻 flush 一次，减少首屏丢消息的概率
  hot.on('vite:ws:connect', () => {
    retryDelayMs = 200;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    flushPendingPayloads();
  });

  // 服务端 ACK：用于清理重试队列，避免重复发送
  hot.on('vite-plugin-vue-transition-root-validator:ack', (data: any) => {
    const key = data?.key;
    if (!key) return;

    pendingPayloads.delete(key);
    if (!pendingPayloads.size) {
      retryDelayMs = 200;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }
  });
}

function send(payload: Payload) {
  // 仅在开发环境且 HMR 启用时工作
  const hot = getHot();
  if (!hot?.send) return;

  bindHmrListenersOnce();

  pendingPayloads.set(payload.key, payload);
  trySendNow(payload);
  scheduleRetry();
}

let originalWarnHandler: null | AppConfig['warnHandler'] = null;

function resendLog(msg: string, instance: ComponentPublicInstance | null, trace: string) {
  if (originalWarnHandler) {
    originalWarnHandler(msg, instance, trace);
  }
}

/**
 * 设置 Vue Root Validator
 *
 * 在 Vue 应用上注册 warnHandler 来捕获 Transition 多根节点警告
 *
 * @param app - Vue 应用实例
 * @param options - 配置选项
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { setupVueRootValidator } from 'virtual:vue-root-validator';
 * import App from './App.vue';
 *
 * const app = createApp(App);
 *
 * // 在挂载前设置验证器
 * setupVueRootValidator(app, { lang: 'zh' });
 *
 * app.mount('#app');
 * ```
 */
export function setupVueRootValidator(app: App, options: SetupOptions = {}) {
  // 防止重复安装
  if (alreadyInstalled()) {
    return;
  }
  markInstalled();

  const lang: Lang = options.lang ?? 'en';
  const disableAfterFirstError = options.disableAfterFirstError ?? false;

  // 尽早绑定 HMR 连接监听，避免首次触发 warning 时 ws 尚未 ready。
  bindHmrListenersOnce();

  // 保存原始的 warnHandler（如果有）
  originalWarnHandler = app.config.warnHandler;

  // 用于防抖，避免同一错误重复发送
  let lastSentAt = 0;
  let lastSentKey = '';
  let errorSent = false;

  /**
   * 自定义 Vue 警告处理器
   *
   * @param msg - 警告消息
   * @param instance - 组件实例
   * @param trace - 组件追踪栈
   */
  app.config.warnHandler = (msg: string, instance: ComponentPublicInstance | null, trace: string) => {
    resendLog(msg, instance, trace);
    // 如果已经发送过错误且配置为只发送一次，则跳过
    if (disableAfterFirstError && errorSent) {
      return;
    }

    // 检查是否是 Transition 多根节点警告
    const matched = msg.includes(VUE_TRANSITION_WARN);

    if (!matched) {
      // 不是目标警告
      return;
    }

    // 防抖处理：避免短时间内重复发送同一个错误
    const now = Date.now();
    const text = msg + trace;
    const key = text.slice(0, 400);

    if (now - lastSentAt > 500 || key !== lastSentKey) {
      lastSentAt = now;
      lastSentKey = key;

      // 从 trace 中提取信息
      const routeKey = extractRouteKey(trace);
      const component = extractComponentName(trace);
      const file = guessViewFileFromInstance(instance);
      const url = getViewUrlFromInstance(instance);

      // 格式化错误消息
      const message = formatTransitionRootMessage(lang, {
        url,
        file,
        routeKey,
        component
      });

      // 发送到 Vite 服务器
      send({ key: message.slice(0, 800), message, lang });

      errorSent = true;
    }
  };
}
