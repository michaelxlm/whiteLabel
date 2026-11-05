<template>
  <div>
    <h1>{{ label }}</h1>
    <p class="muted">直接编辑内容数据；保存写回 <code>data/{{ name }}.json</code>，发布后前台生效。</p>

    <div class="row" style="margin-bottom:1rem">
      <button v-if="mode==='list'" class="primary" @click="addItem">+ 新增一条</button>
      <button @click="toggleMode">{{ mode==='list' ? 'JSON 模式' : '列表模式' }}</button>
      <button class="primary" @click="save" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
      <span v-if="msg" :style="{color: msgOk ? 'var(--ok)':'var(--bad)'}">{{ msg }}</span>
    </div>

    <div v-if="loading">加载中…</div>

    <!-- 列表模式 -->
    <div v-else-if="mode==='list'" class="card">
      <div v-for="(it, i) in items" :key="i" style="border:1px solid var(--line);border-radius:10px;padding:.8rem;margin-bottom:.8rem">
        <div class="row" style="justify-content:space-between">
          <strong>{{ it[schema.titleKey] || ('条目 ' + (i+1)) }}</strong>
          <button class="danger" @click="removeItem(i)">删除</button>
        </div>
        <div v-for="f in schema.fields" :key="f.k">
          <label>{{ f.label || f.k }}</label>
          <textarea v-if="f.type==='textarea'" v-model="it[f.k]"></textarea>
          <input v-else v-model="it[f.k]" />
        </div>
      </div>
      <p v-if="!items.length" class="muted">暂无条目，点上方「新增一条」。</p>
    </div>

    <!-- JSON 模式（navs 等嵌套结构用这个） -->
    <div v-else class="card">
      <textarea v-model="raw" style="min-height:400px;font-family:ui-monospace,monospace"></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../api.js';

const props = defineProps({ name: { type: String, required: true } });

// 每种集合的字段定义；无 list 支持的走 raw JSON。
const SCHEMAS = {
  articles: { listPath: null, label: '文章', titleKey: 'title', blank: () => ({ slug: '', title: '', date: new Date().toISOString().slice(0, 10), summary: '', content: '', tags: [] }), fields: [ { k: 'slug', label: 'slug（URL 片段）' }, { k: 'title', label: '标题' }, { k: 'date', label: '日期' }, { k: 'summary', label: '摘要', type: 'textarea' }, { k: 'content', label: '正文', type: 'textarea' } ] },
  posts: { listPath: null, label: '博文', titleKey: 'title', blank: () => ({ slug: '', title: '', date: new Date().toISOString().slice(0, 10), author: '', summary: '', content: '' }), fields: [ { k: 'slug', label: 'slug' }, { k: 'title', label: '标题' }, { k: 'date', label: '日期' }, { k: 'author', label: '作者' }, { k: 'summary', label: '摘要', type: 'textarea' }, { k: 'content', label: '正文', type: 'textarea' } ] },
  tools: { listPath: 'tools', label: '工具', titleKey: 'name', blank: () => ({ slug: '', name: '', desc: '' }), fields: [ { k: 'slug', label: 'slug' }, { k: 'name', label: '名称' }, { k: 'desc', label: '描述', type: 'textarea' } ] },
  navs: { raw: true, label: '导航分组' },
};

const schema = computed(() => SCHEMAS[props.name] || SCHEMAS.articles);
const label = computed(() => schema.value.label || props.name);

const loading = ref(true);
const busy = ref(false);
const mode = ref(schema.value.raw ? 'json' : 'list');
const data = ref(null);
const items = ref([]);
const raw = ref('');
const msg = ref('');
const msgOk = ref(false);

function readItems(d) {
  const lp = schema.value.listPath;
  if (lp == null) return Array.isArray(d) ? d : [];
  return (d && Array.isArray(d[lp])) ? d[lp] : [];
}

async function load() {
  loading.value = true;
  try {
    data.value = await api.getData(props.name);
    items.value = readItems(data.value);
    raw.value = JSON.stringify(data.value, null, 2);
  } finally { loading.value = false; }
}

function toggleMode() {
  if (mode.value === 'list') { raw.value = JSON.stringify(buildPayload(), null, 2); mode.value = 'json'; }
  else {
    try { const p = JSON.parse(raw.value); data.value = p; items.value = readItems(p); mode.value = 'list'; msg.value = ''; }
    catch (e) { msg.value = 'JSON 解析失败：' + e.message; msgOk.value = false; }
  }
}

function addItem() { items.value.push(schema.value.blank ? schema.value.blank() : {}); }
function removeItem(i) { items.value.splice(i, 1); }

function buildPayload() {
  const lp = schema.value.listPath;
  if (lp == null) return items.value;
  return { ...(data.value || {}), [lp]: items.value };
}

async function save() {
  busy.value = true; msg.value = '';
  try {
    let payload;
    if (mode.value === 'json') { payload = JSON.parse(raw.value); }
    else { payload = buildPayload(); }
    await api.putData(props.name, payload);
    data.value = payload; items.value = readItems(payload);
    msg.value = '已保存'; msgOk.value = true;
  } catch (e) {
    msg.value = (mode.value === 'json' && e instanceof SyntaxError) ? ('JSON 无效：' + e.message) : ('保存失败：' + (e.message || e));
    msgOk.value = false;
  } finally { busy.value = false; }
}

watch(() => props.name, load);
onMounted(load);
</script>
