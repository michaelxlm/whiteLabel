<template>
  <div>
    <h1>本地统计</h1>
    <p class="muted">数据来自你服务器上的 <code>data/stats/events.jsonl</code>，只在本机聚合，绝不外发。</p>
    <div class="row" style="margin-bottom:1rem"><button @click="load" :disabled="busy">刷新</button></div>
    <div v-if="busy">加载中…</div>
    <template v-else>
      <div class="card"><strong style="font-size:1.6rem">{{ stats.total || 0 }}</strong> 总事件</div>
      <div class="card">
        <h3>按事件</h3>
        <table class="table"><tbody>
          <tr v-for="(v,k) in stats.byEvent" :key="k"><td>{{ k }}</td><td>{{ v }}</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h3>广告位（展示/点击）</h3>
        <table class="table"><tbody>
          <tr v-for="(v,k) in stats.bySlot" :key="k"><td>{{ k }}</td><td>{{ v }}</td></tr>
        </tbody></table>
        <p v-if="!Object.keys(stats.bySlot||{}).length" class="muted">暂无广告位事件。</p>
      </div>
      <div class="card">
        <h3>近几日访问</h3>
        <table class="table"><tbody>
          <tr v-for="(v,k) in stats.days" :key="k"><td>{{ k }}</td><td>{{ v }}</td></tr>
        </tbody></table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const stats = ref({});
const busy = ref(false);
async function load() { busy.value = true; try { stats.value = await api.stats(); } finally { busy.value = false; } }
onMounted(load);
</script>
