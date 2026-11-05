<template>
  <div>
    <h1>License 状态</h1>
    <p class="muted">一次性买断、永不过期。以下为本地授权信息与最近一次软校验结果。</p>
    <div class="row" style="margin-bottom:1rem">
      <button @click="load" :disabled="busy">重新校验</button>
      <span v-if="check" :class="badgeClass">{{ badgeText }}</span>
    </div>

    <div v-if="loading">加载中…</div>
    <div v-else class="card">
      <div class="row"><div style="flex:1"><label>Key</label><input :value="lic.key" readonly /></div>
        <div style="flex:1"><label>状态</label><input :value="lic.status || 'active'" readonly /></div></div>
      <div class="row"><div style="flex:1"><label>被授权人</label><input :value="lic.licensee" readonly /></div>
        <div style="flex:1"><label>绑定域名</label><input :value="lic.domain" readonly /></div></div>
      <div class="row"><div style="flex:1"><label>模板</label><input :value="lic.template" readonly /></div>
        <div style="flex:1"><label>订单号</label><input :value="lic.orderNo" readonly /></div></div>
      <p class="muted" style="margin-top:1rem">
        软校验为尽力而为：即使显示「待核验」，站点与管理端仍照常可用；如需彻底离线，请在站点设置中停用外网校验。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';

const loading = ref(true);
const busy = ref(false);
const lic = ref({});
const check = ref(null);

const badgeText = computed(() => {
  if (!check.value) return '';
  if (check.value.checked === false) return '未校验 / 离线';
  return check.value.valid ? '校验通过' : 'License 待核验（不影响使用）';
});
const badgeClass = computed(() => {
  if (!check.value) return '';
  if (check.value.checked === false) return 'badge warn';
  return check.value.valid ? 'badge ok' : 'badge warn';
});

async function load() {
  busy.value = true;
  try {
    const r = await api.license();
    lic.value = r.license || {};
    check.value = r.check || null;
  } finally { loading.value = false; busy.value = false; }
}
onMounted(load);
</script>
