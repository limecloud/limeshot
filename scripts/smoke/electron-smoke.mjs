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
const sourceAssetPath = join(userData, 'source.wav');
const ffprobeLog = join(userData, 'ffprobe-argv.txt');
const ffprobeFixture = join(userData, process.platform === 'win32' ? 'ffprobe-fixture.exe' : 'ffprobe-fixture');
const ffmpegLog = join(userData, 'ffmpeg-argv.txt');
const ffmpegPidLog = join(userData, 'ffmpeg-active-pid.txt');
const ffmpegFixture = join(userData, process.platform === 'win32' ? 'ffmpeg-fixture.exe' : 'ffmpeg-fixture');
const projectName = 'Gate B project';
const openedProjectName = 'opened-project';
const openedProjectPath = join(userData, openedProjectName);
const screenshotDir = process.env.LIMESHOT_SMOKE_SCREENSHOT_DIR;
let application;

try {
  await mkdir(workspace, { recursive: true });
  await mkdir(openedProjectPath, { recursive: true });
  await writeWaveFixture(sourceAssetPath);
  compileFfprobeFixture(ffprobeFixture);
  compileFfmpegFixture(ffmpegFixture);
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
      LIMESHOT_FFPROBE_BIN: ffprobeFixture,
      LIMESHOT_FFMPEG_BIN: ffmpegFixture,
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

  const newConversationButton = page.locator('.sidebar-actions').getByRole('button', { name: '新建会话' });
  await newConversationButton.click();
  await page.getByTestId('home-workspace').waitFor({ timeout: 20_000 });
  const newConversationHome = await page.evaluate(() => {
    const composer = document.querySelector('.home-composer textarea');
    const projectSelector = document.querySelector('.composer-selectors select:last-child');
    return {
      homeVisible: Boolean(document.querySelector('[data-testid="home-workspace"]')),
      conversationHidden: !document.querySelector('[data-testid="agent-panel"]'),
      composerFocused: document.activeElement === composer,
      oldConversationHidden: !document.body.innerText.includes('Gate B complete'),
      newProjectSelected: projectSelector instanceof HTMLSelectElement && projectSelector.value === '',
    };
  });
  await page.locator('.project-nav-item', { hasText: projectName }).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Gate B complete' }).waitFor({ timeout: 60_000 });

  await page.getByTitle('打开项目详情').click();
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '03-project-details.png') });
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
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.locator('.project-nav-item', { hasText: openedProjectName }).waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  if (await page.locator('.app-action-error').count() !== 0) {
    throw new Error(`新建项目出现 GUI 错误: ${await page.locator('.app-action-error').allTextContents()}`);
  }
  const projectDialogCallCount = await application.evaluate(() => globalThis.__limeshotDialogCallCount ?? -1);
  if (projectDialogCallCount !== 1) throw new Error(`新建项目系统目录选择器调用次数错误: ${projectDialogCallCount}`);

  await application.close();
  application = await launchElectron(electronLaunchOptions);
  page = await application.firstWindow();
  await page.locator('[data-testid="runtime-status"][data-state="ready"]').waitFor({ timeout: 20_000 });
  await page.locator('.project-nav-item', { hasText: openedProjectName }).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  if (await page.locator('.app-action-error').count() !== 0) {
    throw new Error(`冷启动恢复新项目出现 GUI 错误: ${await page.locator('.app-action-error').allTextContents()}`);
  }
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, '05-opened-project-after-restart.png') });
  await page.locator('.project-nav-item', { hasText: projectName }).click();
  await page.locator('[data-testid="agent-panel"][data-agent-state="ready"]').waitFor({ timeout: 60_000 });
  await page.locator('.agent-item[data-kind="assistant"]', { hasText: 'Gate B complete' }).waitFor({ timeout: 60_000 });
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

  const semanticEvidence = await page.evaluate(async ({ seededName, createdName }) => {
    const project = (await window.limeShot.project.list()).find((candidate) => candidate.name === seededName);
    if (!project) throw new Error('Gate B project is missing from semantic preload API');
    const createdProject = (await window.limeShot.project.list()).find((candidate) => candidate.name === createdName);
    if (!createdProject) throw new Error('New project is missing from semantic preload API');
    const [history, plans, execution] = await Promise.all([
      window.limeShot.agent.startConversation({ projectId: project.projectId, conversationId: 'main' }),
      window.limeShot.plan.list(project.projectId),
      window.limeShot.execution.read(project.projectId),
    ]);
    const [createdProjectDetail, createdConversation] = await Promise.all([
      window.limeShot.project.read(createdProject.projectId),
      window.limeShot.agent.startConversation({ projectId: createdProject.projectId, conversationId: 'main' }),
    ]);
    return { history, plans, execution, createdProject, createdProjectDetail, createdConversation };
  }, { seededName: projectName, createdName: openedProjectName });
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
    && Boolean(semanticEvidence.createdConversation.threadId)
    && existsSync(openedProjectPath)
    && !existsSync(join(userData, 'projects', openedProjectName));
  const openedProjectRestoredAfterRestart = semanticEvidence.createdConversation.turns.length === 0;
  const gateEvidence = {
    hasPreload: foundationEvidence.hasPreload,
    businessSource: evidence.source === 'business-service',
    profileCatalog: foundationEvidence.profileCount === 5,
    runtimePid: evidence.runtimeText.includes('PID'),
    toolActivityVisible,
    assistantVisible: evidence.assistantVisible,
    providerRequestCount: requests.length === 3,
    dynamicToolAdvertised,
    planToolAdvertised,
    projectToolOutputRouted,
    planToolOutputRouted,
    historyRestored,
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
    newConversationHome: Object.values(newConversationHome).every(Boolean),
    directoryProjectOpened,
    openedProjectRestoredAfterRestart,
  };
  if (Object.values(gateEvidence).some((value) => !value)) {
    throw new Error(`Gate B 证据不完整: ${JSON.stringify(gateEvidence)}`);
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
    newConversationHome,
    importDialogCallCount,
    directoryProjectOpened,
    openedProjectRestoredAfterRestart,
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
      protocolVersion: 4,
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
                  operations: [
                    { operationId: 'probe-source', kind: 'media_probe', title: 'Probe imported source', capabilityId: null, dependsOn: [] },
                    { operationId: 'transcode-source', kind: 'media_transcode', title: 'Create normalized MP4', capabilityId: null, dependsOn: ['probe-source'] },
                  ],
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
