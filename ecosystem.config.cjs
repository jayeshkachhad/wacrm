module.exports = {
  apps: [
    {
      name: 'wacrm',
      script: '.next/standalone/server.js',
      cwd: '/var/www/wacrm',
      node_args: '--env-file=.env.local',
      env: {
        PORT: 3017,
        NODE_ENV: 'production',
      },
    },
  ],
};
