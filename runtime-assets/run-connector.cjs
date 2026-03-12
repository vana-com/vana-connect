#!/usr/bin/env node
/**
 * run-connector.cjs — Run a data connector headlessly.
 *
 * Usage: node run-connector.cjs <connector-path> [start-url] [options]
 *
 * Options:
 *   --inputs '{"key":"val"}'  Pre-supply credentials/2FA
 *   --output <path>           Result file path (default: ~/.dataconnect/last-result.json)
 *   --pretty                  Human-readable colored output instead of JSON
 *   --runner-dir <path>       Path to playwright-runner (auto-detected if not set)
 *
 * Exit codes: 0 success, 1 error, 2 needs input, 3 legacy auth unsupported.
 *
 * Default output is line-delimited JSON on stdout:
 *   need-input, legacy-auth, result, log, error
 *
 * With --pretty, output is colored human-readable text.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const homedir = os.homedir();

const rawArgs = process.argv.slice(2);
const positional = [];
let preSuppliedInputs = {};
let pretty = false;
let outputPath = path.join(homedir, '.dataconnect', 'last-result.json');
let runnerDir = null;

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--inputs' && rawArgs[i + 1]) {
    try { preSuppliedInputs = JSON.parse(rawArgs[++i]); }
    catch (e) { console.error('Invalid --inputs JSON:', e.message); process.exit(1); }
  } else if (rawArgs[i] === '--output' && rawArgs[i + 1]) {
    outputPath = rawArgs[++i];
  } else if (rawArgs[i] === '--runner-dir' && rawArgs[i + 1]) {
    runnerDir = rawArgs[++i];
  } else if (rawArgs[i] === '--pretty') {
    pretty = true;
  } else if (!rawArgs[i].startsWith('--')) {
    positional.push(rawArgs[i]);
  }
}

const connectorPath = positional[0];
const startUrl = positional[1] || 'about:blank';

if (!connectorPath) {
  console.error('Usage: node run-connector.cjs <connector-path> [start-url] [--inputs \'{"key":"val"}\'] [--pretty]');
  process.exit(1);
}

const connectorSlug = path.basename(connectorPath, path.extname(connectorPath));
const runId = `${connectorSlug}-${Date.now()}`;
const PENDING_INPUT_PATH = path.join(homedir, '.dataconnect', `pending-input-${runId}.json`);
const INPUT_RESPONSE_PATH = path.join(homedir, '.dataconnect', `input-response-${runId}.json`);

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function prettyPrint(color, prefix, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${c.gray}${ts}${c.reset} ${color}${prefix}${c.reset} ${msg}`);
}

function emit(obj) {
  if (pretty) {
    switch (obj.type) {
      case 'need-input':
        prettyPrint(c.magenta, '[input]', obj.message);
        if (obj.schema?.properties) {
          prettyPrint(c.dim, '       ', `Fields: ${Object.keys(obj.schema.properties).join(', ')}`);
        }
        break;
      case 'legacy-auth':
        prettyPrint(c.yellow, '[auth] ', obj.message);
        break;
      case 'result': {
        const size = fs.existsSync(obj.resultPath)
          ? (fs.statSync(obj.resultPath).size / 1024).toFixed(1) + ' KB'
          : '';
        prettyPrint(c.green, '[result]', `Saved to ${obj.resultPath} ${size ? `(${size})` : ''}`);
        break;
      }
      case 'log':
        prettyPrint(c.gray, '[log]  ', obj.message || '');
        break;
      case 'error':
        prettyPrint(c.red, '[error]', obj.message || '');
        break;
    }
  } else {
    console.log(JSON.stringify(obj));
  }
}

function resolveRunnerDir() {
  if (runnerDir) {
    if (fs.existsSync(path.join(runnerDir, 'index.cjs'))) return runnerDir;
    console.error(`Runner not found at: ${runnerDir}`);
    process.exit(1);
  }

  const candidates = [
    path.join(homedir, '.dataconnect', 'playwright-runner'),
    process.env.PLAYWRIGHT_RUNNER_DIR,
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.cjs'))) return dir;
  }

  console.error('Could not find playwright-runner. Run `vana setup` first.');
  process.exit(1);
}

try { fs.unlinkSync(PENDING_INPUT_PATH); } catch {}
try { fs.unlinkSync(INPUT_RESPONSE_PATH); } catch {}

const resolvedRunnerDir = resolveRunnerDir();

if (pretty) {
  console.log(`${c.bold}run-connector${c.reset}`);
  console.log(`  ${c.cyan}Connector:${c.reset} ${connectorPath}`);
  console.log(`  ${c.cyan}URL:${c.reset}       ${startUrl}`);
  console.log(`  ${c.cyan}Output:${c.reset}    ${outputPath}`);
  console.log(`  ${c.cyan}Runner:${c.reset}    ${resolvedRunnerDir}`);
  console.log('');
}

const runner = spawn(process.execPath, ['index.cjs'], {
  cwd: resolvedRunnerDir,
  stdio: ['pipe', 'pipe', 'pipe'],
});

runner.stderr.on('data', (chunk) => {
  if (pretty) {
    for (const line of chunk.toString().split('\n').filter(l => l.trim())) {
      prettyPrint(c.dim, '[runner]', line.replace('[PlaywrightRunner] ', ''));
    }
  } else {
    process.stderr.write(chunk);
  }
});

let buffer = '';
const consumedFields = new Set();

runner.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try { handleMessage(JSON.parse(line)); }
    catch (e) { process.stderr.write('[non-json] ' + line + '\n'); }
  }
});

function handleMessage(msg) {
  switch (msg.type) {
    case 'ready':
      runner.stdin.write(JSON.stringify({
        type: 'run', runId,
        connectorPath: path.resolve(connectorPath),
        url: startUrl, headless: true, allowHeaded: false,
      }) + '\n');
      if (pretty) prettyPrint(c.green, '[ready]', 'Connected, starting connector...');
      break;

    case 'request-input': {
      const { requestId, payload } = msg;
      const schema = payload?.schema;
      const fields = schema?.properties ? Object.keys(schema.properties) : [];
      const available = fields.filter(f => f in preSuppliedInputs && !consumedFields.has(f));

      if (available.length > 0) {
        const data = {};
        for (const f of fields) {
          if (f in preSuppliedInputs && !consumedFields.has(f)) {
            data[f] = preSuppliedInputs[f];
            consumedFields.add(f);
          }
        }
        runner.stdin.write(JSON.stringify({
          type: 'input-response', runId, requestId, data,
        }) + '\n');
      } else {
        const pendingInput = {
          requestId,
          message: payload?.message || 'Input required',
          schema: schema || {},
          previousInputs: [...consumedFields],
          timestamp: new Date().toISOString(),
        };
        fs.writeFileSync(PENDING_INPUT_PATH, JSON.stringify(pendingInput, null, 2));

        emit({
          type: 'need-input',
          message: pendingInput.message,
          schema: pendingInput.schema,
          pendingInputPath: PENDING_INPUT_PATH,
          responseInputPath: INPUT_RESPONSE_PATH,
          ...(consumedFields.size > 0 && { previousInputs: pendingInput.previousInputs }),
        });

        const poll = setInterval(() => {
          if (!fs.existsSync(INPUT_RESPONSE_PATH)) {
            return;
          }

          clearInterval(poll);
          try {
            const response = JSON.parse(fs.readFileSync(INPUT_RESPONSE_PATH, 'utf-8'));
            try { fs.unlinkSync(INPUT_RESPONSE_PATH); } catch {}
            try { fs.unlinkSync(PENDING_INPUT_PATH); } catch {}

            if (response && typeof response === 'object') {
              for (const f of Object.keys(response)) consumedFields.add(f);
            }

            runner.stdin.write(JSON.stringify({
              type: 'input-response', runId, requestId, data: response,
            }) + '\n');
          } catch (e) {
            try { fs.unlinkSync(INPUT_RESPONSE_PATH); } catch {}
            try { fs.unlinkSync(PENDING_INPUT_PATH); } catch {}
            runner.stdin.write(JSON.stringify({
              type: 'input-response', runId, requestId,
              error: 'Invalid response file: ' + e.message,
            }) + '\n');
          }
        }, 1000);
      }
      break;
    }

    case 'run-completed':
      if (msg.result?.ok) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(msg.result.data, null, 2));
        emit({ type: 'result', resultPath: outputPath });
        process.exit(0);
      }
      emit({
        type: 'error',
        message: msg.result?.error || 'Connector run failed.',
      });
      process.exit(1);
      break;

    case 'run-error':
      if (String(msg.error || '').includes('showBrowser') || String(msg.error || '').includes('promptUser')) {
        emit({
          type: 'legacy-auth',
          message: 'This connector uses legacy authentication (showBrowser/promptUser) which is not supported in batch mode. Either use a migrated connector that supports requestInput, or establish a session manually first.',
        });
        process.exit(3);
      }
      emit({
        type: 'error',
        message: msg.error || 'Runner error.',
      });
      process.exit(1);
      break;
  }
}
