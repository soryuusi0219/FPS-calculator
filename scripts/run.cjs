// この入口だけはNode.js 12でも構文解析できる形に保つ。
// 実際のVite・TypeScript・テストはNode.js 24以上で動かす。
'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const root = path.resolve(__dirname, '..');
const minimumMajor = 24;
const localNode = path.join(root, '.local', 'node', 'bin', 'node');
let runtime = process.execPath;

if (Number(process.versions.node.split('.')[0]) < minimumMajor) {
  const probe = childProcess.spawnSync(localNode, ['--version'], { encoding: 'utf8' });
  const match = /^v(\d+)\./.exec(probe.stdout || '');
  if (probe.error || probe.status !== 0 || !match || Number(match[1]) < minimumMajor) {
    console.error(
      'Node.js ' + process.versions.node + ' ではこのプロジェクトを実行できません。\n' +
      'Node.js 24以上が必要です。Linux/macOSでは、次を実行してください:\n\n' +
      '  bash scripts/setup-node.sh\n' +
      '  export PATH="$PWD/.local/node/bin:$PATH"\n' +
      '  npm ci\n' +
      '  npm run dev\n\n' +
      'nvmを使用している場合は nvm install && nvm use でも切り替えられます。'
    );
    process.exit(1);
  }
  runtime = localNode;
}

const args = process.argv.slice(3);
const command = process.argv[2];
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

function run(toolArgs) {
  const result = childProcess.spawnSync(runtime, toolArgs, {
    cwd: root,
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
      PATH: path.dirname(runtime) + path.delimiter + (process.env.PATH || ''),
    }),
  });
  if (result.error) {
    console.error('コマンドを起動できません: ' + result.error.message);
    process.exit(1);
  }
  if (result.signal) process.exit(result.signal === 'SIGINT' ? 130 : 1);
  if (result.status !== 0) process.exit(result.status || 1);
}

switch (command) {
  case 'dev': run([vite, '--host', '127.0.0.1'].concat(args)); break;
  case 'preview': run([vite, 'preview', '--host', '127.0.0.1'].concat(args)); break;
  case 'check': run([tsc, '--noEmit'].concat(args)); break;
  case 'build':
    run([tsc, '--noEmit']);
    run([vite, 'build'].concat(args));
    break;
  case 'test': {
    const files = fs.readdirSync(path.join(root, 'tests'))
      .filter(function (name) { return name.endsWith('.test.ts'); })
      .sort().map(function (name) { return path.join(root, 'tests', name); });
    run(['--test', '--test-isolation=none'].concat(args, files));
    break;
  }
  default:
    console.error('未対応のコマンド: ' + command);
    process.exit(1);
}
