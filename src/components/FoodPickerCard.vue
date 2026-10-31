<template>
  <section class="glass food-picker" aria-label="今天吃什么">
    <CardHead icon="utensils" title="今天吃什么" mb="12px" />

    <div class="picker-content">
      <div class="plate" :class="{ drawing: isDrawing }" aria-hidden="true">
        <span class="food-emoji">{{ displayFood?.emoji || "🍽️" }}</span>
      </div>

      <div class="result" aria-hidden="true">
        <p class="result-label">{{ isDrawing ? "正在为你挑选…" : pickedFood ? "今天就吃这个！" : "选择困难？交给我吧" }}</p>
        <h3 class="dish-name" :class="{ placeholder: !displayFood }">
          {{ displayFood?.name || "准备开饭" }}
        </h3>
        <p class="hint">{{ isDrawing ? "美味马上揭晓" : "点击按钮，随机决定今天的美味" }}</p>
      </div>

      <button class="draw-button" type="button" :disabled="isDrawing" @click="drawFood">
        <Icon name="shuffle" :size="17" />
        <span>{{ isDrawing ? "抽取中…" : pickedFood ? "再抽一次" : "开始抽取" }}</span>
      </button>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import CardHead from "@/components/CardHead.vue";
import Icon from "@/components/Icon.vue";

const foods = [
  { name: "番茄牛腩饭", emoji: "🍅" },
  { name: "香煎鸡腿饭", emoji: "🍗" },
  { name: "红烧肉盖饭", emoji: "🥩" },
  { name: "咖喱鸡肉饭", emoji: "🍛" },
  { name: "酸菜鱼", emoji: "🐟" },
  { name: "麻婆豆腐", emoji: "🥘" },
  { name: "手工水饺", emoji: "🥟" },
  { name: "重庆小面", emoji: "🍜" },
  { name: "香菇滑鸡饭", emoji: "🍄" },
  { name: "扬州炒饭", emoji: "🍚" },
  { name: "照烧鸡排饭", emoji: "🍱" },
  { name: "牛肉拉面", emoji: "🍜" },
  { name: "韩式拌饭", emoji: "🥗" },
  { name: "咖喱牛肉", emoji: "🍛" },
  { name: "葱油拌面", emoji: "🍝" },
  { name: "烤肉饭", emoji: "🥓" },
  { name: "馄饨汤", emoji: "🥣" },
  { name: "寿司拼盘", emoji: "🍣" },
  { name: "宫保鸡丁", emoji: "🥜" },
  { name: "酸辣粉", emoji: "🌶️" },
  { name: "三鲜炒面", emoji: "🍜" },
  { name: "煲仔饭", emoji: "🍲" },
  { name: "牛肉汉堡", emoji: "🍔" },
  { name: "披萨", emoji: "🍕" },
];

const pickedFood = ref(null);
const displayFood = ref(null);
const isDrawing = ref(false);
let spinTimer;
let resultTimer;

const statusMessage = computed(() => {
  if (isDrawing.value) return "正在随机挑选今天的菜品";
  return pickedFood.value ? `今天推荐：${pickedFood.value.name}` : "点击开始抽取今天吃什么";
});

function randomFood() {
  return foods[Math.floor(Math.random() * foods.length)];
}

function clearTimers() {
  window.clearInterval(spinTimer);
  window.clearTimeout(resultTimer);
  spinTimer = undefined;
  resultTimer = undefined;
}

function drawFood() {
  if (isDrawing.value) return;

  clearTimers();
  isDrawing.value = true;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    pickedFood.value = randomFood();
    displayFood.value = pickedFood.value;
    isDrawing.value = false;
    return;
  }

  displayFood.value = randomFood();
  spinTimer = window.setInterval(() => {
    displayFood.value = randomFood();
  }, 90);
  resultTimer = window.setTimeout(() => {
    window.clearInterval(spinTimer);
    spinTimer = undefined;
    pickedFood.value = randomFood();
    displayFood.value = pickedFood.value;
    isDrawing.value = false;
    resultTimer = undefined;
  }, 1500);
}

onBeforeUnmount(clearTimers);
</script>

<style scoped>
.food-picker {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
}

.food-picker::after {
  position: absolute;
  top: -76px;
  right: -64px;
  width: 190px;
  height: 190px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(129, 140, 248, 0.16), transparent 70%);
  content: "";
  pointer-events: none;
}

.picker-content {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}

.plate {
  width: 112px;
  height: 112px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.19), rgba(255, 255, 255, 0.04) 72%);
  box-shadow: inset 0 0 0 8px rgba(255, 255, 255, 0.035), 0 12px 36px rgba(0, 0, 0, 0.12);
}

.plate.drawing {
  animation: plate-spin 0.9s ease-in-out infinite;
}

.food-emoji {
  font-size: 3.5rem;
  line-height: 1;
  filter: drop-shadow(0 5px 10px rgba(0, 0, 0, 0.18));
}

.result-label {
  margin: 0 0 4px;
  color: var(--accent2);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.dish-name {
  margin: 0;
  color: var(--text);
  font-size: clamp(1.15rem, 1.8vw, 1.55rem);
  font-weight: 700;
  line-height: 1.35;
}

.dish-name.placeholder {
  color: var(--text-dim);
}

.hint {
  margin: 5px 0 0;
  color: var(--text-dim);
  font-size: 0.78rem;
}

.draw-button {
  min-width: 164px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 20px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: linear-gradient(115deg, rgba(129, 140, 248, 0.9), rgba(34, 211, 238, 0.76));
  box-shadow: 0 8px 24px rgba(34, 211, 238, 0.16);
  color: #fff;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
}

.draw-button:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.08);
  box-shadow: 0 12px 30px rgba(34, 211, 238, 0.24);
}

.draw-button:focus-visible {
  outline: 2px solid var(--accent2);
  outline-offset: 3px;
}

.draw-button:disabled {
  opacity: 0.78;
  cursor: wait;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes plate-spin {
  0%,
  100% {
    transform: scale(1) rotate(-4deg);
  }
  50% {
    transform: scale(1.06) rotate(4deg);
  }
}

@media (max-width: 980px) {
  .food-picker {
    min-height: 320px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .plate.drawing {
    animation: none;
  }

  .draw-button {
    transition: none;
  }
}
</style>
