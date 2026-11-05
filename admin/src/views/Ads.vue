<template>
  <div>
    <h1>广告位</h1>
    <p class="muted">只提供框架挂点，内容由你自填（不含任何第三方广告库存/优惠券）。写回 <code>data/ads.json</code>。</p>
    <div class="row" style="margin-bottom:1rem">
      <button class="primary" @click="addSlot">+ 新增广告位</button>
      <button class="primary" @click="save" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
      <span v-if="msg" :style="{color: msgOk ? 'var(--ok)':'var(--bad)'}">{{ msg }}</span>
    </div>

    <div v-if="loading">加载中…</div>
    <div v-else>
      <div v-for="(s, i) in slots" :key="i" class="card">
        <div class="row" style="justify-content:space-between"><strong>{{ s.id || ('slot ' + (i+1)) }}</strong><button class="danger" @click="slots.splice(i,1)">删除</button></div>
        <div class="row">
          <div style="flex:1"><label>挂点 id</label><input v-model="s.id" placeholder="如 top-banner" /></div>
          <div style="flex:1">
            <label>页面</label>
            <select v-model="s.page"><option v-for="p in PAGES" :key="p" :value="p">{{ p }}</option></select>
          </div>
          <div style="flex:1">
            <label>类型</label>
            <select v-model="s.type"><option value="text">text</option><option value="card">card</option></select>
          </div>
        </div>
        <label>标题</label><input v-model="s.title" />
        <label>文案</label><textarea v-model="s.text"></textarea>
        <div class="row">
          <div style="flex:1"><label>落地链接</label><input v-model="s.url" placeholder="https://…" /></div>
          <div style="flex:1"><label>图片</label><input v-model="s.image" placeholder="图片地址（可空）" /></div>
        </div>
      </div>
      <p v-if="!slots.length" class="muted">暂无广告位。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const PAGES = [ 'all', 'home', 'list', 'article', 'tool', 'post', 'blog', 'nav' ];
const slots = ref([]);
const loading = ref(true);
const busy = ref(false);
const msg = ref('');
const msgOk = ref(false);

async function load() {
  loading.value = true;
  try { const d = await api.getData('ads'); slots.value = (d && Array.isArray(d.slots)) ? d.slots : []; }
  finally { loading.value = false; }
}
function addSlot() { slots.value.push({ id: '', page: 'all', type: 'text', title: '', text: '', url: '', image: '' }); }
async function save() {
  busy.value = true; msg.value = '';
  try { await api.putData('ads', { slots: slots.value }); msg.value = '已保存'; msgOk.value = true; }
  catch (e) { msg.value = '保存失败：' + (e.message || e); msgOk.value = false; }
  finally { busy.value = false; }
}
onMounted(load);
</script>
