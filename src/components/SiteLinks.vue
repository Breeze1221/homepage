<template>
  <div class="sites">
    <div class="head">
      <Icon name="link" :size="15" />
      <span>网站列表</span>
    </div>
    <div class="grid" :style="{ gridTemplateColumns: `repeat(${primaryCols}, minmax(0, 1fr))` }">
      <a
        v-for="s in primaryLinks"
        :key="s.url"
        :href="s.url"
        target="_blank"
        rel="noopener"
        class="glass site-card"
      >
        <span class="icon"><Icon :name="s.icon" :size="22" /></span>
        <span class="meta">
          <span class="name">{{ s.name }}</span>
          <span class="desc">{{ s.desc }}</span>
        </span>
      </a>
    </div>

    <button
      v-if="moreLinks.length && !expanded"
      type="button"
      class="more-toggle"
      :aria-expanded="expanded"
      aria-controls="more-sites"
      @click="expanded = true"
    >
      <span>更多网站</span>
      <Icon name="chevron-down" :size="16" />
    </button>

    <div
      v-if="expanded && moreLinks.length"
      id="more-sites"
      class="grid more-grid"
      :style="{ gridTemplateColumns: `repeat(${moreCols}, minmax(0, 1fr))` }"
    >
      <a
        v-for="s in moreLinks"
        :key="s.url"
        :href="s.url"
        target="_blank"
        rel="noopener"
        class="glass site-card"
      >
        <span class="icon"><Icon :name="s.icon" :size="22" /></span>
        <span class="meta">
          <span class="name">{{ s.name }}</span>
          <span class="desc">{{ s.desc }}</span>
        </span>
      </a>
    </div>

    <button
      v-if="moreLinks.length && expanded"
      type="button"
      class="more-toggle"
      :aria-expanded="expanded"
      aria-controls="more-sites"
      @click="expanded = false"
    >
      <span>收起网站</span>
      <Icon name="chevron-down" :size="16" class="rotated" />
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { siteLinks } from "@/config";
import Icon from "@/components/Icon.vue";

const expanded = ref(false);
// 前六个站点固定显示为两排，后续站点收进下拉区域。
const primaryLinks = computed(() => siteLinks.slice(0, 6));
const moreLinks = computed(() => siteLinks.slice(6));

// 列数按当前分组的站点数自适应，避免空白并保持与上方卡片的宽度协调。
const columnsFor = (links) => {
  const n = links.length;
  if (n <= 3) return n || 1;
  if (n === 4) return 2;
  return 3;
};

const primaryCols = 3;
const moreCols = computed(() => columnsFor(moreLinks.value));
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 14px;
}

.grid {
  display: grid;
  gap: 16px;
  grid-auto-rows: 72px;
  align-items: stretch;
  min-width: 0;
}

.more-grid {
  margin-top: 16px;
}

@media (max-width: 980px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

/* 紧凑站点卡：方便后续添加更多网站 */
.site-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 14px 16px;
  height: 72px;
  min-height: 72px;
}

.site-card:hover {
  background: var(--glass-strong);
  border-color: var(--border-bright);
  /* frost 快照模式下元素自身的底色与边框被快照层盖住，提亮改由这两条变量驱动
     （.glass.frost-ready::after 读它们，background-color / box-shadow 都可过渡） */
  --frost-tint: var(--glass-strong);
  --frost-edge: var(--border-bright);
}

.icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #c7d2fe;
  flex-shrink: 0;
  transition: color 0.3s ease;
}

.site-card:hover .icon {
  color: var(--accent2);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: 0.9rem;
  font-weight: 600;
}

.desc {
  font-size: 0.72rem;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    background 0.3s ease,
    border-color 0.3s ease,
    color 0.3s ease;
}

.more-toggle:hover {
  background: var(--glass-strong);
  border-color: var(--border-bright);
  color: var(--text);
}

.more-toggle :deep(svg) {
  transition: transform 0.3s ease;
}

.more-toggle :deep(svg.rotated) {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .more-toggle,
  .more-toggle :deep(svg) {
    transition: none;
  }
}
</style>
