// PM2 进程管理示例：pm2 start deploy/ecosystem.config.js
// 管理端 Node 服务（负责埋点落盘、内容读写、触发构建），静态 dist 可由 nginx 或本服务直接提供。
module.exports = {
  apps: [
    {
      name: 'white-label',
      script: 'server/index.js',
      cwd: __dirname + '/..',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
      },
      // 构建是短性子进程，主服务常驻即可；日志按天滚动交给 logrotate
      max_memory_restart: '200M',
    },
  ],
};
