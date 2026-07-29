import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { _electron as electron } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const businessBinary = resolve(root, 'rust', 'target', 'release', process.platform === 'win32' ? 'business-server.exe' : 'business-server');
if (!existsSync(businessBinary)) throw new Error(`缺少 release Rust companion: ${businessBinary}`);
const businessProtocol = JSON.parse(await readFile(resolve(root, 'schemas', 'business', 'protocol.json'), 'utf8'));
if (!Number.isInteger(businessProtocol.protocolVersion) || businessProtocol.protocolVersion <= 0) {
  throw new Error('Business protocol schema 缺少有效的 protocolVersion');
}

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
const codexHome = join(userData, 'shared-codex-home');
const workspace = join(userData, 'workspace');
const mcpFixturePath = join(userData, 'gate-b-mcp.mjs');
const sourceAssetPath = join(userData, 'source.wav');
const ffprobeLog = join(userData, 'ffprobe-argv.txt');
const ffprobeFixture = join(userData, process.platform === 'win32' ? 'ffprobe-fixture.exe' : 'ffprobe-fixture');
const ffmpegLog = join(userData, 'ffmpeg-argv.txt');
const ffmpegPidLog = join(userData, 'ffmpeg-active-pid.txt');
const ffmpegFixture = join(userData, process.platform === 'win32' ? 'ffmpeg-fixture.exe' : 'ffmpeg-fixture');
const projectName = 'Gate B project';
const openedProjectName = 'opened-project';
const openedProjectPath = join(userData, openedProjectName);
const openedProjectNestedPath = join(openedProjectPath, 'nested-workspace');
const screenshotDir = process.env.LIMESHOT_SMOKE_SCREENSHOT_DIR;
let application;

try {
  await mkdir(workspace, { recursive: true });
  await mkdir(openedProjectNestedPath, { recursive: true });
  await writeMcpFixture(mcpFixturePath);
  await writeWaveFixture(sourceAssetPath);
  compileFfprobeFixture(ffprobeFixture);
  compileFfmpegFixture(ffmpegFixture);
  await writeCodexConfig(codexHome, fixture.baseUrl, mcpFixturePath);
  const openedProjectHistory = await Promise.all([
    seedCodexExecHistory({
      codexBinary,
      codexHome,
      cwd: openedProjectPath,
      prompt: 'Gate B existing parent-directory conversation.',
    }),
    seedCodexExecHistory({
      codexBinary,
      codexHome,
      cwd: openedProjectNestedPath,
      prompt: 'Gate B existing nested-directory conversation.',
    }),
  ]);
  await seedProject({ businessBinary, userData, workspace, projectName });

  const launchEnv = { ...process.env };
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete launchEnv[key];
  launchEnv.NO_PROXY = '127.0.0.1,localhost';
  launchEnv.no_proxy = launchEnv.NO_PROXY;
  const electronLaunchOptions = {
    args: [root, `--user-data-dir=${userData}`, '--lang=zh-CN'],
    cwd: root,
    env: {
      ...launchEnv,
      LIMESHOT_BUSINESS_BIN: businessBinary,
      LIMESHOT_CODEX_BIN: codexBinary,
      CODEX_HOME: codexHome,
      LIMESHOT_FFPROBE_BIN: ffprobeFixture,
      LIMESHOT_FFMPEG_BIN: ffmpegFixture,
      LIMESHOT_ELECTRON_SMOKE: '1',
    },
  };
  application = await launchElectron(electronLaunchOptions);
  let page = await application.firstWindow();
  await page.locator('[data-testid="runtime-status"][data-state="ready"]').waitFor({ timeout: 20_000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.home-profile-context').click();
  const foundationEvidence = await page.evaluate(() => ({
    hasPreload: Boolean(window.limeShot?.foundation?.read),
    profileCount: document.querySelectorAll('[data-testid^="profile-"]').length,
  }));
  await page.getByTestId('profile-general').click();
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: join(screenshotDir, '01-home.png') });
  }
  await page.locator('.project-nav-item', { hasText: projectName }).click();
  await page.getByTestId('home-workspace').waitFor({ timeout: 20_000 });
  const projectRowOpensHome = await page.evaluate((expectedProjectName) => (
    !document.querySelector('[data-testid="agent-panel"]')
      && document.querySelector('[data-testid="home-project-context"]')?.textContent?.includes(expectedProjectName) === true
  ), projectName);
  await page.mouse.move(800, 100);
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '01-project-home.png') });
  const homeComposer = page.locator('.home-composer textarea');
  await homeComposer.fill('Read this project, then confirm the result.');
  await homeComposer.press('Enter');
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  const projectConversationId = await page.getByTestId('agent-panel').getAttribute('data-conversation-id');
  const projectThreadId = await page.getByTestId('agent-panel').getAttribute('data-thread-id');
  if (!projectConversationId || !projectThreadId) throw new Error('Project conversation identity is missing from the GUI projection');

  const composer = page.locator('.composer-field textarea');
  await page.locator('.agent-item[data-item-type="dynamicToolCall"]', { hasText: 'project_read' }).waitFor({ state: 'attached', timeout: 60_000 });
  await page.locator('.agent-item[data-item-type="dynamicToolCall"][data-status="completed"]', { hasText: 'plan_create' }).waitFor({ state: 'attached', timeout: 60_000 });
  await page.locator('.agent-item[data-item-type="dynamicToolCall"][data-status="failed"]', { hasText: 'plan_create' }).waitFor({ state: 'attached', timeout: 60_000 });
  const activityTools = (await page.locator('.agent-item[data-item-type="dynamicToolCall"]').allTextContents()).join('\n');
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: /^Gate B complete$/ }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-turn[data-status="completed"]').waitFor({ timeout: 60_000 });
  await page.getByTitle('打开对话运行状态').click();
  const activityInspector = page.locator('.conversation-activity-inspector');
  await activityInspector.waitFor({ timeout: 20_000 });
  const activityInspectorEvidence = await page.evaluate(() => {
    const inspector = document.querySelector('.conversation-activity-inspector');
    const conversation = document.querySelector('.conversation-workspace');
    const inspectorBounds = inspector?.getBoundingClientRect();
    const conversationBounds = conversation?.getBoundingClientRect();
    return {
      inspectorVisible: Boolean(inspectorBounds && inspectorBounds.width > 0 && inspectorBounds.height > 0),
      inspectorOnRight: Boolean(inspectorBounds && conversationBounds && inspectorBounds.left >= conversationBounds.right - 1),
      statusOwnedByInspector: Boolean(inspector?.querySelector('.conversation-status-surface')),
      statusAbsentFromTimelineTop: !document.querySelector('.conversation-workspace > .conversation-status-surface'),
    };
  });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-conversation-activity.png') });
  await page.getByTestId('workspace-toolbar').getByTitle('关闭对话运行状态').click();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-conversation.png') });

  await composer.fill('Exercise every required conversation projection and interaction.');
  await composer.press('Enter');
  const searchItem = page.locator('.agent-item[data-item-type="webSearch"]', { hasText: 'LimeShot projection contract' });
  const shellItem = page.locator('.agent-item[data-item-type="commandExecution"]', { hasText: 'gate-b-shell-output' });
  const imageItem = page.locator('.agent-item[data-item-type="imageGeneration"]', { hasText: 'LimeShot projection image' });
  await searchItem.waitFor({ timeout: 60_000 });
  await shellItem.waitFor({ timeout: 60_000 });
  await imageItem.waitFor({ timeout: 60_000 });
  const imageEventTarget = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="agent-panel"]');
    const item = document.querySelector('.agent-item[data-item-type="imageGeneration"]');
    const turn = item?.closest('.agent-turn');
    return {
      threadId: panel?.getAttribute('data-thread-id') ?? '',
      turnId: turn?.getAttribute('data-turn-id') ?? '',
      itemId: item?.getAttribute('data-item-id') ?? '',
      savedPath: item?.querySelector('code')?.textContent ?? '',
    };
  });
  if (Object.values(imageEventTarget).some((value) => !value)) {
    throw new Error(`Gate B image generation target is incomplete: ${JSON.stringify(imageEventTarget)}`);
  }
  await application.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Gate B BrowserWindow is unavailable');
    window.webContents.send('agent:event', {
      type: 'item.updated',
      threadId: target.threadId,
      turnId: target.turnId,
      item: {
        id: target.itemId,
        type: 'imageGeneration',
        kind: 'activity',
        title: 'Image generation',
        text: 'LimeShot projection image',
        status: 'inProgress',
        result: '',
        revisedPrompt: 'LimeShot projection image',
      },
    });
  }, imageEventTarget);
  await page.locator('.agent-item[data-item-type="imageGeneration"] > summary').click();
  await page.locator('.agent-item[data-item-type="imageGeneration"][data-status="inProgress"] .agent-media-loading').waitFor({ timeout: 20_000 });
  const imageGenerationLoadingVisible = true;
  await application.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Gate B BrowserWindow is unavailable');
    window.webContents.send('agent:event', {
      type: 'item.updated',
      threadId: target.threadId,
      turnId: target.turnId,
      item: {
        id: target.itemId,
        type: 'imageGeneration',
        kind: 'activity',
        title: 'Image generation',
        text: 'LimeShot projection image',
        status: 'completed',
        result: '',
        revisedPrompt: 'LimeShot projection image',
        savedPath: target.savedPath,
      },
    });
  }, imageEventTarget);
  await page.locator('.agent-item[data-item-type="imageGeneration"][data-status="completed"]').waitFor({ timeout: 20_000 });

  const approval = page.locator('.interaction-surface[data-status="pending"]');
  await approval.waitFor({ timeout: 60_000 });
  const approvalKind = await approval.getAttribute('data-kind') ?? '';
  if (!['commandApproval', 'fileApproval'].includes(approvalKind)) {
    throw new Error(`Gate B expected command/file approval, received ${approvalKind}`);
  }
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-approval-request.png') });
  await approval.getByRole('button', { name: '允许一次' }).click();
  if (approvalKind === 'commandApproval') {
    const fileApproval = page.locator('.interaction-surface[data-kind="fileApproval"][data-status="pending"]');
    await fileApproval.waitFor({ timeout: 60_000 });
    await fileApproval.getByRole('button', { name: '允许一次' }).click();
  }
  const diffItem = page.locator('.agent-item[data-item-type="fileChange"][data-status="completed"]', { hasText: 'gate-b-projection.txt' });
  await diffItem.waitFor({ timeout: 60_000 });
  await page.locator('.agent-turn-panel[data-panel="diff"]', { hasText: 'gate-b-projection.txt' }).waitFor({ timeout: 60_000 });

  const mcpItem = page.locator('.agent-item[data-item-type="mcpToolCall"]', { hasText: 'gate_b/echo_tool' });
  await mcpItem.waitFor({ timeout: 60_000 });
  const mcpElicitation = page.locator('.interaction-surface[data-kind="mcpElicitation"][data-status="pending"]');
  await mcpElicitation.waitFor({ timeout: 60_000 });
  await mcpElicitation.getByRole('button', { name: '提交' }).click();
  await page.locator('.agent-item[data-item-type="mcpToolCall"][data-status="completed"]', { hasText: 'MCP Gate B echo' }).waitFor({ timeout: 60_000 });
  const mcpEventTarget = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="agent-panel"]');
    const item = document.querySelector('.agent-item[data-item-type="mcpToolCall"]');
    const turn = item?.closest('.agent-turn');
    return {
      threadId: panel?.getAttribute('data-thread-id') ?? '',
      turnId: turn?.getAttribute('data-turn-id') ?? '',
      itemId: item?.getAttribute('data-item-id') ?? '',
    };
  });
  if (Object.values(mcpEventTarget).some((value) => !value)) {
    throw new Error(`Gate B MCP progress target is incomplete: ${JSON.stringify(mcpEventTarget)}`);
  }
  await application.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Gate B BrowserWindow is unavailable');
    for (let index = 1; index <= 10; index += 1) {
      window.webContents.send('agent:event', {
        type: 'item.progress',
        threadId: target.threadId,
        turnId: target.turnId,
        itemId: target.itemId,
        message: `MCP progress ${index}`,
      });
    }
  }, mcpEventTarget);
  await mcpItem.locator(':scope > summary').click();
  await page.waitForFunction(() => document.querySelectorAll('.agent-item[data-item-type="mcpToolCall"] .agent-progress-list > li').length === 8);
  const mcpProjectionEvidence = await page.evaluate(() => {
    const item = document.querySelector('.agent-item[data-item-type="mcpToolCall"]');
    const resource = item?.querySelector('.agent-resource');
    const toolText = item?.querySelector('.agent-tool-text');
    const toolTextStyle = toolText ? getComputedStyle(toolText) : null;
    const progress = Array.from(item?.querySelectorAll('.agent-progress-list > li') ?? [], (node) => node.textContent);
    return {
      sourceVisible: item?.querySelector(':scope > summary')?.textContent?.includes('gate_b/echo_tool') === true,
      resourceNameVisible: resource?.textContent?.includes('Projection resource') === true,
      resourceUriVisible: resource?.textContent?.includes('mcp://gate-b/projection') === true,
      progressLastEight: JSON.stringify(progress) === JSON.stringify(Array.from({ length: 8 }, (_, index) => `MCP progress ${index + 3}`)),
      toolTextPreservesEnds: toolText?.textContent?.includes('MCP-TEXT-START') === true && toolText.textContent.includes('MCP-TEXT-END'),
      toolTextBounded: Boolean(toolText && toolText.textContent && toolText.textContent.length < 9_000 && toolTextStyle?.maxHeight === '220px' && toolTextStyle.overflowY === 'auto'),
    };
  });
  await application.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Gate B BrowserWindow is unavailable');
    const sendItem = (item) => window.webContents.send('agent:event', {
      type: 'item.updated',
      threadId: target.threadId,
      turnId: target.turnId,
      item,
    });
    sendItem({
      id: 'gate-b-hook-feedback',
      type: 'hookPrompt',
      kind: 'user',
      title: 'Hook feedback',
      text: 'Gate B hook feedback',
      fragments: [{ text: 'Gate B hook feedback', hookRunId: 'gate-b-hook' }],
    });
    sendItem({
      id: 'gate-b-collab',
      type: 'collabAgentToolCall',
      kind: 'activity',
      title: 'Created agent',
      text: 'Inspect the projection boundary',
      status: 'completed',
      tool: 'spawnAgent',
      senderThreadId: target.threadId,
      receiverThreadIds: ['gate-b-child-thread'],
      prompt: 'Inspect the projection boundary',
      model: 'gpt-5.4',
      reasoningEffort: 'high',
      agents: [{ threadId: 'gate-b-child-thread', status: 'completed', message: 'Projection verified' }],
    });
    sendItem({
      id: 'gate-b-subagent',
      type: 'subAgentActivity',
      kind: 'activity',
      title: 'Sub-agent activity',
      text: 'reviewer',
      activity: 'started',
      agentThreadId: 'gate-b-child-thread',
      agentPath: 'reviewer',
    });
    sendItem({ id: 'gate-b-compaction-manual', type: 'contextCompaction', kind: 'system', title: 'Context compaction', text: '', status: 'inProgress', source: 'manual' });
    sendItem({ id: 'gate-b-compaction-auto', type: 'contextCompaction', kind: 'system', title: 'Context compaction', text: '', status: 'completed', source: 'automatic' });
    sendItem({ id: 'gate-b-wait', type: 'collabAgentToolCall', kind: 'activity', title: 'Wait', text: '', status: 'completed', tool: 'wait', senderThreadId: target.threadId, receiverThreadIds: [], agents: [] });
    sendItem({ id: 'gate-b-sleep', type: 'sleep', kind: 'activity', title: 'Sleep', text: '100 ms', status: 'completed', waitMs: 100 });
    sendItem({ id: 'gate-b-review-enter', type: 'enteredReviewMode', kind: 'system', title: 'Review', text: 'hidden review', review: 'hidden review' });
    sendItem({ id: 'gate-b-review-exit', type: 'exitedReviewMode', kind: 'system', title: 'Review', text: 'hidden review', review: 'hidden review' });
    sendItem({ id: 'gate-b-unknown', type: 'unknown', kind: 'system', title: 'Unknown', text: '', sourceType: 'futureItem', fields: ['privateField'] });
  }, mcpEventTarget);
  await page.locator('[data-item-id="gate-b-hook-feedback"][data-kind="user"] .agent-user-status', { hasText: 'Hook 反馈' }).waitFor({ timeout: 20_000 });
  await page.locator('[data-item-id="gate-b-collab"] > summary', { hasText: '已创建' }).waitFor({ timeout: 20_000 });
  await page.locator('[data-item-id="gate-b-subagent"]', { hasText: 'reviewer 开始工作' }).waitFor({ timeout: 20_000 });
  await page.locator('[data-item-id="gate-b-compaction-manual"][data-status="inProgress"]', { hasText: '正在压缩上下文' }).waitFor({ timeout: 20_000 });
  const manualCompactionRunningVisible = true;
  await application.evaluate(({ BrowserWindow }, target) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Gate B BrowserWindow is unavailable');
    window.webContents.send('agent:event', {
      type: 'item.updated',
      threadId: target.threadId,
      turnId: target.turnId,
      item: { id: 'gate-b-compaction-manual', type: 'contextCompaction', kind: 'system', title: 'Context compaction', text: '', status: 'completed', source: 'manual' },
    });
  }, mcpEventTarget);
  await page.locator('[data-item-id="gate-b-compaction-manual"][data-status="completed"]', { hasText: '上下文已压缩' }).waitFor({ timeout: 20_000 });
  await page.locator('[data-item-id="gate-b-collab"] > summary').click();
  await page.locator('[data-item-id="gate-b-collab"] .agent-agent-list button', { hasText: 'gate-b-child-thread' }).waitFor({ timeout: 20_000 });
  const mcpElicitationVisible = true;
  await page.locator('.interaction-surface[data-kind="userInput"][data-status="pending"]').waitFor({ timeout: 60_000 });
  const userInputInteraction = page.locator('.interaction-surface[data-kind="userInput"][data-status="pending"]');
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-user-input-request.png') });
  await page.setViewportSize({ width: 420, height: 900 });
  await page.locator('[data-testid="app-shell"][data-sidebar-collapsed="true"]').waitFor({ timeout: 20_000 });
  const userInputNarrowEvidence = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const interaction = document.querySelector('.interaction-surface[data-kind="userInput"]');
    const bounds = interaction?.getBoundingClientRect();
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      interactionContained: Boolean(bounds && bounds.left >= -1 && bounds.right <= viewportWidth + 1),
    };
  });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-user-input-request-420.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await userInputInteraction.getByRole('radio', { name: /Yes \(Recommended\)/ }).check();
  await userInputInteraction.getByRole('button', { name: '下一题' }).click();
  await userInputInteraction.locator('.interaction-other input').check();
  await userInputInteraction.locator('input[type="password"]').fill('gate-b-secret-value');
  await userInputInteraction.getByRole('button', { name: '提交' }).click();
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Projection Gate B complete' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-turn[data-status="completed"]', { hasText: 'Projection Gate B complete' }).waitFor({ timeout: 60_000 });

  const projectionBoundaryEvidence = await page.evaluate(({ absoluteWorkspace, mcpSecret, secret }) => {
    const bodyText = document.body.innerText;
    const markup = document.documentElement.outerHTML;
    return {
      searchVisible: Boolean(document.querySelector('.agent-item[data-item-type="webSearch"]')),
      shellVisible: Array.from(document.querySelectorAll('.agent-item[data-item-type="commandExecution"]')).some((item) => item.textContent?.includes('gate-b-shell-output')),
      diffVisible: Boolean(document.querySelector('.agent-item[data-item-type="fileChange"]')),
      mcpVisible: Boolean(document.querySelector('.agent-item[data-item-type="mcpToolCall"]')),
      imageVisible: Boolean(document.querySelector('.agent-item[data-item-type="imageGeneration"]')),
      userInputResolved: !document.querySelector('.interaction-surface[data-kind="userInput"]'),
      secretAbsent: !bodyText.includes(secret) && !markup.includes(secret),
      mcpSecretAbsent: !bodyText.includes(mcpSecret) && !markup.includes(mcpSecret),
      absolutePathAbsent: !bodyText.includes(absoluteWorkspace),
      rawMethodAbsent: !bodyText.includes('item/tool/requestUserInput') && !bodyText.includes('item/commandExecution/requestApproval'),
    };
  }, { absoluteWorkspace: workspace, mcpSecret: 'gate-b-mcp-private-value', secret: 'gate-b-secret-value' });
  const projectionActivityEvidence = await page.evaluate(() => {
    const summary = (type) => document.querySelector(`.agent-item[data-item-type="${type}"] > summary .agent-item-summary`)?.textContent ?? '';
    const turnDiff = document.querySelector('.agent-turn-panel[data-panel="diff"]');
    const turnDiffStyle = turnDiff ? getComputedStyle(turnDiff) : null;
    return {
      searchSummaryVisible: summary('webSearch').includes('LimeShot projection contract'),
      shellSummaryVisible: summary('commandExecution').includes('gate-b-shell-output'),
      fileSummaryVisible: summary('fileChange').includes('gate-b-projection.txt'),
      completedStatusSuppressed: !document.querySelector('.agent-activity-item[data-status="completed"] > summary .agent-item-label em'),
      turnDiffCardless: Boolean(turnDiffStyle && turnDiffStyle.borderTopStyle === 'none' && turnDiffStyle.backgroundColor === 'rgba(0, 0, 0, 0)'),
      dynamicFailureVisible: document.querySelector('.agent-item[data-item-type="dynamicToolCall"][data-status="failed"] > summary')?.textContent?.includes('工具执行失败') === true,
    };
  });
  const projectionDetailEvidence = {
    ...mcpProjectionEvidence,
    imageGenerationLoadingVisible,
  };
  const projectionBoundaryParityEvidence = await page.evaluate((runningVisible) => ({
    hookFeedbackUserBubble: Boolean(document.querySelector('[data-item-id="gate-b-hook-feedback"][data-kind="user"] .agent-user-status')),
    multiAgentActionVisible: document.querySelector('[data-item-id="gate-b-collab"] > summary')?.textContent?.includes('已创建') === true,
    multiAgentDetailsVisible: document.querySelector('[data-item-id="gate-b-collab"] .agent-agent-list')?.textContent?.includes('Projection verified') === true,
    subAgentEntryVisible: document.querySelector('[data-item-id="gate-b-subagent"]')?.textContent?.includes('reviewer 开始工作') === true,
    manualCompactionLifecycle: runningVisible && document.querySelector('[data-item-id="gate-b-compaction-manual"]')?.textContent?.includes('上下文已压缩') === true,
    automaticCompactionVisible: document.querySelector('[data-item-id="gate-b-compaction-auto"]')?.textContent?.includes('上下文已自动压缩') === true,
    hiddenBoundariesAbsent: !['gate-b-wait', 'gate-b-sleep', 'gate-b-review-enter', 'gate-b-review-exit', 'gate-b-unknown']
      .some((id) => document.querySelector(`[data-item-id="${id}"]`)),
  }), manualCompactionRunningVisible);
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-projections.png') });

  await composer.fill('Run the interrupt projection.');
  await composer.press('Enter');
  await page.locator('.agent-item[data-item-type="commandExecution"][data-status="inProgress"]', { hasText: 'sleep 30' }).waitFor({ timeout: 60_000 });
  await page.getByTitle('中断当前回复').click();
  await page.locator('.agent-turn[data-status="interrupted"]').waitFor({ timeout: 20_000 });
  const interruptVisible = await page.locator('.agent-turn[data-status="interrupted"]').count() === 1;

  await page.setViewportSize({ width: 420, height: 900 });
  await page.locator('[data-testid="app-shell"][data-sidebar-collapsed="true"]').waitFor({ timeout: 20_000 });
  const narrowViewportEvidence = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visible = (element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
    };
    const constrained = Array.from(document.querySelectorAll('.composer-shell, .agent-item, .interaction-surface'))
      .filter(visible)
      .every((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= -1 && bounds.right <= viewportWidth + 1;
      });
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      constrained,
      composerVisible: Boolean(document.querySelector('.composer-shell')),
      sidebarCollapsed: document.querySelector('[data-testid="app-shell"]')?.getAttribute('data-sidebar-collapsed') === 'true',
      sidebarAbsent: !document.querySelector('.sidebar'),
      scrimAbsent: !document.querySelector('.sidebar-scrim'),
    };
  });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-projections-narrow.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTitle('展开侧边栏').click();
  await page.locator('[data-testid="app-shell"][data-sidebar-collapsed="false"]').waitFor({ timeout: 20_000 });

  const sidebarParityEvidence = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const scrollRegion = document.querySelector('.sidebar-scroll-region');
    const projectList = document.querySelector('[data-testid="project-list"]');
    const recentList = document.querySelector('[data-testid="recent-list"]');
    const projectRow = document.querySelector('.project-nav-row');
    const projectRowCommand = document.querySelector('.project-row-command');
    const projectThreadLabel = document.querySelector('.project-conversation-nav-item > span:last-child');
    const recentRow = document.querySelector('.standalone-nav-item');
    const footer = document.querySelector('.sidebar-footer');
    const windowButtons = Array.from(document.querySelectorAll('.sidebar-window-controls button'));
    const sectionLabels = Array.from(document.querySelectorAll('.sidebar-section-header > span')).map((element) => element.textContent?.trim());
    const projectRowStyle = projectRow ? getComputedStyle(projectRow) : null;
    const recentRowStyle = recentRow ? getComputedStyle(recentRow) : null;
    return {
      sectionOrder: sectionLabels[0] === '项目' && sectionLabels[1] === '最近',
      independentLists: Boolean(projectList && recentList && projectList.parentElement !== recentList.parentElement),
      sharedScrollRegion: Boolean(scrollRegion && scrollRegion.contains(projectList) && scrollRegion.contains(recentList)),
      footerOutsideScroll: Boolean(sidebar && footer && footer.parentElement === sidebar && !scrollRegion?.contains(footer)),
      codexProjectRow: Boolean(projectRowStyle && projectRowStyle.height === '30px' && projectRowStyle.borderRadius === '10px'),
      projectActionsRestHidden: Boolean(projectRowCommand && getComputedStyle(projectRowCommand).opacity === '0'),
      codexProjectThreadIndent: Math.round(projectThreadLabel?.getBoundingClientRect().left ?? -1) === 40,
      codexRecentRow: Boolean(recentRowStyle && recentRowStyle.height === '30px' && recentRowStyle.borderRadius === '10px'),
      windowNavigation: windowButtons.length === 3 && !windowButtons[0]?.disabled && windowButtons[1]?.disabled && windowButtons[2]?.disabled,
      semanticPrimaryActions: Array.from(document.querySelectorAll('.sidebar-actions button')).map((button) => button.textContent?.trim()).join('|') === '新建任务',
    };
  });

  const importSeed = await page.evaluate(async () => {
    const started = await window.limeShot.agent.startConversation({ projectId: null, conversationId: 'gate-b-native-import' });
    const completed = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        unsubscribe();
        reject(new Error('Timed out materializing the imported Codex history'));
      }, 60_000);
      const unsubscribe = window.limeShot.agent.subscribe((event) => {
        if (event.type !== 'turn.completed' || event.threadId !== started.threadId) return;
        window.clearTimeout(timeout);
        unsubscribe();
        resolve(undefined);
      });
    });
    await window.limeShot.agent.startTurn({
      projectId: null,
      conversationId: started.conversationId,
      threadId: started.threadId,
      text: 'Persist this native Codex conversation for automatic discovery.',
    });
    await completed;
    await window.limeShot.agent.renameConversation({
      projectId: null,
      conversationId: started.conversationId,
      threadId: started.threadId,
      title: 'Gate B native import',
    });
    await window.limeShot.agent.importConversation({ threadId: started.threadId });
    return started;
  });
  const importedThreadId = importSeed.threadId;
  await page.reload();
  await page.locator('[data-testid="runtime-status"][data-state="ready"]').waitFor({ timeout: 20_000 });
  await page.getByTestId(`standalone-${importedThreadId}`).waitFor({ timeout: 20_000 });
  await page.getByTestId(`project-conversation-${projectThreadId}`).waitFor({ timeout: 20_000 });
  const automaticImportListing = await page.evaluate(({ importedThreadId: threadId, projectThreadId: projectId }) => ({
    noDedicatedImportAction: !Array.from(document.querySelectorAll('.sidebar-actions button')).some((button) => button.textContent?.includes('导入')),
    noImportDialog: !document.querySelector('.conversation-import-dialog'),
    recentEntryVisible: Boolean(document.querySelector(`[data-testid="standalone-${threadId}"]`)),
    projectConversationNested: Boolean(document.querySelector(`[data-testid="project-conversation-${projectId}"]`)),
    projectThreadExcludedFromRecent: !document.querySelector(`[data-testid="standalone-${projectId}"]`),
    noRendererImportRegistry: localStorage.getItem('limeshot.conversations.imported') === null,
  }), { importedThreadId, projectThreadId });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-conversations-auto-projected.png') });
  await page.getByTestId(`standalone-${importedThreadId}`).click();
  await page.locator(`[data-testid="agent-panel"][data-agent-state="readOnly"][data-thread-id="${importedThreadId}"]`).waitFor({ timeout: 60_000 });
  const importedTurnRejected = await page.evaluate(async ({ threadId }) => {
    try {
      await window.limeShot.agent.startTurn({ projectId: null, conversationId: threadId, threadId, text: 'This imported conversation must remain read only.' });
      return false;
    } catch {
      return true;
    }
  }, { threadId: importedThreadId });
  if (await page.getByTestId('app-shell').getAttribute('data-sidebar-collapsed') === 'true') {
    await page.getByTitle('展开侧边栏').click();
    await page.locator('[data-testid="app-shell"][data-sidebar-collapsed="false"]').waitFor({ timeout: 20_000 });
  }
  const conversationImportEvidence = await page.evaluate(({ importedThreadId: threadId, projectThreadId: projectId }) => ({
    canonicalReadOnlyVisible: document.querySelector('[data-testid="agent-panel"]')?.getAttribute('data-thread-id') === threadId
      && document.querySelector('[data-testid="agent-panel"]')?.getAttribute('data-agent-state') === 'readOnly',
    internalPhaseAbsent: !document.body.innerText.includes('final_answer'),
    composerReadOnly: document.querySelector('.composer-field textarea')?.disabled === true,
    recentEntryVisible: Boolean(document.querySelector(`[data-testid="standalone-${threadId}"]`)),
    projectThreadExcludedFromRecent: !document.querySelector(`[data-testid="standalone-${projectId}"]`),
  }), { importedThreadId, projectThreadId });
  sidebarParityEvidence.codexRecentRow = await page.evaluate(() => {
    const row = document.querySelector('.standalone-nav-item');
    const style = row ? getComputedStyle(row) : null;
    return Boolean(style && style.height === '30px' && style.borderRadius === '10px');
  });
  await page.getByTestId(`project-conversation-${projectThreadId}`).click();
  await page.locator(`[data-testid="agent-panel"][data-agent-state="ready"][data-thread-id="${projectThreadId}"]`).waitFor({ timeout: 60_000 });

  const newConversationButton = page.locator('.sidebar-actions').getByRole('button', { name: '新建任务' });
  await newConversationButton.click();
  await page.getByTestId('home-workspace').waitFor({ timeout: 20_000 });
  const composerFocused = await page.evaluate(() => {
    const composer = document.querySelector('.home-composer textarea');
    return document.activeElement === composer;
  });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-home-project-context.png') });
  await page.locator('.home-profile-context').click();
  const newConversationHome = await page.evaluate((expectedProjectName) => {
    const composerBounds = document.querySelector('.home-composer')?.getBoundingClientRect();
    const sidebarBounds = document.querySelector('.sidebar')?.getBoundingClientRect();
    const profileMenu = document.querySelector('[data-testid="profiles-menu"]');
    const suggestions = document.querySelectorAll('.home-suggestion');
    return {
      homeVisible: Boolean(document.querySelector('[data-testid="home-workspace"]')),
      conversationHidden: !document.querySelector('[data-testid="agent-panel"]'),
      oldConversationHidden: !document.body.innerText.includes('Gate B complete'),
      projectPreserved: document.querySelector('[data-testid="home-project-context"]')?.textContent?.includes(expectedProjectName),
      projectTitle: document.querySelector('.home-heading h1')?.textContent?.includes(expectedProjectName),
      suggestionCount: suggestions.length === 4,
      composerReferenceWidth: Boolean(composerBounds && composerBounds.width >= 560 && composerBounds.width <= 578),
      composerDocked: Boolean(composerBounds && window.innerHeight - composerBounds.bottom <= 16),
      sidebarReferenceWidth: Boolean(sidebarBounds && sidebarBounds.width === 275),
      toolbarTitleAbsent: !document.querySelector('.workspace-toolbar-title'),
      profileMenuIntegrated: profileMenu?.querySelectorAll('[data-testid^="profile-"]').length === 5
        && Boolean(document.querySelector('.home-heading'))
        && Boolean(composerBounds && profileMenu.getBoundingClientRect().bottom <= composerBounds.top),
      addMenuClosed: !document.querySelector('[data-testid="composer-add-menu"]'),
      noNewProjectAction: !Array.from(document.querySelectorAll('.sidebar-actions button')).some((button) => button.textContent?.includes('新建项目')),
      projectConversationNested: Array.from(document.querySelectorAll('.project-conversation-nav-item'))
        .some((item) => item.textContent?.includes('Read this project')),
    };
  }, projectName);
  newConversationHome.composerFocused = composerFocused;
  await page.getByTestId('profile-general').click();
  await page.getByRole('button', { name: '整理最近对话' }).click();
  const recentMenu = page.getByTestId('recent-menu');
  await recentMenu.waitFor({ timeout: 20_000 });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '02-recent-menu.png') });
  const recentMenuText = await recentMenu.innerText();
  await recentMenu.getByRole('menuitemradio', { name: '最近更新' }).click();
  const recentSortStored = await page.evaluate(() => localStorage.getItem('limeshot.sidebar.recentSort') === 'updated');

  const projectTestId = await page.locator('.project-nav-item', { hasText: projectName }).getAttribute('data-testid');
  const projectId = projectTestId?.replace('project-', '');
  if (!projectId) throw new Error('Gate B project identity is missing from the sidebar');
  const projectMenuButton = page.getByRole('button', { name: `${projectName} 项目菜单` });
  await projectMenuButton.click();
  const projectMenu = page.getByTestId(`project-menu-${projectId}`);
  await projectMenu.waitFor({ timeout: 20_000 });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-menu.png') });
  const projectMenuText = await projectMenu.innerText();
  const projectMenuContained = await projectMenu.evaluate((menu) => {
    const bounds = menu.getBoundingClientRect();
    return bounds.left >= 8 && bounds.top >= 8
      && bounds.right <= document.documentElement.clientWidth - 8
      && bounds.bottom <= document.documentElement.clientHeight - 8;
  });
  await page.keyboard.press('ArrowDown');
  const projectMenuKeyboard = await projectMenu.evaluate((menu) => menu.contains(document.activeElement)
    && document.activeElement?.getAttribute('role') === 'menuitem');
  await projectMenu.getByRole('menuitem', { name: '置顶项目' }).click();
  const projectPinnedStored = await page.evaluate((expectedProjectId) => {
    const value = JSON.parse(localStorage.getItem('limeshot.sidebar.pinnedProjects') ?? '[]');
    return Array.isArray(value) && value.includes(expectedProjectId);
  }, projectId);
  await projectMenuButton.click();
  const unpinAvailable = await page.getByRole('menuitem', { name: '取消置顶' }).isVisible();
  await page.getByRole('menuitem', { name: '重命名项目' }).click();
  const projectRenameDialog = await page.getByRole('dialog', { name: '重命名项目' }).isVisible();
  await page.getByRole('dialog', { name: '重命名项目' }).getByRole('button', { name: '取消' }).click();
  await projectMenuButton.click();
  await page.getByRole('menuitem', { name: '全部标为已读' }).click();
  await projectMenu.waitFor({ state: 'detached', timeout: 20_000 });
  const projectMarkAllReadAction = !await page.locator('.sidebar-action-error').isVisible();
  await projectMenuButton.click();
  await page.getByRole('menuitem', { name: '归档对话' }).click();
  const projectArchiveDialog = await page.getByRole('dialog', { name: '归档项目中的对话？' }).isVisible();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-archive-dialog.png') });
  await page.getByRole('dialog', { name: '归档项目中的对话？' }).getByRole('button', { name: '取消' }).click();
  await projectMenuButton.click();
  await page.getByRole('menuitem', { name: '移除项目' }).click();
  const projectRemoveDialog = await page.getByRole('dialog', { name: '移除项目？' }).isVisible();
  await page.getByRole('dialog', { name: '移除项目？' }).getByRole('button', { name: '取消' }).click();
  await projectMenuButton.click();
  await page.getByRole('menuitem', { name: '编辑项目' }).click();
  await page.getByTestId('project-overview').waitFor({ timeout: 20_000 });
  const projectEditOpened = await page.locator('.project-inspector').isVisible();
  await newConversationButton.click();
  await page.getByTestId('home-workspace').waitFor({ timeout: 20_000 });
  await page.getByTestId('home-project-context').click();
  await page.getByTestId('composer-add-menu').getByRole('menuitem', { name: /无项目/ }).click();
  const sidebarMenuEvidence = {
    recentOptionsVisible: ['排序方式', '最近更新', '手动排序']
      .every((label) => recentMenuText.includes(label)),
    recentSortStored,
    projectOptionsVisible: ['置顶项目', '打开', '编辑项目', '重命名项目', '全部标为已读', '归档对话', '移除项目']
      .every((label) => projectMenuText.includes(label)),
    projectMenuContained,
    projectMenuKeyboard,
    projectPinnedStored,
    unpinAvailable,
    projectRenameDialog,
    projectMarkAllReadAction,
    projectArchiveDialog,
    projectRemoveDialog,
    projectEditOpened,
  };
  const standalonePrompt = 'Start a standalone Gate B conversation.';
  await page.locator('.home-composer textarea').fill(standalonePrompt);
  await page.locator('.home-composer textarea').press('Enter');
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Standalone Gate B complete' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-turn[data-status="completed"]', { hasText: 'Standalone Gate B complete' }).waitFor({ timeout: 60_000 });
  const standaloneThreadId = await page.getByTestId('agent-panel').getAttribute('data-thread-id');
  if (!standaloneThreadId) throw new Error('Standalone Codex Thread identity is missing from the GUI projection');
  const standaloneListBeforeRestart = await page.evaluate(() => window.limeShot.agent.listConversations());
  if (!standaloneListBeforeRestart.some((conversation) => conversation.threadId === standaloneThreadId)) {
    throw new Error(`Standalone thread is missing from thread/list before restart: ${JSON.stringify(standaloneListBeforeRestart)}`);
  }
  const standaloneRow = page.getByTestId(`standalone-${standaloneThreadId}`).locator('..');
  const threadMenuButton = standaloneRow.locator('.conversation-row-command');
  await threadMenuButton.click();
  const threadMenu = page.getByTestId(`conversation-menu-${standaloneThreadId}`);
  await threadMenu.waitFor({ timeout: 20_000 });
  const threadMenuText = await threadMenu.innerText();
  const threadMenuContained = await threadMenu.evaluate((menu) => {
    const bounds = menu.getBoundingClientRect();
    return bounds.left >= 8 && bounds.top >= 8
      && bounds.right <= document.documentElement.clientWidth - 8
      && bounds.bottom <= document.documentElement.clientHeight - 8;
  });
  await page.keyboard.press('ArrowDown');
  const threadMenuKeyboard = await threadMenu.evaluate((menu) => menu.contains(document.activeElement)
    && document.activeElement?.getAttribute('role') === 'menuitem');
  await threadMenu.getByRole('menuitem', { name: '标记为未读' }).click();
  await page.waitForFunction((threadId) => {
    const value = JSON.parse(localStorage.getItem('limeshot.sidebar.unreadConversations') ?? '[]');
    return Array.isArray(value) && value.includes(threadId);
  }, standaloneThreadId);
  const threadUnreadStored = true;
  await threadMenuButton.click();
  await threadMenu.getByRole('menuitem', { name: '标记为已读' }).click();
  await page.waitForFunction((threadId) => {
    const value = JSON.parse(localStorage.getItem('limeshot.sidebar.unreadConversations') ?? '[]');
    return Array.isArray(value) && !value.includes(threadId);
  }, standaloneThreadId);
  const threadReadStored = true;
  await threadMenuButton.click();
  await threadMenu.getByRole('menuitem', { name: '复制工作目录' }).click();
  await page.getByText('已复制工作目录', { exact: true }).waitFor({ timeout: 20_000 });
  const workingDirectoryCopyFeedback = true;
  await threadMenuButton.click();
  await threadMenu.getByRole('menuitem', { name: '复制会话 ID' }).click();
  await page.getByText('已复制会话 ID', { exact: true }).waitFor({ timeout: 20_000 });
  const sessionIdCopyFeedback = true;
  await threadMenuButton.click();
  await threadMenu.getByRole('menuitem', { name: '重命名对话' }).click();
  const threadRenameDialog = await page.getByRole('dialog', { name: '重命名对话' }).isVisible();
  await page.getByRole('dialog', { name: '重命名对话' }).getByRole('button', { name: '取消' }).click();
  await threadMenuButton.click();
  await threadMenu.getByRole('menuitem', { name: '删除对话' }).click();
  const threadDeleteDialog = await page.getByRole('dialog', { name: '删除对话？' }).isVisible();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-thread-delete-dialog.png') });
  await page.getByRole('dialog', { name: '删除对话？' }).getByRole('button', { name: '取消' }).click();
  Object.assign(sidebarMenuEvidence, {
    threadOptionsVisible: ['置顶对话', '重命名对话', '归档对话', '标记为未读', '打开', '复制工作目录', '复制会话 ID', '删除对话']
      .every((label) => threadMenuText.includes(label)),
    threadMenuContained,
    threadMenuKeyboard,
    threadUnreadStored,
    threadReadStored,
    workingDirectoryCopyFeedback,
    sessionIdCopyFeedback,
    threadRenameDialog,
    threadDeleteDialog,
  });
  await page.getByTestId(`project-conversation-${projectThreadId}`).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: /^Gate B complete$/ }).waitFor({ timeout: 60_000 });

  await page.getByTitle('打开项目详情').click();
  await page.getByTestId('project-overview').waitFor({ timeout: 20_000 });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-details.png') });
  const inspectProjectLayout = () => page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const inspector = document.querySelector('.project-inspector');
    const conversation = document.querySelector('.conversation-workspace');
    const inspectorBounds = inspector?.getBoundingClientRect();
    const conversationBounds = conversation?.getBoundingClientRect();
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      inspectorContained: Boolean(inspectorBounds && inspectorBounds.left >= -1 && inspectorBounds.right <= viewportWidth + 1),
      inspectorContentContained: Boolean(inspector && inspector.scrollWidth <= inspector.clientWidth + 1),
      inspectorOverlay: inspector ? getComputedStyle(inspector).position === 'absolute' : false,
      conversationWidth: conversationBounds?.width ?? 0,
      sidebarCollapsed: document.querySelector('[data-testid="app-shell"]')?.getAttribute('data-sidebar-collapsed') === 'true',
    };
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  const projectDesktopLayout = await inspectProjectLayout();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-details-1024.png') });
  await page.setViewportSize({ width: 768, height: 900 });
  const projectCompactLayout = await inspectProjectLayout();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-details-768.png') });
  await page.setViewportSize({ width: 420, height: 900 });
  await page.locator('[data-testid="app-shell"][data-sidebar-collapsed="true"]').waitFor({ timeout: 20_000 });
  const projectNarrowLayout = await inspectProjectLayout();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-details-420.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTitle('展开侧边栏').click();
  await page.locator('[data-testid="app-shell"][data-sidebar-collapsed="false"]').waitFor({ timeout: 20_000 });
  const projectResponsiveEvidence = {
    desktop: projectDesktopLayout.noHorizontalOverflow
      && projectDesktopLayout.inspectorContained
      && projectDesktopLayout.inspectorContentContained
      && !projectDesktopLayout.inspectorOverlay
      && projectDesktopLayout.conversationWidth >= 400,
    compact: projectCompactLayout.noHorizontalOverflow
      && projectCompactLayout.inspectorContained
      && projectCompactLayout.inspectorContentContained
      && projectCompactLayout.inspectorOverlay
      && projectCompactLayout.conversationWidth >= 490,
    narrow: projectNarrowLayout.noHorizontalOverflow
      && projectNarrowLayout.inspectorContained
      && projectNarrowLayout.inspectorContentContained
      && projectNarrowLayout.inspectorOverlay
      && projectNarrowLayout.conversationWidth >= 400
      && projectNarrowLayout.sidebarCollapsed,
  };
  const approveButton = page.getByRole('button', { name: '批准计划' });
  await approveButton.waitFor({ timeout: 20_000 });
  await approveButton.click();
  const receipt = page.locator('[data-testid="approval-receipt"]');
  await receipt.waitFor({ timeout: 20_000 });
  const approvalReceiptId = await receipt.getAttribute('data-approval-id') ?? '';
  await page.locator('.plan-panel > header > span[data-state="approved"]').waitFor({ timeout: 20_000 });

  await application.evaluate(({ dialog }, assetPath) => {
    globalThis.__limeshotImportDialogCallCount = 0;
    dialog.showOpenDialog = async () => {
      globalThis.__limeshotImportDialogCallCount += 1;
      return { canceled: false, filePaths: [assetPath], bookmarks: [] };
    };
  }, sourceAssetPath);
  await page.getByTestId('source-asset-import').click();
  await page.locator('[data-testid="source-asset"][data-source-state="imported"]').waitFor({ timeout: 20_000 });
  const importDialogCallCount = await application.evaluate(() => globalThis.__limeshotImportDialogCallCount ?? -1);
  if (importDialogCallCount !== 1) throw new Error(`素材导入系统对话框调用次数错误: ${importDialogCallCount}`);
  await page.getByTestId('media-probe-start').click();
  await page.locator('[data-testid="task-run-list"] [data-operation-id="probe-source"][data-task-state="succeeded"]').waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="artifact-list"] [data-artifact-type="media-manifest.v1"]').waitFor({ timeout: 20_000 });
  await page.getByTestId('media-transcode-start').click();
  await page.locator('[data-testid="task-run-list"] [data-operation-id="transcode-source"][data-task-state="succeeded"]').first().waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="artifact-list"] [data-artifact-type="media-output.v1"]').first().waitFor({ timeout: 20_000 });
  await page.getByTestId('media-transcode-start').click();
  const runningTranscode = page.locator('[data-testid="task-run-list"] [data-operation-id="transcode-source"][data-task-state="running"]');
  await runningTranscode.waitFor({ timeout: 20_000 });
  const transcodeProgressBeforeCancel = Number(await runningTranscode.getAttribute('data-progress'));
  await runningTranscode.getByTitle('取消任务').click();
  const canceledTranscode = page.locator('[data-testid="task-run-list"] [data-operation-id="transcode-source"][data-task-state="canceled"]');
  await canceledTranscode.waitFor({ timeout: 20_000 });
  const canceledTaskRunId = await canceledTranscode.getAttribute('data-task-run-id');
  if (!canceledTaskRunId) throw new Error('Canceled TaskRun identity is missing from the GUI projection');
  const canceledFfmpegPid = Number(await readFile(ffmpegPidLog, 'utf8'));
  const ffmpegProcessReaped = !pidIsAlive(canceledFfmpegPid);
  const outputFilesAfterCancel = await readdir(join(workspace, 'outputs'));
  const partialOutputsCleaned = outputFilesAfterCancel.every((name) => !name.endsWith('.part'));
  await canceledTranscode.getByTitle('重试任务').click();
  const retriedTranscode = page.locator(`[data-testid="task-run-list"] [data-operation-id="transcode-source"][data-retry-of="${canceledTaskRunId}"][data-task-state="succeeded"]`);
  await retriedTranscode.waitFor({ timeout: 20_000 });
  const retriedTaskRunId = await retriedTranscode.getAttribute('data-task-run-id');
  if (!retriedTaskRunId) throw new Error('Retried TaskRun identity is missing from the GUI projection');
  const retriedOutput = page.locator(`[data-testid="artifact-list"] [data-artifact-type="media-output.v1"][data-task-run-id="${retriedTaskRunId}"][data-qa-state="passed"]`);
  await retriedOutput.waitFor({ timeout: 20_000 });
  const retriedOutputArtifactId = await retriedOutput.getAttribute('data-artifact-id');
  if (!retriedOutputArtifactId) throw new Error('Retried media output Artifact identity is missing from the GUI projection');
  await retriedOutput.getByRole('button', { name: '确认交付' }).click();
  await page.locator(`[data-testid="deliverable-list"] [data-artifact-id="${retriedOutputArtifactId}"][data-current="true"]`).waitFor({ timeout: 20_000 });
  if (screenshotDir) {
    await page.getByTestId('execution-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, '04-media-execution.png') });
  }
  const ffprobeArgv = await readFile(ffprobeLog, 'utf8');
  const ffmpegArgv = await readFile(ffmpegLog, 'utf8');

  await application.evaluate(({ dialog }, directoryPath) => {
    globalThis.__limeshotDialogCallCount = 0;
    dialog.showOpenDialog = async () => {
      globalThis.__limeshotDialogCallCount += 1;
      return { canceled: false, filePaths: [directoryPath], bookmarks: [] };
    };
  }, openedProjectPath);
  await newConversationButton.click();
  await page.getByTestId('home-workspace').waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: '添加' }).click();
  await page.getByTestId('composer-add-menu').waitFor({ timeout: 20_000 });
  await page.getByRole('menuitem', { name: /选择或新建文件夹/ }).click();
  await page.locator('.project-nav-item', { hasText: openedProjectName }).waitFor({ timeout: 20_000 });
  await page.getByTestId('home-project-context').filter({ hasText: openedProjectName }).waitFor({ timeout: 20_000 });
  if (await page.getByTestId('agent-panel').count() !== 0) throw new Error('选择本地文件夹时不应直接创建 Codex Thread');
  const openedProjectListing = await page.evaluate(async (projectName) => {
    const project = (await window.limeShot.project.list()).find((candidate) => candidate.name === projectName);
    if (!project) throw new Error(`Opened project is missing: ${projectName}`);
    return {
      project,
      conversations: (await window.limeShot.agent.listProjectConversations({ projectId: project.projectId })).conversations,
    };
  }, openedProjectName);
  const openedProjectExistingHistoryNested = openedProjectHistory.every((history) => (
    openedProjectListing.conversations.some((conversation) => conversation.threadId === history.threadId)
  ));
  if (!openedProjectExistingHistoryNested) {
    throw new Error(`Opened project Codex histories are missing from semantic projection: ${JSON.stringify({
      project: openedProjectListing.project,
      expectedThreadIds: openedProjectHistory.map((history) => history.threadId),
      conversations: openedProjectListing.conversations,
    })}`);
  }
  for (const history of openedProjectHistory) {
    await page.getByTestId(`project-conversation-${history.threadId}`).waitFor({ timeout: 20_000 });
    if (await page.getByTestId(`standalone-${history.threadId}`).count() !== 0) {
      throw new Error(`Project Codex history is duplicated in Recent: ${history.threadId}`);
    }
  }
  await page.getByTestId(`project-conversation-${openedProjectHistory[1].threadId}`).click();
  await page.locator(`[data-testid="agent-panel"][data-agent-state="readOnly"][data-thread-id="${openedProjectHistory[1].threadId}"]`).waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: openedProjectHistory[1].assistantText }).waitFor({ timeout: 60_000 });
  await newConversationButton.click();
  await page.getByTestId('home-workspace').waitFor({ timeout: 20_000 });
  await page.getByTestId('home-project-context').filter({ hasText: openedProjectName }).waitFor({ timeout: 20_000 });
  await page.locator('.home-composer textarea').fill('Create a conversation in this local folder.');
  await page.locator('.home-composer textarea').press('Enter');
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Opened project complete' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-turn[data-status="completed"]', { hasText: 'Opened project complete' }).waitFor({ timeout: 60_000 });
  const openedConversationId = await page.getByTestId('agent-panel').getAttribute('data-conversation-id');
  const openedThreadId = await page.getByTestId('agent-panel').getAttribute('data-thread-id');
  if (!openedConversationId || !openedThreadId) throw new Error('Local project conversation identity is missing from the GUI projection');
  if (await page.locator('.app-action-error').count() !== 0) {
    throw new Error(`打开本地项目出现 GUI 错误: ${await page.locator('.app-action-error').allTextContents()}`);
  }
  const projectDialogCallCount = await application.evaluate(() => globalThis.__limeshotDialogCallCount ?? -1);
  if (projectDialogCallCount !== 1) throw new Error(`本地项目系统目录选择器调用次数错误: ${projectDialogCallCount}`);

  await application.close();
  application = await launchElectron(electronLaunchOptions);
  page = await application.firstWindow();
  await page.locator('[data-testid="runtime-status"][data-state="ready"]').waitFor({ timeout: 20_000 });
  const standaloneListAfterRestart = await page.evaluate(() => window.limeShot.agent.listConversations());
  if (!standaloneListAfterRestart.some((conversation) => conversation.threadId === standaloneThreadId)) {
    throw new Error(`Standalone thread is missing from thread/list after restart: ${JSON.stringify(standaloneListAfterRestart)}`);
  }
  for (const history of openedProjectHistory) {
    await page.getByTestId(`project-conversation-${history.threadId}`).waitFor({ timeout: 20_000 });
    if (await page.getByTestId(`standalone-${history.threadId}`).count() !== 0) {
      throw new Error(`Restored project Codex history is duplicated in Recent: ${history.threadId}`);
    }
  }
  const openedProjectExistingHistoryRestored = true;
  await page.getByTestId(`project-conversation-${openedProjectHistory[0].threadId}`).click();
  await page.locator(`[data-testid="agent-panel"][data-agent-state="readOnly"][data-thread-id="${openedProjectHistory[0].threadId}"]`).waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: openedProjectHistory[0].assistantText }).waitFor({ timeout: 60_000 });
  await page.evaluate((threadId) => window.limeShot.agent.importConversation({ threadId }), importedThreadId);
  await page.getByTestId(`standalone-${standaloneThreadId}`).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Standalone Gate B complete' }).waitFor({ timeout: 60_000 });
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '05-opened-project-after-restart.png') });
  await page.getByTestId(`standalone-${importedThreadId}`).click();
  await page.locator(`[data-testid="agent-panel"][data-agent-state="readOnly"][data-thread-id="${importedThreadId}"]`).waitFor({ timeout: 60_000 });
  const importedConversationRestoredAfterRestart = await page.evaluate((threadId) => (
    document.querySelector('[data-testid="agent-panel"]')?.getAttribute('data-thread-id') === threadId
      && document.querySelector('[data-testid="agent-panel"]')?.getAttribute('data-agent-state') === 'readOnly'
      && document.querySelector('.composer-field textarea')?.disabled === true
  ), importedThreadId);
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '05-imported-conversation-after-restart.png') });
  await page.getByTestId(`project-conversation-${projectThreadId}`).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: /^Gate B complete$/ }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-item-type="webSearch"]', { hasText: 'LimeShot projection contract' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-item-type="fileChange"]', { hasText: 'gate-b-projection.txt' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-item-type="mcpToolCall"]', { hasText: 'gate_b/echo_tool' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-item-type="imageGeneration"]', { hasText: 'LimeShot projection image' }).waitFor({ timeout: 60_000 });
  await page.locator('.agent-turn[data-status="interrupted"]').waitFor({ timeout: 60_000 });
  await page.getByTitle('打开项目详情').click();
  await page.locator('.plan-panel > header > span[data-state="approved"]').waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="task-run-list"] [data-operation-id="transcode-source"][data-task-state="succeeded"]').first().waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="task-run-list"] [data-operation-id="transcode-source"][data-task-state="canceled"]').waitFor({ timeout: 20_000 });
  await page.locator(`[data-testid="task-run-list"] [data-operation-id="transcode-source"][data-retry-of="${canceledTaskRunId}"][data-task-state="succeeded"]`).waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="artifact-list"] [data-artifact-type="media-manifest.v1"]').waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="artifact-list"] [data-artifact-type="media-output.v1"]').first().waitFor({ timeout: 20_000 });
  await page.locator(`[data-testid="artifact-list"] [data-artifact-type="qa-report.v1"][data-task-run-id="${retriedTaskRunId}"][data-qa-state="passed"]`).waitFor({ timeout: 20_000 });
  await page.locator(`[data-testid="deliverable-list"] [data-artifact-id="${retriedOutputArtifactId}"][data-current="true"]`).waitFor({ timeout: 20_000 });
  if (screenshotDir) {
    await page.getByTestId('execution-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, '06-media-execution-after-restart.png') });
  }

  const semanticEvidence = await page.evaluate(async ({ seededName, seededConversationId, createdName, createdConversationId, standaloneId }) => {
    const project = (await window.limeShot.project.list()).find((candidate) => candidate.name === seededName);
    if (!project) throw new Error('Gate B project is missing from semantic preload API');
    const createdProject = (await window.limeShot.project.list()).find((candidate) => candidate.name === createdName);
    if (!createdProject) throw new Error('New project is missing from semantic preload API');
    const [history, plans, execution] = await Promise.all([
      window.limeShot.agent.startConversation({ projectId: project.projectId, conversationId: seededConversationId }),
      window.limeShot.plan.list(project.projectId),
      window.limeShot.execution.read(project.projectId),
    ]);
    const [createdProjectDetail, createdConversation, standaloneConversation] = await Promise.all([
      window.limeShot.project.read(createdProject.projectId),
      window.limeShot.agent.startConversation({ projectId: createdProject.projectId, conversationId: createdConversationId }),
      window.limeShot.agent.startConversation({ projectId: null, conversationId: standaloneId, threadId: standaloneId }),
    ]);
    return { history, plans, execution, createdProject, createdProjectDetail, createdConversation, standaloneConversation };
  }, { seededName: projectName, seededConversationId: projectConversationId, createdName: openedProjectName, createdConversationId: openedConversationId, standaloneId: standaloneThreadId });
  const requests = fixture.requests();
  const firstRequest = JSON.stringify(requests[0] ?? {});
  const secondRequest = JSON.stringify(requests[1] ?? {});
  const thirdRequest = JSON.stringify(requests[2] ?? {});
  const shellOutputRequest = JSON.stringify(requests[4] ?? {});
  const patchOutputRequest = JSON.stringify(requests[5] ?? {});
  const mcpToolOutput = requests[7]?.input?.find((item) => item.type === 'function_call_output'
    && item.call_id === 'gate-b-mcp-1');
  const userInputOutputRequest = JSON.stringify(requests[8] ?? {});
  const standaloneRequest = JSON.stringify(requests[11] ?? {});
  const openedProjectRequest = JSON.stringify(requests[12] ?? {});
  const evidence = await page.evaluate(() => ({
    source: document.querySelector('[data-testid="runtime-status"]')?.getAttribute('data-runtime-source'),
    runtimeTitle: document.querySelector('[data-testid="runtime-status"]')?.getAttribute('title') ?? '',
    assistantVisible: Array.from(document.querySelectorAll('.agent-item[data-kind="assistant"]')).some((item) => item.textContent?.trim() === 'Gate B complete'),
    planState: document.querySelector('.plan-panel > header > span')?.getAttribute('data-state') ?? '',
  }));
  const historyRestored = semanticEvidence.history.turns.some((turn) => turn.status === 'completed'
    && turn.items.some((item) => item.kind === 'assistant' && item.text === 'Gate B complete'));
  const restoredItemTypes = new Set(semanticEvidence.history.turns.flatMap((turn) => turn.items.map((item) => item.type)));
  const projectionsRestored = ['webSearch', 'reasoning', 'commandExecution', 'fileChange', 'mcpToolCall', 'imageGeneration']
    .every((type) => restoredItemTypes.has(type));
  const interruptRestored = semanticEvidence.history.turns.some((turn) => turn.status === 'interrupted');
  const dynamicToolAdvertised = firstRequest.includes('project_read');
  const planToolAdvertised = firstRequest.includes('plan_create');
  const toolActivityVisible = activityTools.includes('project_read') && activityTools.includes('plan_create');
  const projectToolOutputRouted = secondRequest.includes('function_call_output')
    && secondRequest.includes('gate-b-tool-1')
    && secondRequest.includes(projectName);
  const planToolOutputRouted = thirdRequest.includes('function_call_output')
    && thirdRequest.includes('gate-b-tool-2')
    && thirdRequest.includes('Gate B production plan');
  const shellOutputRouted = shellOutputRequest.includes('function_call_output')
    && shellOutputRequest.includes('gate-b-shell-1')
    && shellOutputRequest.includes('gate-b-shell-output');
  const patchOutputRouted = patchOutputRequest.includes('gate-b-patch-1')
    && patchOutputRequest.includes('Gate B diff projection');
  const mcpOutputRouted = typeof mcpToolOutput?.output === 'string'
    && mcpToolOutput.output.includes('"verified":true');
  const userInputOutputRouted = userInputOutputRequest.includes('function_call_output')
    && userInputOutputRequest.includes('gate-b-user-input-1')
    && userInputOutputRequest.includes('confirm_projection');
  const standaloneExcludedBusinessTools = !standaloneRequest.includes('project_read') && !standaloneRequest.includes('plan_create');
  const openedProjectAdvertisedBusinessTools = openedProjectRequest.includes('project_read') && openedProjectRequest.includes('plan_create');
  const approvedPlanPersisted = semanticEvidence.plans.plans.some((plan) => plan.state === 'approved' && plan.approvedBy === 'user');
  const mediaTaskPersisted = semanticEvidence.execution.taskRuns.some((task) => task.state === 'succeeded')
    && semanticEvidence.execution.mediaJobs.some((job) => job.state === 'succeeded');
  const mediaArtifact = semanticEvidence.execution.artifacts.find((artifact) => artifact.artifactType === 'media-manifest.v1');
  const mediaOutputArtifact = semanticEvidence.execution.artifacts.find((artifact) => artifact.artifactType === 'media-output.v1');
  const canceledTask = semanticEvidence.execution.taskRuns.find((task) => task.taskRunId === canceledTaskRunId);
  const retriedTask = semanticEvidence.execution.taskRuns.find((task) => task.retryOfTaskRunId === canceledTaskRunId);
  const retriedMediaJob = semanticEvidence.execution.mediaJobs.find((job) => job.taskRunId === retriedTask?.taskRunId);
  const retriedOutputArtifact = semanticEvidence.execution.artifacts.find((artifact) => artifact.artifactType === 'media-output.v1'
    && artifact.lineage.taskRunId === retriedTask?.taskRunId);
  const retriedQaArtifact = semanticEvidence.execution.artifacts.find((artifact) => artifact.artifactType === 'qa-report.v1'
    && artifact.lineage.taskRunId === retriedTask?.taskRunId);
  const currentDeliverables = semanticEvidence.execution.deliverables.filter((deliverable) => deliverable.isCurrent);
  const sourceAssetPersisted = semanticEvidence.execution.sourceAssets.some((asset) => asset.state === 'probed' && !JSON.stringify(asset).includes(sourceAssetPath));
  const artifactLineagePersisted = Boolean(mediaArtifact
    && mediaArtifact.lineage.planId === semanticEvidence.plans.plans[0]?.planId
    && mediaArtifact.lineage.sourceAssetId === semanticEvidence.execution.sourceAssets[0]?.sourceAssetId
    && existsSync(join(workspace, mediaArtifact.relativePath)));
  const mediaOutputPersisted = Boolean(mediaOutputArtifact
    && mediaOutputArtifact.lineage.planId === semanticEvidence.plans.plans[0]?.planId
    && existsSync(join(workspace, mediaOutputArtifact.relativePath))
    && semanticEvidence.execution.taskRuns.some((task) => task.operationId === 'transcode-source' && task.state === 'succeeded')
    && semanticEvidence.execution.taskRuns.some((task) => task.operationId === 'transcode-source' && task.state === 'canceled'));
  const retryLineagePersisted = Boolean(canceledTask?.state === 'canceled'
    && retriedTask?.state === 'succeeded'
    && retriedTask.retryOfTaskRunId === canceledTask.taskRunId
    && retriedMediaJob?.state === 'succeeded'
    && retriedOutputArtifact
    && existsSync(join(workspace, retriedOutputArtifact.relativePath)));
  const qaReportPersisted = Boolean(retriedQaArtifact?.qa?.passed
    && retriedQaArtifact.qa.checks.every((check) => check.passed)
    && existsSync(join(workspace, retriedQaArtifact.relativePath)));
  const currentDeliverablePersisted = currentDeliverables.length === 1
    && currentDeliverables[0].artifactId === retriedOutputArtifact?.artifactId
    && currentDeliverables[0].qaArtifactId === retriedQaArtifact?.artifactId;
  const structuredProbeArgv = ffprobeArgv.includes('-show_entries')
    && ffprobeArgv.includes('-of\njson')
    && ffprobeArgv.includes(join(workspace, 'assets'));
  const structuredFfmpegArgv = ffmpegArgv.includes('-progress\npipe:1')
    && ffmpegArgv.includes('-c:v\nmpeg4')
    && ffmpegArgv.includes('-c:a\naac')
    && ffmpegArgv.includes('-f\nmp4')
    && ffmpegArgv.includes(join(workspace, 'assets'))
    && ffmpegArgv.includes('.part');
  const directoryProjectOpened = semanticEvidence.createdProject.workspaceName === openedProjectName
    && semanticEvidence.createdProjectDetail.brief.content.subject === ''
    && semanticEvidence.createdConversation.access === 'active'
    && semanticEvidence.createdConversation.threadId === openedThreadId
    && existsSync(openedProjectPath)
    && !existsSync(join(userData, 'projects', openedProjectName));
  const openedProjectRestoredAfterRestart = semanticEvidence.createdConversation.turns.some((turn) => turn.status === 'completed'
    && turn.items.some((item) => item.kind === 'assistant' && item.text.includes('Opened project complete')));
  const standaloneRestoredAfterRestart = semanticEvidence.standaloneConversation.threadId === standaloneThreadId
    && semanticEvidence.standaloneConversation.turns.some((turn) => turn.status === 'completed'
      && turn.items.some((item) => item.kind === 'assistant' && item.text.includes('Standalone Gate B complete')));
  const gateEvidence = {
    hasPreload: foundationEvidence.hasPreload,
    businessSource: evidence.source === 'business-service',
    profileCatalog: foundationEvidence.profileCount === 5,
    runtimePid: evidence.runtimeTitle.includes('PID'),
    toolActivityVisible,
    assistantVisible: evidence.assistantVisible,
    providerRequestCount: requests.length === 13,
    dynamicToolAdvertised,
    planToolAdvertised,
    projectToolOutputRouted,
    planToolOutputRouted,
    shellOutputRouted,
    patchOutputRouted,
    mcpOutputRouted,
    userInputOutputRouted,
    activityInspector: Object.values(activityInspectorEvidence).every(Boolean),
    projectionBoundary: Object.values(projectionBoundaryEvidence).every(Boolean),
    projectionActivity: Object.values(projectionActivityEvidence).every(Boolean),
    projectionDetail: Object.values(projectionDetailEvidence).every(Boolean),
    projectionBoundaryParity: Object.values(projectionBoundaryParityEvidence).every(Boolean),
    approvalInteractionVisible: ['commandApproval', 'fileApproval'].includes(approvalKind),
    mcpElicitationVisible,
    userInputNarrow: Object.values(userInputNarrowEvidence).every(Boolean),
    interruptVisible,
    narrowViewport: Object.values(narrowViewportEvidence).every(Boolean),
    standaloneExcludedBusinessTools,
    openedProjectAdvertisedBusinessTools,
    historyRestored,
    projectionsRestored,
    interruptRestored,
    projectResponsive: Object.values(projectResponsiveEvidence).every(Boolean),
    approvalReceiptPersisted: Boolean(approvalReceiptId),
    planApprovedInGui: evidence.planState === 'approved',
    approvedPlanPersisted,
    mediaTaskPersisted,
    sourceAssetPersisted,
    artifactLineagePersisted,
    structuredProbeArgv,
    mediaOutputPersisted,
    retryLineagePersisted,
    qaReportPersisted,
    currentDeliverablePersisted,
    structuredFfmpegArgv,
    transcodeProgressVisible: transcodeProgressBeforeCancel > 0 && transcodeProgressBeforeCancel < 100,
    ffmpegProcessReaped,
    partialOutputsCleaned,
    projectRowOpensHome,
    newConversationHome: Object.values(newConversationHome).every(Boolean),
    sidebarParity: Object.values(sidebarParityEvidence).every(Boolean),
    conversationImport: Object.values(automaticImportListing).every(Boolean) && Object.values(conversationImportEvidence).every(Boolean) && importedTurnRejected,
    openedProjectExistingHistoryNested,
    openedProjectExistingHistoryRestored,
    sidebarMenus: Object.values(sidebarMenuEvidence).every(Boolean),
    importedConversationRestoredAfterRestart,
    directoryProjectOpened,
    openedProjectRestoredAfterRestart,
    standaloneRestoredAfterRestart,
  };
  if (Object.values(gateEvidence).some((value) => !value)) {
    throw new Error(`Gate B 证据不完整: ${JSON.stringify({
      gateEvidence,
      mcpOutput: requests[7]?.input,
      restoredItemTypes: [...restoredItemTypes],
      narrowViewportEvidence,
      projectionBoundaryEvidence,
      projectionActivityEvidence,
      projectionDetailEvidence,
      projectionBoundaryParityEvidence,
      activityInspectorEvidence,
      sidebarParityEvidence,
      sidebarMenuEvidence,
      automaticImportListing,
      conversationImportEvidence,
      importedTurnRejected,
    })}`);
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
    shellOutputRouted,
    patchOutputRouted,
    mcpOutputRouted,
    userInputOutputRouted,
    projectionBoundaryEvidence,
    projectionActivityEvidence,
    projectionDetailEvidence,
    projectionBoundaryParityEvidence,
    activityInspectorEvidence,
    approvalKind,
    mcpElicitationVisible,
    userInputNarrowEvidence,
    interruptVisible,
    narrowViewportEvidence,
    standaloneExcludedBusinessTools,
    openedProjectAdvertisedBusinessTools,
    historyRestored,
    projectionsRestored,
    interruptRestored,
    projectResponsiveEvidence,
    approvedPlanPersisted,
    mediaTaskPersisted,
    sourceAssetPersisted,
    artifactLineagePersisted,
    structuredProbeArgv,
    mediaOutputPersisted,
    retryLineagePersisted,
    qaReportPersisted,
    currentDeliverablePersisted,
    structuredFfmpegArgv,
    transcodeProgressBeforeCancel,
    ffmpegProcessReaped,
    partialOutputsCleaned,
    projectRowOpensHome,
    newConversationHome,
    sidebarParityEvidence,
    automaticImportListing,
    conversationImportEvidence,
    importedTurnRejected,
    openedProjectExistingHistoryNested,
    openedProjectExistingHistoryRestored,
    sidebarMenuEvidence,
    importedConversationRestoredAfterRestart,
    importDialogCallCount,
    directoryProjectOpened,
    openedProjectRestoredAfterRestart,
    standaloneRestoredAfterRestart,
    projectDialogCallCount,
    approvalReceiptId,
    gateEvidence,
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
      toolNames: Array.isArray(request.tools) ? request.tools.map((tool) => tool.namespace ? `${tool.namespace}/${tool.name}` : tool.name ?? tool.type) : [],
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

async function writeCodexConfig(codexHome, baseUrl, mcpFixturePath) {
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, 'config.toml'), `
model = "gpt-5.4"
approval_policy = "on-request"
sandbox_mode = "read-only"
model_provider = "mock_provider"
web_search = "live"

[features]
default_mode_request_user_input = true
image_generation = true

[model_providers.mock_provider]
name = "LimeShot Gate B fixture"
base_url = "${baseUrl}/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
http_headers = { "x-openai-actor-authorization" = "gate-b-actor" }

[mcp_servers.gate_b]
command = "${tomlString(process.execPath)}"
args = ["${tomlString(mcpFixturePath)}"]
startup_timeout_sec = 10
tool_timeout_sec = 10
`);
}

function seedCodexExecHistory({ codexBinary, codexHome, cwd, prompt }) {
  const env = { ...process.env, CODEX_HOME: codexHome };
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[key];
  env.NO_PROXY = '127.0.0.1,localhost';
  env.no_proxy = env.NO_PROXY;
  return new Promise((resolveHistory, rejectHistory) => {
    const child = spawn(codexBinary, ['exec', '--skip-git-repo-check', '--json', '-C', cwd, prompt], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    const timeout = setTimeout(() => child.kill(), 120_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectHistory(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectHistory(new Error(`无法预置 Codex 历史: code=${String(code)} signal=${String(signal)} stderr=${stderr.trim()} stdout=${stdout.trim()}`));
        return;
      }
      const events = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      const started = events.find((event) => event.type === 'thread.started');
      if (typeof started?.thread_id !== 'string' || !started.thread_id) {
        rejectHistory(new Error(`Codex exec 未返回 Thread 标识: ${stdout}`));
        return;
      }
      resolveHistory({ threadId: started.thread_id, assistantText: historySeedAssistantText(prompt) });
    });
  });
}

async function writeMcpFixture(path) {
  await writeFile(path, `
import { createInterface } from 'node:readline';

const lines = createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n');

lines.on('line', (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  if (request.id === undefined || request.id === null) return;
  if (request.method === 'initialize') {
    send({ jsonrpc: '2.0', id: request.id, result: {
      protocolVersion: request.params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'limeshot-gate-b', version: '1.0.0' },
    } });
    return;
  }
  if (request.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: request.id, result: { tools: [{
      name: 'echo_tool',
      description: 'Return deterministic Gate B projection content.',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
        additionalProperties: false,
      },
    }] } });
    return;
  }
  if (request.method === 'tools/call') {
    const message = String(request.params?.arguments?.message ?? '');
    send({ jsonrpc: '2.0', id: request.id, result: {
      content: [
        { type: 'text', text: 'MCP Gate B echo: ' + message + '\\nMCP-TEXT-START-' + 'x'.repeat(10_000) + '-MCP-TEXT-END' },
        { type: 'resource_link', uri: 'mcp://gate-b/projection', name: 'Projection resource' },
      ],
      structuredContent: { echoed: message, verified: true, apiKey: 'gate-b-mcp-private-value' },
      isError: false,
    } });
    return;
  }
  if (request.method === 'ping') {
    send({ jsonrpc: '2.0', id: request.id, result: {} });
    return;
  }
  send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } });
});
`);
}

function tomlString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
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
      protocolVersion: businessProtocol.protocolVersion,
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
  const gateRequestBodies = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/v1/images/generations') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        created: 1,
        data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' }],
      }));
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const seedEvents = historySeedResponseEvents(requestBody);
    if (!seedEvents) gateRequestBodies.push(requestBody);
    const events = seedEvents ?? gateBResponseEvents(gateRequestBodies.length, requestBody);
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
    requests: () => [...gateRequestBodies],
    close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())),
  };
}

function historySeedResponseEvents(requestBody) {
  const input = JSON.stringify(requestBody.input ?? []);
  for (const prompt of ['Gate B existing parent-directory conversation.', 'Gate B existing nested-directory conversation.']) {
    if (input.includes(prompt)) {
      return assistantResponse(`seed-${createHash('sha256').update(prompt).digest('hex').slice(0, 12)}`, `seed-message-${createHash('sha256').update(prompt).digest('hex').slice(0, 12)}`, historySeedAssistantText(prompt));
    }
  }
  return undefined;
}

function historySeedAssistantText(prompt) {
  return prompt.includes('nested-directory') ? 'Existing nested Codex history' : 'Existing parent Codex history';
}

function gateBResponseEvents(index, requestBody) {
  if (index === 1) {
    return [
      responseCreated('gate-b-response-1'),
      functionCall('gate-b-tool-1', 'project_read', {}),
      responseCompleted('gate-b-response-1'),
    ];
  }
  if (index === 2) {
    return [
      responseCreated('gate-b-response-2'),
      functionCall('gate-b-tool-2', 'plan_create', {
        title: 'Gate B production plan',
        summary: 'Produce a verified desktop workflow.',
        deliverables: ['Verified MP4'],
        operations: [
          { operationId: 'probe-source', kind: 'media_probe', title: 'Probe imported source', capabilityId: null, dependsOn: [] },
          { operationId: 'transcode-source', kind: 'media_transcode', title: 'Create normalized MP4', capabilityId: null, dependsOn: ['probe-source'] },
        ],
        gaps: [],
        risks: ['Provider capability remains unavailable'],
      }),
      functionCall('gate-b-tool-failed', 'plan_create', { title: '' }),
      responseCompleted('gate-b-response-2'),
    ];
  }
  if (index === 3) return assistantResponse('gate-b-response-3', 'gate-b-message-1', 'Gate B complete');
  if (index === 4) {
    const commandTool = requireTool(requestBody, ['exec_command', 'shell_command']);
    const commandArguments = commandTool === 'exec_command'
      ? { cmd: "printf 'gate-b-shell-output\\n'", yield_time_ms: 1_000 }
      : { command: "printf 'gate-b-shell-output\\n'", timeout_ms: 5_000 };
    return [
      responseCreated('gate-b-response-4'),
      {
        type: 'response.output_item.done',
        item: {
          type: 'web_search_call',
          id: 'gate-b-search-1',
          status: 'completed',
          action: { type: 'search', query: 'LimeShot projection contract' },
        },
      },
      {
        type: 'response.output_item.done',
        item: {
          type: 'reasoning',
          id: 'gate-b-reasoning-1',
          summary: [{ type: 'summary_text', text: 'Verify semantic projection order.' }],
          encrypted_content: Buffer.from('b'.repeat(600)).toString('base64'),
        },
      },
      {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'gate-b-image-1',
          namespace: 'image_gen',
          name: 'imagegen',
          arguments: JSON.stringify({ prompt: 'LimeShot projection image' }),
        },
      },
      functionCall('gate-b-shell-1', commandTool, commandArguments),
      responseCompleted('gate-b-response-4'),
    ];
  }
  if (index === 5) {
    const patch = '*** Begin Patch\n*** Add File: gate-b-projection.txt\n+Gate B diff projection\n*** End Patch\n';
    const applyPatch = advertisedTool(requestBody, 'apply_patch');
    if (applyPatch) {
      return [
        responseCreated('gate-b-response-5'),
        { type: 'response.output_item.done', item: { type: 'custom_tool_call', call_id: 'gate-b-patch-1', name: 'apply_patch', input: patch } },
        responseCompleted('gate-b-response-5'),
      ];
    }
    const commandTool = requireTool(requestBody, ['exec_command', 'shell_command']);
    const command = `apply_patch <<'PATCH'\n${patch}PATCH\n`;
    return [
      responseCreated('gate-b-response-5'),
      functionCall('gate-b-patch-1', commandTool, commandTool === 'exec_command' ? { cmd: command } : { command }),
      responseCompleted('gate-b-response-5'),
    ];
  }
  if (index === 6) {
    if (!advertisedTool(requestBody, 'tool_search')) {
      throw new Error(`Codex tool_search was not advertised: ${JSON.stringify(requestBody.tools ?? [])}`);
    }
    return [
      responseCreated('gate-b-response-6'),
      {
        type: 'response.output_item.done',
        item: {
          type: 'tool_search_call',
          call_id: 'gate-b-search-tools-1',
          execution: 'client',
          arguments: { query: 'MCP gate_b echo_tool', limit: 8 },
        },
      },
      responseCompleted('gate-b-response-6'),
    ];
  }
  if (index === 7) {
    const discoveredTools = JSON.stringify(requestBody.input ?? []);
    if (!discoveredTools.includes('mcp__gate_b') || !discoveredTools.includes('echo_tool')) {
      throw new Error(`MCP Gate B tool was not discovered: ${discoveredTools}`);
    }
    return [
      responseCreated('gate-b-response-7'),
      {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'gate-b-mcp-1',
          namespace: 'mcp__gate_b',
          name: 'echo_tool',
          arguments: JSON.stringify({ message: 'projection-ready' }),
        },
      },
      responseCompleted('gate-b-response-7'),
    ];
  }
  if (index === 8) {
    if (!advertisedTool(requestBody, 'request_user_input')) {
      throw new Error(`request_user_input was not advertised: ${JSON.stringify(requestBody.tools ?? [])}`);
    }
    return [
      responseCreated('gate-b-response-8'),
      functionCall('gate-b-user-input-1', 'request_user_input', {
        questions: [
          {
            id: 'confirm_projection',
            header: 'Confirm',
            question: 'Keep the verified projections?',
            isOther: true,
            options: [
              { label: 'Yes (Recommended)', description: 'Keep the verified projection result.' },
              { label: 'No', description: 'Discard the projection result.' },
            ],
          },
          {
            id: 'secret_note',
            header: 'Secret',
            question: 'Enter a secret verification value.',
            isOther: true,
            isSecret: true,
            options: [
              { label: 'Provide secret', description: 'Enter the verification value privately.' },
              { label: 'Skip secret', description: 'Continue without a verification value.' },
            ],
          },
        ],
      }),
      responseCompleted('gate-b-response-8'),
    ];
  }
  if (index === 9) return assistantResponse('gate-b-response-9', 'gate-b-message-2', 'Projection Gate B complete');
  if (index === 10) {
    const commandTool = requireTool(requestBody, ['exec_command', 'shell_command']);
    return [
      responseCreated('gate-b-response-10'),
      functionCall('gate-b-interrupt-1', commandTool, commandTool === 'exec_command'
        ? { cmd: 'sleep 30', yield_time_ms: 1_000 }
        : { command: 'sleep 30', timeout_ms: 30_000 }),
      responseCompleted('gate-b-response-10'),
    ];
  }
  if (index === 11) return assistantResponse('gate-b-response-11', 'gate-b-message-import', 'Imported Codex history');
  if (index === 12) return assistantResponse('gate-b-response-12', 'gate-b-message-3', 'Standalone Gate B complete');
  if (index === 13) return assistantResponse('gate-b-response-13', 'gate-b-message-4', 'Opened project complete');
  return [];
}

function functionCall(callId, name, argumentsValue) {
  return {
    type: 'response.output_item.done',
    item: { type: 'function_call', call_id: callId, name, arguments: JSON.stringify(argumentsValue) },
  };
}

function assistantResponse(responseId, messageId, text) {
  return [
    responseCreated(responseId),
    {
      type: 'response.output_item.done',
      item: { type: 'message', role: 'assistant', id: messageId, content: [{ type: 'output_text', text }] },
    },
    responseCompleted(responseId),
  ];
}

function requireTool(requestBody, names) {
  const name = names.find((candidate) => advertisedTool(requestBody, candidate));
  if (!name) throw new Error(`Required Gate B tool was not advertised (${names.join(', ')}): ${JSON.stringify(requestBody.tools ?? [])}`);
  return name;
}

function advertisedTool(requestBody, name, namespace) {
  if (!Array.isArray(requestBody.tools)) return false;
  return requestBody.tools.some((tool) => {
    if (namespace === undefined) return tool?.name === name || tool?.type === name;
    if (tool?.name === name && tool?.namespace === namespace) return true;
    return tool?.type === 'namespace'
      && tool?.name === namespace
      && Array.isArray(tool.tools)
      && tool.tools.some((nested) => nested?.name === name);
  });
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

async function writeWaveFixture(path) {
  const sampleRate = 8_000;
  const samples = 800;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  await writeFile(path, buffer);
}

function compileFfprobeFixture(path) {
  const source = resolve(root, 'scripts', 'smoke', 'fixtures', 'ffprobe.rs');
  const compiled = spawnSync('rustc', [source, '-O', '-o', path], { encoding: 'utf8' });
  if (compiled.status !== 0) {
    throw new Error(`FFprobe fixture 编译失败: ${compiled.stderr || compiled.stdout}`);
  }
}

function compileFfmpegFixture(path) {
  const source = resolve(root, 'scripts', 'smoke', 'fixtures', 'ffmpeg.rs');
  const compiled = spawnSync('rustc', [source, '-O', '-o', path], { encoding: 'utf8' });
  if (compiled.status !== 0) {
    throw new Error(`FFmpeg fixture 编译失败: ${compiled.stderr || compiled.stdout}`);
  }
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}
