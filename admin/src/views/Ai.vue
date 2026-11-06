<template>
  <div>
    <h1>AI 助手</h1>
    <p class="muted">自带 Key 本地代理：请求由你的服务器直连你配置的 OpenAI 兼容端点，不经过任何第三方；写入 <code>data/ai-config.json</code>（已 gitignore），保存即生效、无需发布。</p>
    <div class="row" style="margin-bottom:1rem">
      <button class="primary" @click="save" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
      <button @click="test" :disabled="busy">{{ busy ? '测试中…' : '保存并测试连接' }}</button>
      <span v-if="msg" :style="{color: msgOk ? 'var(--ok)':'var(--bad)'}">{{ msg }}</span>
    </div>

    <div v-if="loading">加载中…</div>
    <div v-else class="card">
      <p v-if="isExample" class="muted">当前展示的是交付包模板（ai-config.example.json），保存后才写入 data/ai-config.json 生效。</p>
      <label class="row"><input type="checkbox" v-model="c.enable" style="width:auto" /> 开启 AI 助手（访客端出现悬浮气泡）</label>
      <label>baseURL（如 https://api.openai.com/v1）</label><input v-model="c.baseURL" />
      <label>apiKey（只存本地 ai-config.json）</label><input type="password" v-model="c.apiKey" />
      <label>model</label><input v-model="c.model" />
      <label>systemPrompt（人设与回答约束）</label><textarea v-model="c.systemPrompt"></textarea>
      <label>fallbackAnswer（未配模型或调用失败时的兜底回答）</label><textarea v-model="c.fallbackAnswer"></textarea>
      <label style="margin-top:1rem">faqs（JSON 数组，[{q,a},...] 关键词兜底，最多 50 条）</label>
      <textarea v-model="faqsRaw" style="font-family:ui-monospace,monospace"></textarea>
      <label style="margin-top:1rem">rateLimitPerMinute（单 IP 每分钟限流，1~120）</label>
      <input type="number" min="1" max="120" v-model.number="c.rateLimitPerMinute" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../api.js';

const loading = ref(true);
const busy = ref(false);
const msg = ref('');
const msgOk = ref(false);
const isExample = ref(false);
const c = reactive({ enable: false, baseURL: '', apiKey: '', model: '', systemPrompt: '', fallbackAnswer: '', rateLimitPerMinute: 12 });
const faqsRaw = ref('[]');

async function load() {
  loading.value = true;
  try {
    const r = await api.aiConfig();
    const d = r.data || {};
    Object.assign(c, {
      enable: !!d.enable, baseURL: d.baseURL || '', apiKey: d.apiKey || '', model: d.model || '',
      systemPrompt: d.systemPrompt || '', fallbackAnswer: d.fallbackAnswer || '',
      rateLimitPerMinute: d.rateLimitPerMinute || 12,
    });
    faqsRaw.value = JSON.stringify(d.faqs || [], null, 2);
    isExample.value = r.source === 'example';
  } finally { loading.value = false; }
}

function payload() {
  return { ...c, faqs: JSON.parse(faqsRaw.value) };
}

async function save() {
  busy.value = true; msg.value = '';
  try {
    await api.putAiConfig(payload());
    isExample.value = false;
    msg.value = '已保存（立即生效，无需发布）'; msgOk.value = true;
  } catch (e) {
    msg.value = (e instanceof SyntaxError) ? ('faqs JSON 无效：' + e.message) : ('保存失败：' + (e.message || e));
    msgOk.value = false;
  } finally { busy.value = false; }
}

async function test() {
  busy.value = true; msg.value = '';
  try {
    await api.putAiConfig(payload());
    const t = await api.aiTest();
    msg.value = t.ok ? ('连通正常：' + (t.echo || '')) : ('连通失败：' + (t.error || '未知原因'));
    msgOk.value = !!t.ok;
    isExample.value = false;
  } catch (e) {
    msg.value = (e instanceof SyntaxError) ? ('faqs JSON 无效：' + e.message) : ('测试失败：' + (e.message || e));
    msgOk.value = false;
  } finally { busy.value = false; }
}
onMounted(load);
</script>
