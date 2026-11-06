// router.js · 管理端路由（history base 由 vite base=/admin/ 决定）
import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api.js';
import Login from './views/Login.vue';
import Layout from './views/Layout.vue';
import Dashboard from './views/Dashboard.vue';
import Content from './views/Content.vue';
import Ads from './views/Ads.vue';
import Settings from './views/Settings.vue';
import Ai from './views/Ai.vue';
import License from './views/License.vue';
import Publish from './views/Publish.vue';

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
  {
    path: '/', component: Layout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: Dashboard },
      { path: 'content/:name', component: Content, props: true },
      { path: 'ads', component: Ads },
      { path: 'settings', component: Settings },
      { path: 'ai', component: Ai },
      { path: 'license', component: License },
      { path: 'publish', component: Publish },
    ],
  },
];

const router = createRouter({ history: createWebHistory('/admin/'), routes });

router.beforeEach(to => {
  if (to.meta.public) return true;
  if (!getToken()) return '/login';
  return true;
});

export default router;
