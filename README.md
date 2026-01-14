# vite-plugin-vue-transition-root-validator
在 Vite dev 环境捕获 Vue `<Transition>` 运行时 warn，并用 overlay 给出可操作的修复建议。

## 安装

```bash
npm i -D vite-plugin-vue-transition-root-validator
```

## 使用

在 `vite.config.ts` 中：

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueRootValidator from 'vite-plugin-vue-transition-root-validator'

export default defineConfig({
	plugins: [
			vue(),
               // 需要启用该 Vite 插件（用于注入虚拟模块 + 监听客户端上报）
               // 本插件不提供任何 vite.config 参数。
               vueRootValidator()
		]
})
```

在 `main.ts` 中：

```ts
import { createApp } from 'vue';
import App from './App.vue';
import { setupVueRootValidator } from 'virtual:vue-root-validator';

const app = createApp(App);

// 在 mount 前初始化（推荐放在所有 setup 之后）
setupVueRootValidator(app, {
  lang: 'zh' // ✅ 语言只需要在这里配置一次
});

app.mount('#app');
```

> 说明：overlay 的标题（message header）与正文（stack）都会跟随此处的 `lang`。


## 代码执行流程

### 插件初始化阶段（构建时）

```
vite.config.ts
  └─> setupVitePlugins()
       └─> vueRootValidator({ lang: 'zh' })
            └─> [index.ts] vitePluginVueRootValidator()
                 ├─> configResolved() - 保存配置
                 ├─> configureServer() - 监听 WebSocket 消息
                 ├─> resolveId() - 注册虚拟模块 'virtual:vue-root-validator'
                 └─> load() - 返回虚拟模块代码（导出 client.ts 的函数）
```

### 应用启动阶段（运行时）

```
src/main.ts
  └─> setupApp()
       ├─> createApp(App)
       ├─> setupStore(app)
       ├─> setupRouter(app)
       ├─> setupI18n(app)
       │
       ├─> 【新增】setupVueRootValidator(app) ⭐
       │    └─> [client.ts] setupVueRootValidator()
       │         ├─> 注册 app.config.warnHandler
       │         ├─> 拦截所有 Vue 警告
       │         └─> 筛选 Transition 多根节点警告
       │
       └─> app.mount('#app')
```

### 错误检测阶段（运行时）

```
浏览器运行
  └─> Vue 检测到 <Transition> 多根问题
       └─> Vue 内部调用 app.config.warnHandler()
            └─> [client.ts] 自定义 warnHandler
                 ├─> 检查是否是 Transition 警告 ✓
                 ├─> 从组件追踪栈提取信息
                 │    ├─> extractRouteKey() - 提取路由 key
                 │    ├─> extractComponentName() - 提取组件名
                 │    └─> guessViewFileFromRouteKey() - 推测文件路径
                 │
                 ├─> formatTransitionRootMessage() - 格式化错误消息
                 │    └─> [i18n.ts] 生成中文错误提示
                 │
                 └─> send() - 通过 HMR WebSocket 发送到服务器
```

### 错误展示阶段（服务端）

```
Vite 开发服务器
  └─> [index.ts] configureServer()
       └─> server.ws.on('vite-plugin-vue-transition-root-validator:vue-warn')
            ├─> 接收客户端上报的错误消息
            ├─> 去重处理（避免重复显示）
            ├─> sendErrorOverlay() - 发送错误覆盖层
            │    └─> server.ws.send({ type: 'error', ... })
            │         └─> 浏览器显示 Vite Error Overlay 🔴
            │
            └─> 首次错误时显示初始化说明（控制台）
```
