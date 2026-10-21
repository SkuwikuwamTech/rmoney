import fs from 'node:fs';
import path from 'node:path';

function findPbx(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      results.push(...findPbx(full));
    } else if (file === 'project.pbxproj') {
      results.push(full);
    }
  }
  return results;
}

const homeDir = process.env.HOME || process.env.USERPROFILE || '';
const pbxFiles = findPbx('src-tauri/gen/apple');

console.log(`Found ${pbxFiles.length} project.pbxproj files to patch.`);

for (const file of pbxFiles) {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Inject Cargo and Node PATH into the Xcode Build Rust Code script
  const envHeader = `#!/bin/sh\\nexport PATH="${homeDir}/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:\\$PATH"\\nsource "${homeDir}/.cargo/env" 2>/dev/null || true\\n`;
  content = content.replace(/(shellScript = ")(#!\/bin\/sh\\n)?/g, `$1${envHeader}`);

  // 2. Disable Xcode 15+ User Script Sandboxing so Cargo can access the toolchain
  content = content.replace(/ENABLE_USER_SCRIPT_SANDBOXING = YES;/g, 'ENABLE_USER_SCRIPT_SANDBOXING = NO;');

  // 3. Ensure Manual signing and clear team/identity requirements
  content = content.replace(/CODE_SIGN_STYLE = Automatic;/g, 'CODE_SIGN_STYLE = Manual;');
  content = content.replace(/DevelopmentTeam = [^;]*;/g, 'DevelopmentTeam = "";');
  content = content.replace(/CODE_SIGN_IDENTITY = [^;]*;/g, 'CODE_SIGN_IDENTITY = "";');

  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully patched Xcode project:', file);
}
