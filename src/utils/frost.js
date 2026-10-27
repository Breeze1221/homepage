/**
 * 毛玻璃快照（共享底版 + 区域拷贝）——canvas 版
 *
 * 背景：13 张 .glass 用实时 backdrop-filter: blur(14px) saturate(1.4)。桌面端页面
 * 不滚动，卡片背后的壁纸是静态的——滤镜输出永远不变，但任何脏区（光标/涟漪/倾斜）
 * 碰到卡片都会让 Chromium 逐帧重跑这份模糊。实测（有头 Chrome + Windows GPU Engine
 * 计数器，2560×1392@120Hz）：光标在卡片上移动 GPU 50~78%，纯空白区只有 ~15%，
 * 关掉 backdrop-filter 即回落到 ~14%。
 *
 * 方案：壁纸就绪后
 *   1. 烘焙**一张**全屏模糊底版（壁纸 cover + --bg-dim 压暗，一次 14px 高斯 + saturate）；
 *   2. 每张卡插入一个 .frost-canvas，只把底版里自己那块 drawImage 拷过来；
 *   3. 卡片撤掉实时 backdrop-filter。
 * 与「每卡各跑一次 backdrop-filter」相比，模糊次数 13→1；更关键的是**布局一变只重
 * 拷贝**（微秒级、不换渲染路径），不再需要摘类重挂那一套。
 *
 * ⚠️为什么不用 getBoundingClientRect 定位：`.rise` / `cell-in` 入场动画会把祖先或
 * 卡片自己变换掉，rect 里带着动画位移（实测 clock 静止 y=32、动画中量到 49），
 * 而 offsetParent 在运行期还会换锚点。所以定位与几何指纹共用**同一条
 * offsetParent 链累加**——纯布局量，两个污染源一起免疫，且指纹与采样原点不可能
 * 互相矛盾（上一版正是这两者用不同来源才反复重烘）。
 * 代价是取整到整数像素：卡片在视口里可能有 ≤0.5px 的采样偏移，对 14px 模糊不可辨。
 *
 * ⚠️底版只画一次、所有卡共用，所以「正在展示的那张图」必须与底版同一份像素：
 * 直接 drawImage 页面里那个 <img>（wallpaperBus.wallpaperEl）。跨域壁纸不构成障碍
 * ——canvas 只画不读，不碰 toDataURL/getImageData 就不会触发 CORS 限制。
 *
 * 边界：
 * - 仅桌面精确指针启用（hover:hover + pointer:fine）。移动端页面会滚动、卡背后的
 *   区域随之变化，维持实时 backdrop-filter。
 * - 浏览器不支持 ctx.filter（如 Safari）时整体不启用，退回实时 backdrop-filter——
 *   那是「正确但慢」的原始行为，不会出现半套状态。
 * - 极光模式（壁纸加载失败）不启用：背后的光斑还在缓慢漂移，实时取样才正确。
 * - 窗口尺寸变化后重建底版并全部重拷贝（防抖）。重建期间不摘 .frost-ready，
 *   渲染路径不切换，所以看不到变化。
 * - 面板卡片：收起时 display:none 量不到几何，只能等可见后拷贝；这里挂了一个
 *   MutationObserver 监听 .more 的类变化，在**这一帧绘制之前**同步拷贝完，
 *   所以打开面板不会先露出一帧实时模糊。
 */
import { watch } from "vue";
import { wallpaperUrl, wallpaperEl } from "./wallpaperBus";

// 压暗强度从全局 CSS 变量 --bg-dim 读（style.css :root）：与一级 .dim、二级
// .more::before 同源，三处共用一个数，卡片内外亮度永远同步。读不到才用兜底值。
const DIM_FALLBACK = 0.22;
const BLUR = 14; // 与 .glass 的 backdrop-filter 同源
const SATURATE = 1.4;
const PLATE_SCALE = 1; // 底版纹理倍率（CSS px → 纹理 px）
const CARD_SCALE = 1; // 卡片纹理倍率：内容已被 14px 模糊毁掉高频，1 倍足够，显存 /4

let plate = null; // 全屏模糊底版，所有卡共用
let lastSrc = null; // 底版用的像素源（开发期改压暗值时重建要用）
let bakedDim = null; // 底版烘焙时用的压暗强度
let ready = false; // 底版已就绪、可以拷贝
let resizeTimer = null;
let prepping = false; // 一轮「揭幕前准备」正在进行
let prepSettled = null; // 本轮准备的完成信号（App.vue 揭幕前有界 await）
let resolvePrep = null;
let gateCalled = false; // 揭幕门闩是否已经来过
let panelMo = null; // .more 的可见性观察器
let panelEl = null;
let filterOk = null; // ctx.filter 能力缓存的判定结果

// 卡片 → 上次拷贝时的几何指纹；卡片 → 画布元素
const geom = new WeakMap();
const canvases = new WeakMap();

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

/** 浏览器是否支持 canvas 的 filter（Safari 至今没有 ctx.filter） */
function ctxFilterOk() {
  if (filterOk !== null) return filterOk;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    filterOk = !!ctx && typeof ctx.filter === "string";
  } catch {
    filterOk = false;
  }
  return filterOk;
}

function eligible() {
  return (
    !!wallpaperUrl.value &&
    typeof window !== "undefined" &&
    ctxFilterOk() &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function coverSize(vw, vh, iw, ih) {
  const ir = iw / ih;
  const vr = vw / vh;
  if (ir > vr) return { dw: vh * ir, dh: vh };
  return { dw: vw, dh: vw / ir };
}

/** 视口内的布局矩形：沿 offsetParent 链累加 offsetLeft/offsetTop。
    不含任何 transform（tilt / 入场动画都跑在 transform 上），也不依赖某一个锚点
    （offsetParent 会在运行期换）。文档坐标减去滚动量即为视口坐标——桌面端本来
    不滚动，减这一下只是为了让「意外滚动」不至于整体错位。 */
function layoutPos(card) {
  let x = 0;
  let y = 0;
  for (let n = card; n; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return {
    x: x - window.scrollX,
    y: y - window.scrollY,
    w: card.offsetWidth,
    h: card.offsetHeight,
  };
}

/** 几何指纹：定位用的同一个来源，只有「位置或尺寸变了」才算变 */
function geomKey(card) {
  const p = layoutPos(card);
  return `${p.x},${p.y},${p.w},${p.h}`;
}

/** 当前压暗强度：读 :root 的 --bg-dim，非法值退回兜底 */
function readDim() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bg-dim"));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DIM_FALLBACK;
}

/** 烘焙全屏模糊底版。返回是否成功。
    压暗层放在模糊之后：黑罩是均匀的线性衰减，与「先压暗再模糊」数学等价
    （blur(c·x) = c·blur(x)，saturate 同样线性），所以一次 drawImage + 一次 fillRect
    就能得到与实时取样同源的底版。

    ⚠️已知极限：ctx.filter 在画布边界之外取的是透明黑，所以底版最外约 3σ（≈42px）
    会向内逐渐压暗。卡片离视口边缘通常 ≥28px（容器 padding），只影响最外侧那几张卡
    的外缘十几个像素、幅度 ≤2%，远低于 JND；视口窄到刚好贴住容器时才会被注意到。
    要根治得做「底版外扩 PAD + 边缘像素拉伸 + 二次拷贝」，等实测确认有必要再加。 */
function buildPlate(src) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(1, Math.round(vw * PLATE_SCALE));
  const h = Math.max(1, Math.round(vh * PLATE_SCALE));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { alpha: false });
  if (!ctx) return false;
  const { dw, dh } = coverSize(vw, vh, src.naturalWidth, src.naturalHeight);
  ctx.filter = `blur(${BLUR * PLATE_SCALE}px) saturate(${SATURATE})`;
  ctx.drawImage(
    src,
    ((vw - dw) / 2) * PLATE_SCALE,
    ((vh - dh) / 2) * PLATE_SCALE,
    dw * PLATE_SCALE,
    dh * PLATE_SCALE
  );
  ctx.filter = "none";
  const dim = readDim();
  ctx.fillStyle = `rgba(0, 0, 0, ${dim})`;
  ctx.fillRect(0, 0, w, h);
  plate = cv;
  lastSrc = src;
  bakedDim = dim;
  return true;
}

/** 把底版里属于这张卡的那一块拷进它的画布；返回是否成功 */
function paintCard(card) {
  if (!plate) return false;
  const p = layoutPos(card);
  if (p.w < 4 || p.h < 4) return false;

  let cv = canvases.get(card);
  if (cv && !cv.isConnected) cv = null; // Vue 重渲染把这颗外来节点带走了
  if (!cv) {
    cv = document.createElement("canvas");
    cv.className = "frost-canvas";
    cv.setAttribute("aria-hidden", "true");
    // 外来节点：插在最前，减少与 Vue 子节点 diff 的相互干扰；层序由 z-index 决定，
    // DOM 顺序不影响绘制
    card.insertBefore(cv, card.firstChild);
    canvases.set(card, cv);
  }

  // 画布铺到边框盒：卡片元素自身 1px 边框的内外两侧都要有模糊取样，
  // 否则那一圈会透出未模糊的原始壁纸（白边）
  const cssW = p.w + 2;
  const cssH = p.h + 2;
  const bw = Math.max(1, Math.round(cssW * CARD_SCALE));
  const bh = Math.max(1, Math.round(cssH * CARD_SCALE));
  if (cv.width !== bw || cv.height !== bh) {
    cv.width = bw;
    cv.height = bh;
  }

  const ctx = cv.getContext("2d");
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const sx = (p.x - 1) * PLATE_SCALE;
  const sy = (p.y - 1) * PLATE_SCALE;
  const sw = cssW * PLATE_SCALE;
  const sh = cssH * PLATE_SCALE;
  // 越界部分裁掉再按比例落到目标矩形（drawImage 的越界行为各引擎不完全一致，
  // 自己算一遍更可控）
  const x0 = Math.max(0, sx);
  const y0 = Math.max(0, sy);
  const x1 = Math.min(plate.width, sx + sw);
  const y1 = Math.min(plate.height, sy + sh);
  if (x1 <= x0 || y1 <= y0) return false;

  ctx.clearRect(0, 0, bw, bh);
  ctx.drawImage(
    plate,
    x0,
    y0,
    x1 - x0,
    y1 - y0,
    ((x0 - sx) / sw) * bw,
    ((y0 - sy) / sh) * bh,
    ((x1 - x0) / sw) * bw,
    ((y1 - y0) / sh) * bh
  );

  card.classList.add("frost-ready");
  return true;
}

function unpaint(card) {
  card.classList.remove("frost-ready");
  const cv = canvases.get(card);
  if (cv) {
    cv.remove();
    canvases.delete(card);
  }
  geom.delete(card);
}

function teardown() {
  ready = false;
  plate = null;
  lastSrc = null;
  bakedDim = null;
  document.querySelectorAll(".glass").forEach(unpaint);
}

/** 扫一遍：没画的画、几何变了的重拷（force 时全部重拷）。
    单卡成本是一次 offset 读加一次 drawImage，量小，可以整秒跑一次。
    重拷**不摘类**——不换渲染路径就不会有可见的变化，这正是它比上一版稳的地方。 */
function scan(force = false) {
  if (!ready || document.hidden) return;
  document.querySelectorAll(".glass").forEach((card) => {
    // 当前不可见的卡（二级面板收起时 display:none）：留着旧快照不动，等它可见
    if (card.offsetWidth < 4 || card.offsetHeight < 4) return;
    const key = geomKey(card);
    if (!force && card.classList.contains("frost-ready") && geom.get(card) === key) return;
    if (paintCard(card)) geom.set(card, key);
  });
}

/** 等布局落定：连续两次采样指纹一致就算稳。
    天气卡、RSS 列表是接口到位才插入的（v-if），它们进来会让右列推移一整行
    （实测 182px）——底版虽然与布局无关，但每张卡的取样位置必须在那之后量。
    最多等 LAYOUT_SETTLE_MS：宁可接受一次晚到的重拷（现在只花微秒级、且不换
    渲染路径，肉眼看不到），也不把揭幕无限拖住。 */
const LAYOUT_SETTLE_MS = 200;
function layoutStable() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let prev = null;
    const tick = () => {
      const sig = [...document.querySelectorAll(".glass")]
        .filter((c) => c.offsetWidth >= 4)
        .map(geomKey)
        .join("|");
      if (sig === prev || Date.now() - t0 >= LAYOUT_SETTLE_MS) return resolve();
      prev = sig;
      setTimeout(tick, 60);
    };
    tick();
  });
}

/** 取「页面正在展示的那张壁纸」的像素源。
    优先用 Background 里那个 <img>：同一份像素，连"缓存是否命中同一张图"的隐患都没有。
    （随机壁纸 API 每次 302 到不同的图，另起一次加载有可能拿到另一张。）
    读不到才自己加载一次——跨域只画不读，不需要 CORS。 */
async function resolveSource() {
  // 模板引用要等这一轮渲染落地才拿得到
  await new Promise((r) => requestAnimationFrame(r));
  const el = wallpaperEl.value;
  if (el) {
    if (!el.complete) {
      await withTimeout(
        new Promise((r) => {
          el.addEventListener("load", r, { once: true });
          el.addEventListener("error", r, { once: true });
        }),
        800
      );
    }
    if (el.naturalWidth > 0) {
      try {
        await withTimeout(el.decode ? el.decode() : Promise.resolve(), 400);
      } catch {
        // 解码失败也照样能画（已 load 过），继续
      }
      return el;
    }
  }
  const img = new Image();
  img.decoding = "async";
  await withTimeout(
    new Promise((r) => {
      img.onload = r;
      img.onerror = r;
      img.src = wallpaperUrl.value;
    }),
    1500
  );
  return img.naturalWidth > 0 ? img : null;
}

/** 揭幕前准备：等字体 → 等布局落定 → 取像素源 → 烘底版 → 逐卡拷贝 → 等这一帧
    真的画出来。整条链都跑在载入遮罩还盖着的时候，挂载瞬间的渲染路径切换
    （实时取样 → 烘焙纹理）就没人看得见。
    每一步都有上限，绝不把揭幕拖住（App.vue 那边还有 500ms 门闩兜底）。 */
function beginPrep() {
  if (prepping) return prepSettled || Promise.resolve();
  prepping = true;
  prepSettled = new Promise((r) => (resolvePrep = r));
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  withTimeout(fonts, 150)
    .then(layoutStable)
    .then(resolveSource)
    .then((src) => {
      if (!src || !eligible() || !buildPlate(src)) {
        teardown();
        return undefined;
      }
      ready = true;
      scan();
      // 拷贝这一帧必须真的画出去再放行揭幕（此刻遮罩 opacity 仍是 1）
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })
    .catch(() => {
      // 任何一步出岔子都不该拖住揭幕，门闩那边还有上限兜底
    })
    .then(() => {
      prepping = false;
      if (resolvePrep) {
        resolvePrep();
        resolvePrep = null;
      }
    });
  return prepSettled;
}

/** 揭幕门闩：App.vue 在揭幕前有界 await 它，并借此**触发**烘焙。
    无壁纸（极光兜底）或能力不支持时无事可等，直接放行 */
export function whenFrostSettled() {
  gateCalled = true;
  if (!eligible()) return Promise.resolve();
  return beginPrep();
}

/** 面板显隐观察：.more 加/去类时在**本帧绘制之前**同步补拷，
    否则打开面板会先露出最多一帧的实时模糊（旧版正是这条残留）。 */
function watchPanel() {
  const el = document.querySelector(".more");
  if (el === panelEl && panelMo) return;
  if (panelMo) {
    panelMo.disconnect();
    panelMo = null;
  }
  panelEl = el;
  if (!el) return;
  panelMo = new MutationObserver(() => {
    if (!ready) return;
    // 收起（display:none）时量不到几何，等下次可见再拷
    if (el.offsetWidth < 4) return;
    scan();
  });
  panelMo.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
}

function onResize() {
  if (!ready) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    if (!eligible()) {
      teardown();
      return;
    }
    const src = await resolveSource();
    if (!src || !buildPlate(src)) {
      teardown();
      return;
    }
    // 视口变了：底版重烘，每张卡按新几何全部重拷。全程不摘 .frost-ready，
    // 渲染路径不切换，所以拖拽窗口时看不到任何跳变
    document.querySelectorAll(".glass").forEach((c) => geom.delete(c));
    scan(true);
  }, 300);
}

export function initFrost() {
  if (typeof window === "undefined") return;
  watch(
    wallpaperUrl,
    (v) => {
      const on = !!v && eligible();
      // 桌面端从首帧起保持卡片图层提升：文字反走样在整个载入+快照挂载过程
      // 保持一致，frost 挂载瞬间不再有提升/降级带来的渲染切换
      document.body.classList.toggle("frost-desktop", on);
      if (!on) {
        teardown();
      } else if (gateCalled) {
        // 壁纸晚于揭幕才到（2.8s 极光兜底之后）：没有遮罩可藏了，就地补一次
        beginPrep();
      }
      // 门闩还没来 → 先不动，等 whenFrostSettled 在揭幕前那一刻触发
    },
    { immediate: true }
  );
  window.addEventListener("resize", onResize);
  // 开发期便利：--bg-dim 是实时生效的 CSS 变量（背景层立刻变），但底版是烘焙的，
  // 不重建就会出现「背景亮了、卡片还是旧的」这种假象。这里盯着它，变了就重烘。
  // 生产构建时这段被摇掉（import.meta.env.DEV 恒为 false）。
  if (import.meta.env.DEV) {
    setInterval(() => {
      if (!ready || !lastSrc || readDim() === bakedDim) return;
      if (buildPlate(lastSrc)) scan(true);
    }, 400);
  }
  // 兼作布局监护：没画的补、几何变了的重拷；同时等面板分包到位后挂观察器
  setInterval(() => {
    watchPanel();
    scan();
  }, 1000);
}

// 调试入口：当前底版是否就绪（无副作用）
export const frostActive = () => ready;
