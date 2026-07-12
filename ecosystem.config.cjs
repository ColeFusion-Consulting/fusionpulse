module.exports = {
  apps: [
    {
      name: 'fusionpulse-api',
      script: 'dist/index.js',
      cwd: '/opt/fusionpulse/api',
      env_file: '/opt/fusionpulse/.env',
      autorestart: true,
      max_restarts: 10,
      merge_logs: true,
    },
    {
      name: 'fusionpulse-runner',
      script: 'dist/worker.js',
      cwd: '/opt/fusionpulse/test-runner',
      env_file: '/opt/fusionpulse/.env',
      autorestart: true,
      max_restarts: 10,
      merge_logs: true,
    },
  ],
};
