<template>
  <div class="login">
    <div class="card">
      <h1>站点管理端</h1>
      <p class="muted">登录以管理内容、广告位与发布构建。</p>
      <label>账号</label>
      <input v-model="user" @keyup.enter="submit" autocomplete="username" />
      <label>密码</label>
      <input v-model="pass" type="password" @keyup.enter="submit" autocomplete="current-password" />
      <div style="margin-top:1rem">
        <button class="primary" :disabled="busy" @click="submit">{{ busy ? '登录中…' : '登录' }}</button>
      </div>
      <p v-if="err" style="color:var(--bad)">{{ err }}</p>
      <p v-else-if="pending" class="badge warn" style="margin-top:.8rem">License 待核验（不影响使用）</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, setToken } from '../api.js';

const router = useRouter();
const user = ref('admin');
const pass = ref('');
const busy = ref(false);
const err = ref('');
const pending = ref(false);

async function submit() {
  busy.value = true; err.value = '';
  try {
    const r = await api.login(user.value, pass.value);
    setToken(r.token);
    pending.value = r.license && r.license.valid === false;
    router.push('/dashboard');
  } catch (e) {
    err.value = e.status === 401 ? '账号或密码错误' : (e.message || '登录失败');
  } finally {
    busy.value = false;
  }
}
</script>
