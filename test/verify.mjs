/**
 * 映射引擎验证。
 *
 * 直接运行：npm run verify
 * 等价于：
 *   tsc src/lib/vllm/sources.ts src/lib/vllm/mapper.ts \
 *       --target es2022 --module esnext --outDir test/.build \
 *       --skipLibCheck --ignoreConfig
 *   node test/verify.mjs
 *
 * 不引入 tsx / ts-node，用 tsc 转译即可。
 * --ignoreConfig 必需：TypeScript 6 在命令行指定文件时若检测到 tsconfig.json 会报 TS5112。
 */
import { buildVllmConfig, renderCommand } from './.build/mapper.js'
import { fetchModelConfig, parseModelInput } from './.build/sources.js'

// --- 输入格式解析 ---
const PARSE_CASES = [
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct:latest',
  'https://modelscope.cn/models/Qwen/Qwen2.5-7B-Instruct/files',
  'https://huggingface.co/Qwen/Qwen3-8B/tree/main',
  'https://huggingface.co/Qwen/Qwen3-8B',
  'hf:meta-llama/Llama-3.1-8B-Instruct',
  'ms:Qwen/Qwen2.5-7B-Instruct',
]

const EXPECT = 'Qwen/Qwen2.5-7B-Instruct'

console.log('--- 输入格式解析 ---')
let failed = 0
for (const c of PARSE_CASES) {
  try {
    const p = parseModelInput(c)
    const valid = /^[^/]+\/[^/]+$/.test(p.repo) && !p.repo.startsWith('models/')
    const ok = valid && (c.includes('Llama') || c.includes('Qwen'))
    if (!ok)
      failed++
    console.log(`${ok ? '✓' : '✗'} ${c}\n    → ${p.source} / ${p.repo}`)
  }
  catch (e) {
    console.log(`✗ ${c}\n    → 解析失败: ${e.message}`)
    failed++
  }
}

// --- 映射引擎 ---
const CASES = [
  { repo: 'Qwen/Qwen2.5-7B-Instruct', expect: { dtype: 'bfloat16', ctx: 32768, quant: null } },
  { repo: 'Qwen/Qwen2.5-7B-Instruct-AWQ', expect: { quant: 'awq', dtype: null } },
  { repo: 'Qwen/Qwen2.5-7B-Instruct-GPTQ-Int4', expect: { quant: 'gptq' } },
  { repo: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', expect: { ctx: 131072, dtype: 'bfloat16' } },
  { repo: 'Qwen/Qwen3-8B', expect: { dtype: 'bfloat16', ctx: 40960 } },
  { repo: 'Qwen/Qwen2.5-VL-7B-Instruct', expect: { multimodal: true, ctx: 128000 } },
]

console.log('\n--- 映射引擎（拉真实 config）---')
for (const c of CASES) {
  try {
    const data = await fetchModelConfig(parseModelInput(c.repo))
    const r = buildVllmConfig(data)
    const got = {
      dtype: r.params.find(p => p.name === '--dtype')?.value ?? null,
      ctx: r.contextLength,
      quant: r.quant?.method ?? null,
      multimodal: r.modalities.isMultimodal,
    }
    const issues = Object.entries(c.expect).filter(([k, v]) => got[k] !== v)
    issues.forEach(() => failed++)
    console.log(`${issues.length ? '✗' : '✓'} ${c.repo} [${data.source}] 参数量 ${r.paramsBillion}B`)
    issues.forEach(([k, v]) => console.log(`    ! ${k}: 期望 ${v}，实际 ${got[k]}`))
    if (process.env.VERBOSE) {
      console.log(`    ${renderCommand(r.params, data.repo).replace(/\n\s*/g, ' ')}`)
    }
  }
  catch (e) {
    console.log(`✗ ${c.repo} 取数失败: ${e.message}`)
    failed++
  }
}

// --- 命令渲染：shell 引号安全性 ---
console.log('\n--- 命令渲染（shell 转义）---')
{
  const cases = [
    {
      name: 'JSON 参数须用单引号包裹',
      params: [{ name: '--limit-mm-per-prompt', value: '{"image": 1}', from: '', confidence: 'medium' }],
      expect: `--limit-mm-per-prompt='{"image": 1}'`,
    },
    {
      name: '含空格的路径须加引号',
      params: [{ name: '--model', value: '/data/my models/qwen', from: '', confidence: 'high' }],
      expect: '--model="/data/my models/qwen"',
    },
    {
      name: '普通值不加引号',
      params: [{ name: '--max-model-len', value: '32768', from: '', confidence: 'high' }],
      expect: '--max-model-len=32768',
    },
    {
      name: 'flag 型参数不带等号',
      params: [{ name: '--trust-remote-code', value: null, from: '', confidence: 'medium', flag: true }],
      expect: '--trust-remote-code',
    },
  ]

  for (const c of cases) {
    const out = renderCommand(c.params, 'X')
    const ok = out.includes(c.expect)
    if (!ok)
      failed++
    console.log(`${ok ? '✓' : '✗'} ${c.name}`)
    if (!ok) {
      console.log(`    期望包含: ${c.expect}`)
      console.log(`    实际输出: ${out.replace(/\n\s*/g, ' ')}`)
    }
  }
}

console.log(failed ? `\n✗ ${failed} 处不符` : '\n✓ 全部通过')
process.exit(failed ? 1 : 0)