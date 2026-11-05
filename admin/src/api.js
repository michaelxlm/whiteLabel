// api.js · 管理端与本地 server/index.js 的通信封装（Bearer 令牌存 localStorage）
const TOKEN_KEY = 'wl-admin-token';

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(''); throw Object.assign(new Error('unauthorized'), { status: 401, data }); }
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export const api = {
  login: (user, pass) => req('POST', '/admin/api/login', { user, pass }),
  logout: () => req('POST', '/admin/api/logout', {}),
  getData: (name) => req('GET', `/admin/api/${name}`).then(r => r.data),
  putData: (name, data) => req('PUT', `/admin/api/${name}`, { data }),
  stats: () => req('GET', '/admin/api/stats'),
  license: () => req('GET', '/admin/api/license'),
  publish: () => req('POST', '/admin/api/publish', {}),
  publishStatus: () => req('GET', '/admin/api/publish/status'),
};
