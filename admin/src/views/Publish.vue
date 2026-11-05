<template>
  <div>
    <h1>发布构建</h1>
    <p class="muted">保存内容后点这里重新生成静态站（内部执行 <code>scripts/build.js</code> → <code>dist/</code>）。发布时会顺带做一次 License 软校验（不阻断）。</p>
    <div class="row" style="margin-bottom:1rem">
      <button class="primary" @click="doPublish" :disabled="busy || status.running">{{ busy || status.running ? '构建中…' : '开始构建' }}</button>
      <span v-if="licNote" :class="licOk ? 'badge ok' : 'badge warn'">{{ licNote }}</span>
    </div>

    <div v-if="status.running" class="card">构建进行中…</div>
    <div v-if="status.log" class="card">
      <label>构建日志</label>
      <pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:.85rem;margin:0">{{ status.log }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { api } from '../api.js';

const busy = ref(false);
const licNote = ref('');
const licOk = ref(false);
const status = reactive({ running: false, log: '' });
let timer = null;

async function refresh() {
  try { const s = await api.publishStatus(); status.running = s.running; status.log = s.log || ''; }
  catch (e) { /* 忽略轮询错误 */ }
}

async function doPublish() {
  busy.value = true; licNote.value = '';
  try {
    const r = await api.publish();
    licOk.value = !!(r.license && r.license.valid);
    licNote.value = (r.license && r.license.checked === false) ? '离线，未校验' : (r.license && r.license.valid ? 'License 校验通过' : 'License 待核验（不影响发布）');
    startPolling();
  } catch (e) {
    licNote.value = '发布失败：' + (e.message || e); licOk.value = false;
  } finally { busy.value = false; }
}

function startPolling() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    await refresh();
    if (!status.running) { clearInterval(timer); timer = null; }
  }, 1500);
}

onMounted(refresh);
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>
