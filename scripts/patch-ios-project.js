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

const pbxFiles = findPbx('src-tauri/gen/apple');
console.log(`Found ${pbxFiles.length} project.pbxproj files to patch.`);

for (const file of pbxFiles) {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Disable user script sandboxing cleanly
  content = content.replaceAll('ENABLE_USER_SCRIPT_SANDBOXING = YES;', 'ENABLE_USER_SCRIPT_SANDBOXING = NO;');

  // 2. Set code signing to manual everywhere
  content = content.replaceAll('CODE_SIGN_STYLE = Automatic;', 'CODE_SIGN_STYLE = Manual;');
  content = content.replaceAll('ProvisioningStyle = Automatic;', 'ProvisioningStyle = Manual;');

  // 3. Clear any existing DevelopmentTeam assignments
  content = content.replace(/DevelopmentTeam = [^;]*;/g, 'DevelopmentTeam = "";');

  // 4. Inject unsigned overrides into buildSettings blocks
  content = content.replaceAll(
    'buildSettings = {',
    'buildSettings = {\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;\n\t\t\t\tCODE_SIGNING_REQUIRED = NO;\n\t\t\t\tCODE_SIGN_IDENTITY = "";'
  );

  fs.writeFileSync(file, content, 'utf8');
  console.log('Cleanly updated build settings in:', file);
}
