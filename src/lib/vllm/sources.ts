/**
 * 数据源适配层：把「模型名或仓库地址」统一解析成标准化的仓库标识，
 * 再从魔搭 / HuggingFace 拉取配置文件。全部走浏览器直连，无需后端代理。
 */

export type ModelSource = 'ms' | 'hf'

export interface ParsedModelRef {
  source: ModelSource
  repo: string
  revision: string
}

export interface ModelConfigBundle {
  source: ModelSource
  repo: string
  config: Record<string, any>
  generationConfig: Record<string, any> | null
  tokenizerConfig: Record<string, any> | null
  preprocessorConfig: Record<string, any> | null
  /** 请求的源失败、已降级到另一个源 */
  degraded: boolean
  attempts: Array<{ source: ModelSource, error: string }>
}

const HF_HOSTS = ['huggingface.co', 'hf.co']
const MS_HOSTS = ['modelscope.cn', 'www.modelscope.cn', 'modelscope.com']

interface SourceUrls {
  config: string
  generation: string
  tokenizer: string
  preprocessor: string
}

function buildUrls({ source, repo, revision }: ParsedModelRef): SourceUrls {
  if (source === 'ms') {
    // 魔搭的默认分支是 master 而非 main
    const base = `https://modelscope.cn/models/${repo}/resolve/master`
    return {
      config: `${base}/config.json`,
      generation: `${base}/generation_config.json`,
      tokenizer: `${base}/tokenizer_config.json`,
      preprocessor: `${base}/preprocessor_config.json`,
    }
  }
  const base = `https://huggingface.co/${repo}/resolve/${revision}`
  return {
    config: `${base}/config.json`,
    generation: `${base}/generation_config.json`,
    tokenizer: `${base}/tokenizer_config.json`,
    preprocessor: `${base}/preprocessor_config.json`,
  }
}

/**
 * 解析用户输入为标准仓库引用。
 * 支持：owner/name、owner/name:revision、完整 URL、ms: 前缀、hf: 前缀。
 */
export function parseModelInput(raw: string): ParsedModelRef {
  const input = (raw ?? '').trim()
  if (!input)
    throw new Error('请输入模型名')

  let source: ModelSource | null = null
  let rest = input

  const prefixMatch = input.match(/^(ms|modelscope|hf|huggingface)\s*:\s*(.+)$/i)
  if (prefixMatch) {
    source = /^(ms|modelscope)$/i.test(prefixMatch[1]!) ? 'ms' : 'hf'
    rest = prefixMatch[2]!.trim()
  }
  else if (/^https?:\/\//i.test(input)) {
    let url: URL
    try {
      url = new URL(input)
    }
    catch {
      throw new Error('URL 格式无法解析')
    }

    const host = url.hostname.toLowerCase()
    if (HF_HOSTS.includes(host))
      source = 'hf'
    else if (MS_HOSTS.includes(host))
      source = 'ms'
    else
      throw new Error(`暂不支持的站点：${url.hostname}`)

    const segs = url.pathname.split('/').filter(Boolean)
    // 魔搭的路径形如 /models/{owner}/{name}/files，
    // HuggingFace 形如 /{owner}/{name}/tree/{rev}。
    // 前一种 'models' 位于索引 0，因此不能用 markerIdx > 0 判断。
    const segsAfterMarker = segs[0] === 'models' ? segs.slice(1) : segs
    const markerIdx = segsAfterMarker.findIndex(s => ['tree', 'blob', 'resolve'].includes(s))
    const ownerSegs = markerIdx > 0 ? segsAfterMarker.slice(0, markerIdx) : segsAfterMarker
    if (ownerSegs.length < 2)
      throw new Error('URL 中未能识别出 owner/name')
    rest = ownerSegs.slice(0, 2).join('/')
  }
  else {
    // 去掉可能的 :revision 后缀
    rest = input.replace(/[:@][^/:@]+$/, '')
  }

  rest = rest.replace(/^\/+|\/+$/g, '')
  if (!/^[^/]+\/[^/]+$/.test(rest))
    throw new Error('模型名需形如 owner/name，例如 Qwen/Qwen2.5-7B-Instruct')

  return { source: source ?? 'ms', repo: rest, revision: 'main' }
}

class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function fetchJson(url: string, timeoutMs = 15000): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok)
      throw new HttpError(res.status === 404 ? '文件不存在' : `HTTP ${res.status}`, res.status)
    return await res.json()
  }
  finally {
    clearTimeout(timer)
  }
}

/** 拉取模型配置。魔搭优先，失败自动降级到 HuggingFace。 */
export async function fetchModelConfig(parsed: ParsedModelRef): Promise<ModelConfigBundle> {
  const order: ModelSource[] = parsed.source === 'hf' ? ['hf', 'ms'] : ['ms', 'hf']
  const attempts: Array<{ source: ModelSource, error: string }> = []

  for (const source of order) {
    const target: ParsedModelRef = { ...parsed, source }
    const urls = buildUrls(target)

    try {
      const config = await fetchJson(urls.config)

      // 可选文件缺失属正常情况，不阻断主流程
      const optional: Record<string, any> = {}
      const softFetch = async (key: keyof SourceUrls) => {
        try {
          optional[key] = await fetchJson(urls[key])
        }
        catch {
          /* 文件不存在则留空 */
        }
      }
      await Promise.all([softFetch('generation'), softFetch('tokenizer'), softFetch('preprocessor')])

      return {
        source,
        repo: target.repo,
        config,
        generationConfig: optional.generation ?? null,
        tokenizerConfig: optional.tokenizer ?? null,
        preprocessorConfig: optional.preprocessor ?? null,
        degraded: source !== parsed.source,
        attempts,
      }
    }
    catch (e) {
      attempts.push({ source, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const detail = attempts.map(a => `${a.source.toUpperCase()}: ${a.error}`).join('；')
  throw new Error(`两个源都没取到 config.json（${detail}）`)
}