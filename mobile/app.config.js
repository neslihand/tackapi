// App config: app.json as is, plus the EXPO_PUBLIC_ settings from the one .env at the repository root, shared with the
// backend, the site and the panels (see ../.env.example). Expo itself reads .env files only in this folder; a value set
// there or in the shell still wins. Only EXPO_PUBLIC_ names are taken, so the backend's secrets never reach the bundle.
const fs = require('fs');
const path = require('path');

function rootEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^(?:export\s+)?(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(raw.trim());
    if (!match) continue;
    const value = match[2].trim();
    const quoted = value.length >= 2 && value[0] === value[value.length - 1] && `"'`.includes(value[0]);
    values[match[1]] = quoted ? value.slice(1, -1) : value.split('#')[0].trim();
  }
  return values;
}

for (const [key, value] of Object.entries(rootEnv())) if (process.env[key] === undefined) process.env[key] = value;

module.exports = ({ config }) => config;
