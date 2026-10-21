import fs from 'node:fs';

const confPath = 'src-tauri/tauri.conf.json';
if (fs.existsSync(confPath)) {
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
  if (conf.plugins && conf.plugins.updater) {
    delete conf.plugins.updater;
    fs.writeFileSync(confPath, JSON.stringify(conf, null, 2), 'utf8');
    console.log('Successfully stripped updater plugin from mobile tauri.conf.json');
  }
}
