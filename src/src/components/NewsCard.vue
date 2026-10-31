<template>
  <div class="glass news">
    <CardHead icon="flame" title="热点新闻" mb="12px">
      <span class="date">{{ date }}</span>
    </CardHead>
    <ol v-if="news.length" class="list" :class="{ expanded: expanded }" id="hot-news-list">
      <li v-for="(n, i) in displayedNews" :key="i">{{ n }}</li>
    </ol>
    <button
      v-if="news.length > previewCount && !expanded"
      type="button"
      class="more-toggle"
      :aria-expanded="expanded"
      aria-controls="hot-news-list"
      @click="expanded = true"
    >
      <span>更多新闻</span>
      <Icon name="chevron-down" :size="16" />
    </button>
    <button
      v-if="news.length > previewCount && expanded"
      type="button"
      class="more-toggle"
      :aria-expanded="expanded"
      aria-controls="hot-news-list"
      @click="expanded = false"
    >
      <span>收起新闻</span>
      <Icon name="chevron-down" :size="16" class="rotated" />
    </button>
    <p v-if="!news.length && failed" class="tip">新闻加载失败，稍后再试</p>
    <p v-else-if="!news.length" class="tip">正在获取今日新闻…</p>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";
import { cachedFetch } from "@/utils/cachedFetch";
import CardHead from "@/components/CardHead.vue";
import Icon from "@/components/Icon.vue";

const previewCount = 4;
const expanded = ref(false);
const news = ref([]);
const date = ref("");
const failed = ref(false);
const displayedNews = computed(() => (expanded.value ? news.value : news.value.slice(0, previewCount)));

onMounted(async () => {
  // 按天缓存：当天内刷新不重复请求
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  try {
    const data = await cachedFetch({
      key: "news_60s",
      timeout: 10000,
      isFresh: (c) => c.data.news?.length && c.data.date === today,
      loader: async (signal) => {
        const res = await fetch("https://60s.viki.moe/v2/60s", { signal }).then((r) => r.json());
        if (res.code !== 200 || !res.data?.news?.length) return null;
        return { date: res.data.date || today, news: res.data.news };
      },
    });
    if (data) {
      news.value = data.news;
      date.value = data.date;
    } else {
      failed.value = true;
    }
  } catch {
    failed.value = true;
  }
});
</script>

<style scoped>
.news {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
}

.date {
  font-size: 0.74rem;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.list {
  list-style: none;
  counter-reset: news;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list li {
  counter-increment: news;
  padding: 7px 10px;
  border-radius: 9px;
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--text-dim);
  transition: color 0.25s ease, background 0.25s ease;
}

.list li::before {
  content: counter(news, decimal-leading-zero);
  margin-right: 10px;
  font-size: 0.74rem;
  color: var(--accent2);
  font-variant-numeric: tabular-nums;
}

.list li:hover {
  color: var(--text);
  background: var(--glass-strong);
}

.list::-webkit-scrollbar {
  width: 4px;
}

.list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 99px;
}

.more-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
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

.tip {
  color: var(--text-dim);
  font-size: 0.84rem;
}

@media (prefers-reduced-motion: reduce) {
  .more-toggle,
  .more-toggle :deep(svg) {
    transition: none;
  }
}
</style>
