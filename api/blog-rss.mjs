/**
 * GET /blog-rss → 博客 RSS（原样转发，由 BlogCard 在浏览器里解析）
 *
 * 为什么走函数而不是 vercel.json 的 rewrite：rewrite 的 destination 只能写死完整 URL，
 * 域名就会焊在配置文件里——模板仓库分发出去会带着站长的博客地址。走函数后目标地址
 * 只存在于 `src/config.js` 的 `blogRss`，换博客只改那一行。
 *
 * 白名单与其他函数一致（同源为主，见 lib/http.mjs）。前端固定请求同源 `/blog-rss`，
 * 由 vercel.json 转到本文件，因此正常访问一定带 Referer、能通过同源判定。
 */
import { corsHeaders } from '../lib/http.mjs'
import { siteConfig } from '../src/config.js'

const RSS = (siteConfig.blogRss || '').trim()

// 上游不给 UA 会 403 的博客不少（Cloudflare 默认盾就会拦空 UA 的 Node 请求）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const TIMEOUT_MS = 8000

export async function GET(request) {
  const cors = corsHeaders(request)
  if (!cors) return new Response('来源不在白名单', { status: 403 })

  if (!RSS) {
    // 没配就别假装成功：前端拿到非 XML 会走进「去博客看看 →」兜底
    return new Response('未配置 blogRss（见 src/config.js）', {
      status: 404,
      headers: cors,
    })
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const upstream = await fetch(RSS, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
    })
    if (!upstream.ok) {
      return new Response(`RSS 源返回 ${upstream.status}`, { status: 502, headers: cors })
    }
    // 原样透传正文，不做 XML 解析——博客的 feed 格式（RSS 2.0 / Atom）差异由前端
    // DOMParser 统一吃掉，函数里再拆一次只会多一个出错的地方
    const body = await upstream.text()
    const headers = new Headers(cors)
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/xml; charset=utf-8')
    // 博客一天也更新不了几次，缓存 10 分钟足够；stale-while-revalidate 让回源不阻塞访客
    headers.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800')
    return new Response(body, { status: 200, headers })
  } catch (e) {
    const reason = e?.name === 'AbortError' ? `超时 ${TIMEOUT_MS}ms` : e?.message || '未知错误'
    console.warn(`[blog-rss] 拉取失败 ${RSS}：${reason}`)
    return new Response(`RSS 拉取失败：${reason}`, { status: 504, headers: cors })
  } finally {
    clearTimeout(timer)
  }
}
