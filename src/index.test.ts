import { describe, expect, it, vi } from 'vitest';
import vueRootValidator from './index.ts';

describe('vite-plugin-vue-transition-root-validator', () => {
  it('exposes a serve-only vite plugin', () => {
    const plugin = vueRootValidator();
    expect(plugin.name).toBe('vite-plugin-vue-transition-root-validator');
    expect(plugin.apply).toBe('serve');
  });

  it('loads virtual module that re-exports client entry', () => {
    const plugin = vueRootValidator();
    const resolvedId = plugin.resolveId?.('virtual:vue-root-validator');
    expect(resolvedId).toBe('\0virtual:vue-root-validator');

    const code = plugin.load?.('\0virtual:vue-root-validator');
    expect(typeof code).toBe('string');
    expect(code).toContain('export { setupVueRootValidator }');
    expect(code).toContain('/@fs/');
    expect(code).toContain('/src/client.ts');
  });

  it('sends overlay and ack, and dedupes by client', () => {
    const plugin = vueRootValidator();
    plugin.configResolved?.({ command: 'serve' });

    const wsOn = vi.fn();
    const wsSend = vi.fn();
    const server = {
      ws: {
        on: wsOn,
        send: wsSend
      },
      config: {
        logger: {
          warn: vi.fn(),
          info: vi.fn()
        }
      }
    };

    plugin.configureServer?.(server as any);
    expect(wsOn).toHaveBeenCalledTimes(1);
    expect(wsOn).toHaveBeenCalledWith('vite-plugin-vue-transition-root-validator:vue-warn', expect.any(Function));

    const handler = wsOn.mock.calls[0]![1] as (payload: any, client: any) => void;

    const clientSend = vi.fn((a: any, b?: any) => {
      void a;
      void b;
    });
    const client = { send: clientSend };

    handler({ message: 'msg-1', key: 'k1', lang: 'zh' }, client);
    expect(clientSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        err: expect.objectContaining({
          message: expect.any(String),
          stack: 'msg-1'
        })
      })
    );
    expect(clientSend).toHaveBeenCalledWith('vite-plugin-vue-transition-root-validator:ack', { key: 'k1' });
    expect(wsSend).not.toHaveBeenCalled();

    clientSend.mockClear();
    handler({ message: 'msg-1', key: 'k1', lang: 'zh' }, client);
    expect(clientSend).toHaveBeenCalledTimes(1);
    expect(clientSend).toHaveBeenCalledWith('vite-plugin-vue-transition-root-validator:ack', { key: 'k1' });
  });
});

