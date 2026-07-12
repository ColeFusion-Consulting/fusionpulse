// PM2 does not actually support an `env_file` config key (it's silently
// ignored — PM2 only reads the `env` object). We parse /opt/fusionpulse/.env
// ourselves at config-load time and inject it into each app's `env`.
const fs = require('fs');

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const sharedEnv = loadEnvFile('/opt/fusionpulse/.env');

module.exports = {
  apps: [
    {
      name: 'fusionpulse-api',
      script: 'dist/index.js',
      cwd: '/opt/fusionpulse/api',
      env: sharedEnv,
      autorestart: true,
      max_restarts: 10,
      merge_logs: true,
    },
    {
      name: 'fusionpulse-runner',
      script: 'dist/worker.js',
      cwd: '/opt/fusionpulse/test-runner',
      env: sharedEnv,
      autorestart: true,
      max_restarts: 10,
      merge_logs: true,
    },
  ],
};
