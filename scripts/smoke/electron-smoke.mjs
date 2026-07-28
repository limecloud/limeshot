import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { _electron as electron } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const businessBinary = resolve(root, 'rust', 'target', 'release', process.platform === 'win32' ? 'business-server.exe' : 'business-server');
if (!existsSync(businessBinary)) throw new Error(`缺少 release Rust companion: ${businessBinary}`);

const manifest = JSON.parse(await readFile(resolve(root, 'resources', 'codex', 'manifest.v1.json'), 'utf8'));
const platformKey = currentPlatformKey();
const release = manifest.releases.find((candidate) => candidate.platformKey === platformKey);
if (!release) throw new Error(`Codex manifest 尚未声明当前平台: ${platformKey}`);
const defaultCodexBinary = resolve(root, 'rust', 'target', 'codex-release', manifest.version, release.executableName);
const codexBinary = process.env.LIMESHOT_CODEX_BIN ?? defaultCodexBinary;
if (!isAbsolute(codexBinary) || !existsSync(codexBinary)) throw new Error(`缺少固定 Codex ${manifest.version}: ${codexBinary}`);
const executableSha256 = createHash('sha256').update(await readFile(codexBinary)).digest('hex');
if (executableSha256 !== release.executableSha256) throw new Error(`Codex executable SHA-256 不匹配: ${codexBinary}`);
const version = spawnSync(codexBinary, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== `codex-cli ${manifest.version}`) {
  throw new Error(`Codex 版本不匹配: ${version.stdout.trim() || version.stderr.trim()}`);
}

const fixture = await startResponsesFixture();
const userData = await mkdtemp(join(tmpdir(), 'limeshot-gate-b-'));
const workspace = join(userData, 'workspace');
const projectName = 'Gate B project';
const newProjectName = '新项目';
const screenshotDir = process.env.LIMESHOT_SMOKE_SCREENSHOT_DIR;
let application;

try {
  await mkdir(workspace, { recursive: true });
  await writeCodexConfig(join(userData, 'codex'), fixture.baseUrl);
  await seedProject({ businessBinary, userData, workspace, projectName });

  const launchEnv = { ...process.env };
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete launchEnv[key];
  launchEnv.NO_PROXY = '127.0.0.1,localhost';
  launchEnv.no_proxy = launchEnv.NO_PROXY;
  const electronLaunchOptions = {
    args: [root, `--user-data-dir=${userData}`],
    cwd: root,
    env: {
      ...launchEnv,
      LIMESHOT_BUSINESS_BIN: businessBinary,
      LIMESHOT_CODEX_BIN: codexBinary,
      LIMESHOT_CODEX_HOME: join(userData, 'codex'),
      LIMESHOT_ELECTRON_SMOKE: '1',
    },
  };
  application = await launchElectron(electronLaunchOptions);
  let page = await application.firstWindow();
  await page.locator('[data-testid="runtime-status"][data-state="ready"]').waitFor({ timeout: 20_000 });
  const foundationEvidence = await page.evaluate(() => ({
    hasPreload: Boolean(window.limeShot?.foundation?.read),
    profileCount: document.querySelectorAll('[data-testid^="profile-"]').length,
  }));
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: join(screenshotDir, '01-home.png') });
  }
  await page.locator('.project-nav-item', { hasText: projectName }).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });

  const composer = page.locator('.composer-field textarea');
  await composer.fill('Read this project, then confirm the result.');
  await composer.press('Enter');
  await page.locator('.agent-activity[data-tools*="project_read"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.locator('.agent-activity[data-tools*="plan_create"]').waitFor({ state: 'attached', timeout: 60_000 });
  const activityTools = await page.locator('.agent-activity').getAttribute('data-tools') ?? '';
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Gate B complete' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-turn[data-status="completed"]').waitFor({ timeout: 60_000 });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-conversation.png') });
  await page.getByTitle('打开项目详情').click();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-details.png') });
  const approveButton = page.getByRole('button', { name: '批准计划' });
  await approveButton.waitFor({ timeout: 20_000 });
  await approveButton.click();
  const receipt = page.locator('[data-testid="approval-receipt"]');
  await receipt.waitFor({ timeout: 20_000 });
  const approvalReceiptId = await receipt.getAttribute('data-approval-id') ?? '';
  await page.locator('.plan-panel > header > span[data-state="approved"]').waitFor({ timeout: 20_000 });

  await application.evaluate(({ dialog }) => {
    globalThis.__limeshotDialogCallCount = 0;
    dialog.showOpenDialog = async () => {
      globalThis.__limeshotDialogCallCount += 1;
      throw new Error('新建项目不得打开系统目录选择器');
    };
  });
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.locator('.project-nav-item', { hasText: newProjectName }).waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  if (await page.locator('.app-action-error').count() !== 0) {
    throw new Error(`新建项目出现 GUI 错误: ${await page.locator('.app-action-error').allTextContents()}`);
  }
  const projectDialogCallCount = await application.evaluate(() => globalThis.__limeshotDialogCallCount ?? -1);
  if (projectDialogCallCount !== 0) throw new Error(`新建项目错误调用系统目录选择器 ${projectDialogCallCount} 次`);

  await application.close();
  application = await launchElectron(electronLaunchOptions);
  page = await application.firstWindow();
  await page.locator('[data-testid="runtime-status"][data-state="ready"]').waitFor({ timeout: 20_000 });
  await page.locator('.project-nav-item', { hasText: newProjectName }).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  if (await page.locator('.app-action-error').count() !== 0) {
    throw new Error(`冷启动恢复新项目出现 GUI 错误: ${await page.locator('.app-action-error').allTextContents()}`);
  }
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '04-new-project-after-restart.png') });
  await page.locator('.project-nav-item', { hasText: projectName }).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Gate B complete' }).waitFor({ timeout: 60_000 });
  await page.getByTitle('打开项目详情').click();
  await page.locator('.plan-panel > header > span[data-state="approved"]').waitFor({ timeout: 20_000 });

  const semanticEvidence = await page.evaluate(async ({ seededName, createdName }) => {
    const project = (await window.limeShot.project.list()).find((candidate) => candidate.name === seededName);
    if (!project) throw new Error('Gate B project is missing from semantic preload API');
    const createdProject = (await window.limeShot.project.list()).find((candidate) => candidate.name === createdName);
    if (!createdProject) throw new Error('New project is missing from semantic preload API');
    const [history, plans] = await Promise.all([
      window.limeShot.agent.startConversation({ projectId: project.projectId, conversationId: 'main' }),
      window.limeShot.plan.list(project.projectId),
    ]);
    const [createdProjectDetail, createdConversation] = await Promise.all([
      window.limeShot.project.read(createdProject.projectId),
      window.limeShot.agent.startConversation({ projectId: createdProject.projectId, conversationId: 'main' }),
    ]);
    return { history, plans, createdProject, createdProjectDetail, createdConversation };
  }, { seededName: projectName, createdName: newProjectName });
  const requests = fixture.requests();
  const firstRequest = JSON.stringify(requests[0] ?? {});
  const secondRequest = JSON.stringify(requests[1] ?? {});
  const thirdRequest = JSON.stringify(requests[2] ?? {});
  const evidence = await page.evaluate(() => ({
    source: document.querySelector('[data-testid="runtime-status"]')?.getAttribute('data-runtime-source'),
    runtimeText: document.querySelector('[data-testid="runtime-status"]')?.textContent ?? '',
    assistantVisible: Array.from(document.querySelectorAll('.agent-item[data-kind="assistant"]')).some((item) => item.textContent?.includes('Gate B complete')),
    planState: document.querySelector('.plan-panel > header > span')?.getAttribute('data-state') ?? '',
  }));
  const historyRestored = semanticEvidence.history.turns.some((turn) => turn.status === 'completed'
    && turn.items.some((item) => item.kind === 'assistant' && item.text.includes('Gate B complete')));
  const dynamicToolAdvertised = firstRequest.includes('project_read');
  const planToolAdvertised = firstRequest.includes('plan_create');
  const toolActivityVisible = activityTools.includes('project_read') && activityTools.includes('plan_create');
  const projectToolOutputRouted = secondRequest.includes('function_call_output')
    && secondRequest.includes('gate-b-tool-1')
    && secondRequest.includes(projectName);
  const planToolOutputRouted = thirdRequest.includes('function_call_output')
    && thirdRequest.includes('gate-b-tool-2')
    && thirdRequest.includes('Gate B production plan');
  const approvedPlanPersisted = semanticEvidence.plans.plans.some((plan) => plan.state === 'approved' && plan.approvedBy === 'user');
  const newProjectCreated = semanticEvidence.createdProject.workspaceName === newProjectName
    && semanticEvidence.createdProjectDetail.brief.content.subject === ''
    && semanticEvidence.createdConversation.access === 'active'
    && Boolean(semanticEvidence.createdConversation.threadId)
    && existsSync(join(userData, 'projects', newProjectName));
  const newProjectRestoredAfterRestart = semanticEvidence.createdConversation.turns.length === 0;
  if (
    !foundationEvidence.hasPreload
    || evidence.source !== 'business-service'
    || foundationEvidence.profileCount !== 5
    || !evidence.runtimeText.includes('PID')
    || !toolActivityVisible
    || !evidence.assistantVisible
    || requests.length !== 3
    || !dynamicToolAdvertised
    || !planToolAdvertised
    || !projectToolOutputRouted
    || !planToolOutputRouted
    || !historyRestored
    || !approvalReceiptId
    || evidence.planState !== 'approved'
    || !approvedPlanPersisted
    || !newProjectCreated
    || !newProjectRestoredAfterRestart
  ) {
    throw new Error(`Gate B 证据不完整: ${JSON.stringify(evidence)}`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    proofLevel: 'Gate B',
    codexVersion: manifest.version,
    providerRequestCount: requests.length,
    dynamicToolAdvertised,
    planToolAdvertised,
    toolActivityVisible,
    projectToolOutputRouted,
    planToolOutputRouted,
    historyRestored,
    approvedPlanPersisted,
    newProjectCreated,
    newProjectRestoredAfterRestart,
    projectDialogCallCount,
    approvalReceiptId,
    ...foundationEvidence,
    ...evidence,
  })}\n`);
} catch (error) {
  const pages = application?.windows() ?? [];
  const page = pages[0];
  const renderer = page ? await page.evaluate(() => ({
    body: document.body.innerText,
    composerDisabled: (document.querySelector('.composer-field textarea'))?.disabled,
    agentState: document.querySelector('[data-testid="agent-panel"]')?.getAttribute('data-agent-state'),
  })).catch((diagnosticError) => ({ diagnosticError: String(diagnosticError) })) : undefined;
  process.stderr.write(`[gate-b-diagnostics] ${JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    providerRequestCount: fixture.requests().length,
    providerRequests: fixture.requests().map((request) => ({
      model: request.model,
      hasProjectRead: JSON.stringify(request.tools ?? []).includes('project_read'),
      hasPlanCreate: JSON.stringify(request.tools ?? []).includes('plan_create'),
      hasToolOutput: JSON.stringify(request.input ?? []).includes('function_call_output'),
    })),
    renderer,
  })}\n`);
  throw error;
} finally {
  await application?.close();
  await fixture.close();
  await rm(userData, { recursive: true, force: true });
}

async function launchElectron(options) {
  const launched = await electron.launch(options);
  launched.process().stdout?.on('data', (chunk) => process.stderr.write(`[electron] ${String(chunk)}`));
  launched.process().stderr?.on('data', (chunk) => process.stderr.write(`[electron] ${String(chunk)}`));
  return launched;
}

function currentPlatformKey() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'darwin-arm64';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'darwin-x64';
  if (process.platform === 'win32' && process.arch === 'x64') return 'win32-x64';
  return `${process.platform}-${process.arch}`;
}

async function writeCodexConfig(codexHome, baseUrl) {
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, 'config.toml'), `
model = "mock-model"
approval_policy = "never"
sandbox_mode = "read-only"
model_provider = "mock_provider"

[model_providers.mock_provider]
name = "LimeShot Gate B fixture"
base_url = "${baseUrl}/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
`);
}

async function seedProject({ businessBinary: executable, userData: dataRoot, workspace: workspacePath, projectName: name }) {
  const businessRoot = join(dataRoot, 'business');
  const paths = {
    data: join(businessRoot, 'data'),
    managed: join(businessRoot, 'managed'),
    logs: join(businessRoot, 'logs'),
  };
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
  const child = spawn(executable, [
    '--stdio',
    '--data-dir', paths.data,
    '--resources-dir', paths.managed,
    '--log-dir', paths.logs,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', (chunk) => process.stderr.write(`[seed-business] ${String(chunk)}`));
  const rpc = jsonRpcPeer(child);
  try {
    await rpc.request('initialize', {
      clientInfo: { name: 'limeshot-gate-b', version: '0.1.0' },
      protocolVersion: 1,
      instanceId: randomUUID(),
    });
    rpc.notify('initialized', {});
    await rpc.request('project/create', {
      name,
      profileId: 'general',
      workspacePath,
      brief: {
        subject: 'Verify the real Codex dynamic tool route',
        audience: 'LimeShot maintainers',
        platform: 'desktop',
        targetDurationSeconds: 30,
        aspectRatio: '16:9',
        language: 'en-US',
        style: 'technical',
        mustInclude: ['project_read'],
        prohibited: [],
        deliveryFormat: 'mp4',
      },
    });
    await rpc.request('business/shutdown', {});
    await rpc.closed;
  } finally {
    rpc.close();
  }
}

function jsonRpcPeer(child) {
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  let nextId = 1;
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const closed = new Promise((resolveClosed, rejectClosed) => child.once('exit', (code, signal) => {
    if (code === 0) resolveClosed();
    else rejectClosed(new Error(`seed business exited: code=${String(code)} signal=${String(signal)}`));
  }));
  return {
    closed,
    request(method, params) {
      const id = nextId++;
      const response = new Promise((resolveRequest, rejectRequest) => pending.set(id, { resolve: resolveRequest, reject: rejectRequest }));
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return response;
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    close() {
      lines.close();
      if (child.exitCode === null) child.kill();
    },
  };
}

async function startResponsesFixture() {
  const requestBodies = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requestBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const index = requestBodies.length;
    const events = index === 1
      ? [
          responseCreated('gate-b-response-1'),
          {
            type: 'response.output_item.done',
            item: { type: 'function_call', call_id: 'gate-b-tool-1', name: 'project_read', arguments: '{}' },
          },
          responseCompleted('gate-b-response-1'),
        ]
      : index === 2
        ? [
            responseCreated('gate-b-response-2'),
            {
              type: 'response.output_item.done',
              item: {
                type: 'function_call',
                call_id: 'gate-b-tool-2',
                name: 'plan_create',
                arguments: JSON.stringify({
                  title: 'Gate B production plan',
                  summary: 'Produce a verified desktop workflow.',
                  deliverables: ['Verified MP4'],
                  operations: [{ operationId: 'prepare', kind: 'planning', title: 'Prepare production', capabilityId: null, dependsOn: [] }],
                  gaps: [],
                  risks: ['Provider capability remains unavailable'],
                }),
              },
            },
            responseCompleted('gate-b-response-2'),
          ]
        : index === 3
          ? [
              responseCreated('gate-b-response-3'),
              {
                type: 'response.output_item.done',
                item: { type: 'message', role: 'assistant', id: 'gate-b-message-1', content: [{ type: 'output_text', text: 'Gate B complete' }] },
              },
              responseCompleted('gate-b-response-3'),
            ]
        : [];
    if (events.length === 0) {
      response.writeHead(500).end('unexpected extra Responses request');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Responses fixture address is unavailable');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests: () => [...requestBodies],
    close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())),
  };
}

function responseCreated(id) {
  return { type: 'response.created', response: { id } };
}

function responseCompleted(id) {
  return {
    type: 'response.completed',
    response: {
      id,
      usage: { input_tokens: 0, input_tokens_details: null, output_tokens: 0, output_tokens_details: null, total_tokens: 0 },
    },
  };
}
