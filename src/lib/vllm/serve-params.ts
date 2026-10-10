/**
 * vLLM 启动参数速查数据。
 *
 * 数据来源：vLLM 官方文档 docs.vllm.ai 与社区实测资料交叉核对。
 * 只收录生产环境真正会用到的参数，不追求覆盖全部 CLI 选项。
 *
 * 维护提示：
 * - vLLM 版本迭代快，新版参数以官方文档为准
 * - 遇到本文档与实际行为不符时，以 `vllm serve --help` 为准
 */

export type ParamGroup = 'core' | 'parallel' | 'memory' | 'scheduling' | 'quantization' | 'lora' | 'multimodal' | 'network' | 'advanced'

export interface ServeParam {
  /** 参数名，含前导 -- */
  name: string
  /** 典型取值，不写则表示为开关型参数 */
  example?: string
  /** 默认值说明 */
  default?: string
  /** 用途说明 */
  desc: string
  /** 什么场景下需要调整 */
  when?: string
}

export interface ParamGroupMeta {
  key: ParamGroup
  title: string
  summary: string
}

export const GROUPS: ParamGroupMeta[] = [
  { key: 'core', title: '核心', summary: '必填或几乎每次都要用' },
  { key: 'parallel', title: '并行与拓扑', summary: '单卡能跑就别调，显存不够时才动' },
  { key: 'memory', title: '显存与缓存', summary: 'OOM 时优先调这里' },
  { key: 'scheduling', title: '调度与吞吐', summary: '并发能力和吞吐的权衡' },
  { key: 'quantization', title: '量化', summary: '权重与 KV cache 精度' },
  { key: 'lora', title: 'LoRA', summary: '热切换适配器' },
  { key: 'multimodal', title: '多模态', summary: 'VL / 音频模型' },
  { key: 'network', title: '服务与安全', summary: '对外提供服务时必看' },
  { key: 'advanced', title: '进阶', summary: '特殊场景，出问题再查' },
]

export const PARAMS: Record<ParamGroup, ServeParam[]> = {
  core: [
    {
      name: '--model',
      example: 'Qwen/Qwen2.5-7B-Instruct',
      desc: '模型路径或 HuggingFace / 魔搭仓库 ID',
    },
    {
      name: '--max-model-len',
      example: '32768',
      default: '模型原生长度',
      desc: '最大上下文长度（单次请求能处理的总 token 数）',
      when: '显存不足时调小；需要长上下文时按需调大，不要无脑开满',
    },
    {
      name: '--dtype',
      example: 'bfloat16',
      default: 'auto',
      desc: '计算精度，如 bfloat16 / float16 / float32',
      when: '量化模型不用设，交给 vLLM 自动判断',
    },
    {
      name: '--tokenizer',
      desc: '单独指定 tokenizer 路径',
      when: '模型与 tokenizer 分开存放时需要',
    },
    {
      name: '--trust-remote-code',
      desc: '允许执行模型仓库里的自定义代码（开关型）',
      when: 'InternVL / ChatGLM 等自定义架构必须开。确认仓库可信后再开，有供应链风险',
    },
    {
      name: '--hf-token',
      desc: 'HuggingFace 访问令牌',
      when: 'Llama、Gemma 等需要登录才能下载的模型',
    },
  ],

  parallel: [
    {
      name: '--tensor-parallel-size',
      example: '2',
      default: '1',
      desc: '张量并行：把单层权重横向切到多张 GPU',
      when: '值须等于单节点 GPU 数；显存不够时的首选手段',
    },
    {
      name: '--pipeline-parallel-size',
      example: '2',
      default: '1',
      desc: '流水线并行：把不同层分配到不同节点',
      when: '跨节点部署时使用，节点内一般仍用 TP',
    },
    {
      name: '--distributed-executor-backend',
      example: 'mp',
      default: '按环境推断',
      desc: '分布式通信后端（mp / ray）',
      when: '大规模多机部署才需要显式指定',
    },
    {
      name: '--data-parallel-size',
      example: '2',
      default: '1',
      desc: '数据并行：多份完整模型副本，靠负载均衡分流',
      when: '吞吐优先、模型能放进单卡时优于 TP',
    },
    {
      name: '--enable-expert-parallel',
      desc: '启用专家并行（开关型）',
      when: 'MoE 模型（如 DeepSeek-V3）在多卡下平衡专家计算',
    },
  ],

  memory: [
    {
      name: '--gpu-memory-utilization',
      example: '0.90',
      default: '0.9',
      desc: 'vLLM 可占用的 GPU 显存比例',
      when: 'OOM 时调低（如 0.85）；显存有余可试 0.95',
    },
    {
      name: '--swap-space',
      example: '4',
      default: '4（GB）',
      desc: 'CPU offload 空间',
      when: '显存充裕可调小，显存紧张的小显存卡可调大',
    },
    {
      name: '--kv-cache-dtype',
      example: 'fp8',
      default: 'auto（跟随模型 dtype）',
      desc: 'KV cache 精度',
      when: '设 fp8 可省一半 KV cache 显存，吞吐基本不掉，但精度略降',
    },
    {
      name: '--num-gpu-blocks-override',
      desc: '手工指定 KV cache block 数',
      when: '仅在自动分配不合理时用，一般不动',
    },
    {
      name: '--cpu-offload-gb',
      example: '8',
      default: '0',
      desc: '每张 GPU offload 到 CPU 的显存大小',
      when: '兜底手段，速度损失大，优先考虑 TP',
    },
  ],

  scheduling: [
    {
      name: '--max-num-seqs',
      example: '128',
      default: '按显存推断',
      desc: '同时处理的并发序列数上限',
      when: '吞吐高但延迟波动大时调小；延迟敏感型服务调小更稳',
    },
    {
      name: '--max-num-batched-tokens',
      example: '8192',
      default: '按版本/模型推断',
      desc: '每步 forward 的 token 预算',
      when: '长 prompt 场景调大可减少分块，显存紧张时调小',
    },
    {
      name: '--block-size',
      example: '16',
      default: '16',
      desc: 'KV cache 分块粒度（token 数）',
      when: '通常不动',
    },
    {
      name: '--max-num-partial-prefills',
      desc: '同时处理的部分 prefill 块数上限',
      when: '调并发调度策略时使用',
    },
    {
      name: '--enable-chunked-prefill',
      desc: '启用分块 prefill（开关型，V1 引擎常默认开启）',
      when: '长 prompt 与短请求混跑时改善吞吐',
    },
    {
      name: '--scheduling-policy',
      example: 'priority',
      desc: '调度策略，如 fcfs / priority',
      when: '多租户需要区分服务等级时使用',
    },
    {
      name: '--preemption-mode',
      example: 'swap',
      desc: '显存不足时的抢占方式',
      when: '仅在并发过高导致抢占时调整',
    },
  ],

  quantization: [
    {
      name: '--quantization',
      example: 'awq',
      default: 'none',
      desc: '权重量化方式，如 awq / gptq / fp8 / bitsandbytes',
      when: '模型仓库本身是量化版本时指定',
    },
    {
      name: '--load-format',
      example: 'safetensors',
      desc: '权重加载格式',
      when: '默认即可，转换过的权重可指定',
    },
    {
      name: '--bitsandbytes-load-format',
      desc: 'bitsandbytes 的加载格式',
      when: '仅使用 bnb 量化时相关',
    },
  ],

  lora: [
    {
      name: '--enable-lora',
      desc: '启用 LoRA 适配器服务（开关型）',
      when: '需要热切换多个微调版本时开启',
    },
    {
      name: '--max-loras',
      example: '4',
      default: '1',
      desc: '同时驻留的 LoRA 数量',
      when: '这是一个队列，超出的会换出',
    },
    {
      name: '--max-lora-rank',
      example: '64',
      desc: '所有 LoRA 的最大 rank',
      when: '可选 8 / 16 / 32 / 64 / 128 / 256，须不小于实际使用的 rank',
    },
  ],

  multimodal: [
    {
      name: '--limit-mm-per-prompt',
      example: '{"image": 1}',
      default: '不限制',
      desc: '限制单次请求可带的模态数据数量',
      when: '多模态服务必设，防止单请求塞爆显存。纯文本场景不需要',
    },
    {
      name: '--mm-processor-kwargs',
      example: '{"max_pixels": 1003520}',
      desc: '传给多模态处理器的额外参数',
      when: '控制图像分辨率等。mrope 位置编码 vLLM 会自动处理，不要手动传空对象',
    },
    {
      name: '--media-io-kwargs',
      desc: '音视频 IO 的后端与参数',
      when: '处理音频或视频输入时使用',
    },
  ],

  network: [
    {
      name: '--host',
      example: '0.0.0.0',
      default: '0.0.0.0',
      desc: '监听地址',
      when: '只想本机访问可设 127.0.0.1，减少暴露面',
    },
    {
      name: '--port',
      example: '8000',
      default: '8000',
      desc: '监听端口',
    },
    {
      name: '--api-key',
      example: '$VLLM_API_KEY',
      desc: '访问密钥',
      when: '只要 API key 就能调用的服务必须设，否则等于裸奔',
    },
    {
      name: '--allowed-origins',
      example: 'https://example.com',
      desc: '允许的跨域来源',
      when: '浏览器端直接调用时需要配',
    },
    {
      name: '--ssl-keyfile',
      desc: 'HTTPS 证书私钥路径',
      when: '需要 HTTPS 时提供，与下面两项成对使用',
    },
    {
      name: '--root-path',
      desc: '服务挂在子路径下时的前缀',
      when: '部署在 Nginx 反代子路径时需要',
    },
  ],

  advanced: [
    {
      name: '--enforce-eager',
      desc: '禁用 CUDA graph 预编译（开关型）',
      when: '启动更快但推理更慢。Ascend NPU 上常需开启避免编译错误',
    },
    {
      name: '--seed',
      example: '0',
      default: '0',
      desc: '随机种子',
      when: '需要结果可复现时指定',
    },
    {
      name: '--disable-log-stats',
      desc: '关闭吞吐 / 请求日志（开关型）',
      when: '高 QPS 下日志开销明显时开启',
    },
    {
      name: '--enable-prefix-caching',
      desc: '启用前缀缓存（开关型）',
      when: '多轮对话 / 共享 system prompt 场景收益大',
    },
    {
      name: '--async-scheduling',
      desc: '启用异步调度',
      when: '特定 vLLM 版本的调度优化项',
    },
    {
      name: '--compilation-config',
      example: '{"mode": 3}',
      desc: 'torch.compile 配置',
      when: '调编译级别权衡启动时间与推理性能',
    },
    {
      name: '--served-model-name',
      example: 'my-model',
      desc: '对外暴露的模型名',
      when: '一个实例服务多个别名时使用',
    },
  ],
}
