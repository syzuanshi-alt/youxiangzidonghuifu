import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const homeDir = process.env.HOME;
const userId = process.getuid?.();
const pythonBin = '/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const label = 'com.as-feishu-mail.workbench';
const plistPath = join(homeDir, 'Library/LaunchAgents', `${label}.plist`);

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function plist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(pythonBin)}</string>
    <string>-m</string>
    <string>http.server</string>
    <string>5174</string>
    <string>--bind</string>
    <string>127.0.0.1</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(projectRoot)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(join(projectRoot, '.runtime/workbench-static.launchd.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(join(projectRoot, '.runtime/workbench-static.launchd.err.log'))}</string>
</dict>
</plist>
`;
}

async function launchctl(args) {
  try {
    const result = await execFileAsync('/bin/launchctl', args);
    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      code: error.code,
    };
  }
}

async function main() {
  if (!homeDir || userId === undefined) {
    throw new Error('无法确定当前用户 HOME 或 uid，不能安装 LaunchAgent。');
  }

  await mkdir(dirname(plistPath), { recursive: true });
  await mkdir(join(projectRoot, '.runtime'), { recursive: true });
  await writeFile(plistPath, plist(), 'utf8');

  const domain = `gui/${userId}`;
  await launchctl(['bootout', domain, plistPath]);
  const bootstrap = await launchctl(['bootstrap', domain, plistPath]);
  if (!bootstrap.ok) {
    throw new Error(`launchctl bootstrap failed: ${bootstrap.stderr}`);
  }
  await launchctl(['enable', `${domain}/${label}`]);
  const kickstart = await launchctl(['kickstart', '-k', `${domain}/${label}`]);
  if (!kickstart.ok) {
    throw new Error(`launchctl kickstart failed: ${kickstart.stderr}`);
  }

  console.log(`Installed ${label}`);
  console.log(`Plist: ${plistPath}`);
  console.log(`Project: ${projectRoot}`);
  console.log('Workbench: http://127.0.0.1:5174/');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
