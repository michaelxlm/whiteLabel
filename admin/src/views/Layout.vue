<template>
  <div class="shell">
    <aside class="side">
      <h2>管理端</h2>
      <nav>
        <router-link to="/dashboard">本地统计</router-link>
        <router-link to="/content/articles">文章</router-link>
        <router-link to="/content/tools">工具</router-link>
        <router-link to="/content/navs">导航</router-link>
        <router-link to="/content/posts">博文</router-link>
        <router-link to="/ads">广告位</router-link>
        <router-link to="/settings">站点设置</router-link>
        <router-link to="/license">License</router-link>
        <router-link to="/publish">发布构建</router-link>
      </nav>
      <div style="margin-top:1.5rem"><button @click="logout">退出登录</button></div>
    </aside>
    <main class="main">
      <router-view />
      <!-- 水印层①：仅登录管理员可见，不进公开页 -->
      <footer class="foot" v-if="licensee">Licensee: {{ licensee }} · {{ orderNo }}</footer>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, setToken } from '../api.js';

const router = useRouter();
const licensee = ref('');
const orderNo = ref('');

onMounted(async () => {
  try {
    const r = await api.license();
    licensee.value = (r.license && r.license.licensee) || '';
    orderNo.value = (r.license && r.license.orderNo) || '';
  } catch (e) { /* 水印读取失败不影响管理端 */ }
});

function logout() {
  api.logout().finally(() => { setToken(''); router.push('/login'); });
}
</script>
