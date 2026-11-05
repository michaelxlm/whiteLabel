<template>
  <div>
    <h1>站点设置</h1>
    <p class="muted">写回 <code>data/settings.json</code>，发布后生效。</p>
    <div class="row" style="margin-bottom:1rem">
      <button class="primary" @click="save" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
      <span v-if="msg" :style="{color: msgOk ? 'var(--ok)':'var(--bad)'}">{{ msg }}</span>
    </div>

    <div v-if="loading">加载中…</div>
    <div v-else class="card">
      <div class="row">
        <div style="flex:1"><label>站点名</label><input v-model="s.siteName" /></div>
        <div style="flex:1"><label>标语 tagline</label><input v-model="s.tagline" /></div>
      </div>
      <label>简介 description</label><textarea v-model="s.description"></textarea>
      <div class="row">
        <div style="flex:1"><label>域名（License 绑定）</label><input v-model="s.domain" /></div>
        <div style="flex:1"><label>作者</label><input v-model="s.author" /></div>
        <div style="flex:1"><label>联系邮箱</label><input v-model="s.contactEmail" /></div>
      </div>
      <div class="row">
        <div style="flex:1">
          <label>语言</label>
          <select v-model="s.language"><option value="zh">zh（仅中文）</option><option value="zh-en">zh-en（中英双语）</option><option value="en">en（仅英文）</option></select>
        </div>
        <div style="flex:1">
          <label>模板</label>
          <select v-model="s.template"><option value="content">content</option><option value="tool">tool</option><option value="nav">nav</option><option value="blog">blog</option></select>
        </div>
        <div style="flex:1">
          <label>主题</label>
          <select v-model="s.theme"><option value="auto">auto</option><option value="light">light</option><option value="dark">dark</option></select>
        </div>
      </div>
      <label>备案号（可空）</label><input v-model="s.icp" />
      <label class="row" style="margin-top:.8rem"><input type="checkbox" v-model="licenseCheckOff" style="width:auto" /> 停用外网 License 软校验（完全离线自足）</label>

      <label style="margin-top:1rem">导航 nav（JSON 数组）</label>
      <textarea v-model="navRaw" style="font-family:ui-monospace,monospace"></textarea>
      <label style="margin-top:1rem">特性列表 features（JSON 数组）</label>
      <textarea v-model="featuresRaw" style="font-family:ui-monospace,monospace"></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const loading = ref(true);
const busy = ref(false);
const msg = ref('');
const msgOk = ref(false);
const full = ref({});
const s = ref({});
const navRaw = ref('[]');
const featuresRaw = ref('[]');
const licenseCheckOff = ref(false);

async function load() {
  loading.value = true;
  try {
    const d = (await api.getData('settings')) || {};
    full.value = d;
    s.value = { siteName: d.siteName, tagline: d.tagline, description: d.description, domain: d.domain, language: d.language || 'zh', template: d.template || 'content', theme: d.theme || 'auto', author: d.author, contactEmail: d.contactEmail, icp: d.icp };
    navRaw.value = JSON.stringify(d.nav || [], null, 2);
    featuresRaw.value = JSON.stringify(d.features || [], null, 2);
    licenseCheckOff.value = d.licenseCheck === false;
  } finally { loading.value = false; }
}

async function save() {
  busy.value = true; msg.value = '';
  try {
    const nav = JSON.parse(navRaw.value);
    const features = JSON.parse(featuresRaw.value);
    const payload = { ...full.value, ...s.value, nav, features };
    if (licenseCheckOff.value) payload.licenseCheck = false; else delete payload.licenseCheck;
    await api.putData('settings', payload);
    full.value = payload;
    msg.value = '已保存'; msgOk.value = true;
  } catch (e) {
    msg.value = (e instanceof SyntaxError) ? ('nav/features JSON 无效：' + e.message) : ('保存失败：' + (e.message || e));
    msgOk.value = false;
  } finally { busy.value = false; }
}
onMounted(load);
</script>
