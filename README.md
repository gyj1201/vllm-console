# vLLM 控制台

从模型仓库的 `config.json` 解析出可直接使用的 `vllm serve` 启动命令。

纯前端应用，浏览器直连魔搭 / HuggingFace 读取配置，无需后端服务。

---

## 快速开始

环境要求：**Node ≥ 22.15**、**pnpm ≥ 10**（模板依赖严格版本，npm 可能装出问题）

```bash
corepack enable pnpm   # 若尚未安装 pnpm
pnpm install
pnpm dev
```

## 构建与部署

```bash
pnpm build     # 产物输出到 dist/
pnpm preview   # 本地预览构建产物
```

### GitHub Pages

仓库已内置 `.github/workflows/deploy.yml`。推送 `main` 分支即自动构建部署，配置步骤：

1. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**
2. 等待 workflow 跑完，页面地址会显示在 Actions 摘要里

### 关键配置说明

| 位置 | 配置 | 为什么 |
|---|---|---|
| `vite.config.ts` | `base: './'` | Pages 部署在仓库子路径，用相对路径适配任意仓库名 |
| `src/router/index.ts` | `createWebHashHistory()` | Pages 是静态托管无 rewrite，直接访问 `/settings/appearance` 会 404，改用 hash 路由解决 |
| `package.json` | `"private": true` | 避免误发布到 npm |

---

## 新增功能模块

路由由文件自动生成（`vue-router/auto-routes`），无需手写路由表。加新模块只需两步：

**1. 建页面** `src/pages/gpu/index.vue`

```vue
<script setup lang="ts">
// 页面逻辑
</script>

<template>
  <div>GPU 拓扑</div>
</template>
```

**2. 加入侧边栏** 编辑 `src/constants/sidebar-data.ts`

```ts
{
  title: '资源',
  items: [
    { title: 'GPU 拓扑', url: '/gpu', icon: CpuIcon },   // ← 加这一行
    { title: '显存估算', url: '/memory', icon: GaugeIcon },
  ],
}
```

图标从 `@lucide/vue` 引入。改完侧边栏自动出现该项，路由也会自动生成。

---

## 目录结构

```
src/
├── lib/vllm/           核心逻辑（与 UI 完全解耦，可单独测试）
│   ├── sources.ts      数据源层：仓库名/URL 解析 + 双源取数
│   └── mapper.ts       映射引擎：config.json → vLLM 参数
├── pages/              页面（文件即路由）
│   ├── index.vue       参数解析
│   └── settings/       外观与显示设置
├── components/
│   ├── ui/             shadcn-vue 组件（按需引用）
│   ├── app-sidebar/    侧边栏
│   └── global-layout/  页面布局容器
├── constants/
│   └── sidebar-data.ts ← 侧边栏导航配置
├── stores/             Pinia（theme / sidebar-config）
└── plugins/            dayjs / i18n / nprogress / pinia / router / auto-animate
```

> 项目**不需要 `.env`**。模板原本有环境变量校验（要求 `VITE_SERVER_API_URL` 等），那是给配套后端用的；本项目纯前端直连模型仓库，相关校验代码已移除。

---

## 数据源

| 源 | 说明 |
|---|---|
| 魔搭 ModelScope | 默认优先，`Access-Control-Allow-Origin: *`，直连稳定 |
| HuggingFace | 魔搭失败时自动降级，界面会标注「数据源降级」 |

支持的输入格式：

```
Qwen/Qwen2.5-7B-Instruct
Qwen/Qwen2.5-7B-Instruct:latest
https://modelscope.cn/models/Qwen/Qwen2.5-7B-Instruct/files
https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/tree/main
ms:Qwen/Qwen2.5-7B-Instruct        hf:meta-llama/Llama-3.1-8B-Instruct
```

---

## 解析逻辑说明

参数不是拍脑袋填的，每个都能追溯到 `config.json` 的具体字段：

| vLLM 参数 | 来源字段 | 置信度 |
|---|---|---|
| `--quantization` | `quantization_config.quant_method` | 高 |
| `--dtype` | `torch_dtype`（量化模型则跳过） | 高 |
| `--max-model-len` | `max_position_embeddings` | 高 |
| `--limit-mm-per-prompt` | `architectures` + `vision_config` 识别 | 中 |
| `--trust-remote-code` | `auto_map` / `processor_class` | 中 |

几个容易踩的点，代码里已处理：

- **GQA 模型的参数量**：K/V 投影是 `hidden → kvHeads × headDim`，不能按全尺寸算，否则 Qwen2.5-7B 会算成 8.33B（实际 7.62B）
- **sliding_window 不等于上下文限制**：Llama-3 系列只在部分层用滑窗，需检查 `use_sliding_window` 是否为 true，否则会误报限制
- **量化模型不设 dtype**：vLLM 会自行处理计算精度，硬设反而可能出错

---

## 验证

```bash
npm run verify      # 转译 TS 并跑映射引擎校验
npm run verify:clean # 清理转译产物
```

脚本会拉取 6 个真实模型，校验输入格式解析与参数解析结果。覆盖 7 种输入格式（裸名、`:revision`、两种站点 URL、`ms:` / `hf:` 前缀）。

`verify` 用 `tsc` 把 TS 转成 JS 再用 Node 跑，原因是不引入 `tsx` / `ts-node` 这类额外依赖。注意脚本里带了 `--ignoreConfig` —— TypeScript 6 在命令行指定文件时若检测到 `tsconfig.json` 会报 TS5112 错误。

---

## 已知限制

- 参数量由 config 字段推算，非读取仓库实际大小，误差约 1-3%
- 权重显存只算权重本身，不含 KV cache 与激活值；建议配置为粗判
- 解析结果供参考，vLLM 各版本支持的参数存在差异，落地前请对照所用版本文档核对

---

## 致谢

界面骨架基于 [shadcn-vue-admin](https://github.com/Whbbit1999/shadcn-vue-admin)（MIT）裁剪而来，已移除登录、权限、账单、营销页等无关模块。