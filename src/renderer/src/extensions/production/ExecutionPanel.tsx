import { BadgeCheck, FileUp, Film, FileVideo2, LoaderCircle, PackageCheck, Play, RotateCcw, ScanSearch, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ProjectExecutionReadResult, ProductionPlan, SourceAsset } from '@business/generated';
import type { TranslationKey } from './i18n';

interface ExecutionPanelProps {
  projectId: string;
  plans: ProductionPlan[];
  mediaProbeReady: boolean;
  mediaTranscodeReady: boolean;
  t: (key: TranslationKey) => string;
}

const emptyExecution: ProjectExecutionReadResult = {
  sourceAssets: [],
  taskRuns: [],
  mediaJobs: [],
  artifacts: [],
  deliverables: [],
};

export function ExecutionPanel({ projectId, plans, mediaProbeReady, mediaTranscodeReady, t }: ExecutionPanelProps) {
  const [execution, setExecution] = useState<ProjectExecutionReadResult>(emptyExecution);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [activeOperationId, setActiveOperationId] = useState<string>();
  const [cancelingTaskId, setCancelingTaskId] = useState<string>();
  const [retryingTaskId, setRetryingTaskId] = useState<string>();
  const [confirmingArtifactId, setConfirmingArtifactId] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const approvedOperation = useMemo(() => {
    for (const plan of plans) {
      if (!['approved', 'executing'].includes(plan.state)) continue;
      const operation = plan.content.operations.find((candidate) => candidate.kind === 'media_probe');
      if (operation) return { plan, operation };
    }
    return undefined;
  }, [plans]);
  const approvedTranscode = useMemo(() => {
    for (const plan of plans) {
      if (!['approved', 'executing'].includes(plan.state)) continue;
      const operation = plan.content.operations.find((candidate) => candidate.kind === 'media_transcode');
      if (operation) return { plan, operation };
    }
    return undefined;
  }, [plans]);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const result = await window.limeShot.execution.read(projectId);
      setExecution(result);
      setSelectedAssetId((current) => result.sourceAssets.some((asset) => asset.sourceAssetId === current)
        ? current
        : result.sourceAssets[0]?.sourceAssetId ?? '');
      setErrorMessage(undefined);
    } catch (error) {
      console.error('Failed to load project execution state', error);
      setErrorMessage(t('execution.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    setExecution(emptyExecution);
    setSelectedAssetId('');
    void load(true);
  }, [load]);

  const hasActiveTask = execution.taskRuns.some((task) => ['queued', 'running'].includes(task.state));
  useEffect(() => {
    if (!hasActiveTask) return undefined;
    const timer = window.setInterval(() => void load(false), 300);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, load]);

  const importAsset = async () => {
    setImporting(true);
    setErrorMessage(undefined);
    try {
      const result = await window.limeShot.sourceAsset.import(projectId);
      if (!result) return;
      setExecution((current) => ({
        ...current,
        sourceAssets: [result.sourceAsset, ...current.sourceAssets],
      }));
      setSelectedAssetId(result.sourceAsset.sourceAssetId);
    } catch (error) {
      console.error('Failed to import source asset', error);
      setErrorMessage(t('execution.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const startOperation = async (approved: typeof approvedOperation) => {
    if (!approved || !selectedAssetId) return;
    setActiveOperationId(approved.operation.operationId);
    setErrorMessage(undefined);
    try {
      await window.limeShot.task.start({
        projectId,
        planId: approved.plan.planId,
        sourceAssetId: selectedAssetId,
        operationId: approved.operation.operationId,
      });
      await load(false);
    } catch (error) {
      console.error('Failed to start media operation', error);
      setErrorMessage(t('execution.startFailed'));
      await load(false).catch(() => undefined);
    } finally {
      setActiveOperationId(undefined);
    }
  };

  const cancelTask = async (taskRunId: string) => {
    setCancelingTaskId(taskRunId);
    setErrorMessage(undefined);
    try {
      await window.limeShot.task.cancel({ projectId, taskRunId });
      await load(false);
    } catch (error) {
      console.error('Failed to cancel media task', error);
      setErrorMessage(t('execution.cancelFailed'));
    } finally {
      setCancelingTaskId(undefined);
    }
  };

  const retryTask = async (taskRunId: string) => {
    setRetryingTaskId(taskRunId);
    setErrorMessage(undefined);
    try {
      await window.limeShot.task.retry({ projectId, taskRunId });
      await load(false);
    } catch (error) {
      console.error('Failed to retry media task', error);
      setErrorMessage(t('execution.retryFailed'));
      await load(false).catch(() => undefined);
    } finally {
      setRetryingTaskId(undefined);
    }
  };

  const confirmDeliverable = async (artifactId: string) => {
    setConfirmingArtifactId(artifactId);
    setErrorMessage(undefined);
    try {
      await window.limeShot.deliverable.confirm({ projectId, artifactId });
      await load(false);
    } catch (error) {
      console.error('Failed to confirm deliverable', error);
      await load(false).catch(() => undefined);
      setErrorMessage(t('execution.confirmFailed'));
    } finally {
      setConfirmingArtifactId(undefined);
    }
  };

  const selectedAsset = execution.sourceAssets.find((asset) => asset.sourceAssetId === selectedAssetId);
  const retriedTaskIds = new Set(execution.taskRuns.flatMap((task) => task.retryOfTaskRunId ? [task.retryOfTaskRunId] : []));
  const qaByTaskRunId = new Map(execution.artifacts
    .filter((artifact) => artifact.artifactType === 'qa-report.v1' && artifact.qa)
    .map((artifact) => [artifact.lineage.taskRunId, artifact.qa]));
  const currentDeliverable = execution.deliverables.find((deliverable) => deliverable.isCurrent);
  const blockedReason = !approvedOperation
    ? t('execution.planRequired')
    : !mediaProbeReady
      ? t('execution.runtimeRequired')
      : undefined;
  const transcodeBlockedReason = !approvedTranscode
    ? t('execution.transcodePlanRequired')
    : !mediaTranscodeReady
      ? t('execution.transcodeRuntimeRequired')
      : selectedAsset?.state !== 'probed'
        ? t('execution.probeRequired')
        : undefined;

  return (
    <section className="execution-panel" data-testid="execution-panel" data-probe-ready={mediaProbeReady ? 'true' : 'false'}>
      <header>
        <div><Film size={16} aria-hidden="true" /><h3>{t('execution.title')}</h3></div>
        <button className="secondary-command" type="button" disabled={importing} onClick={() => void importAsset()} data-testid="source-asset-import">
          {importing ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <FileUp size={14} aria-hidden="true" />}
          {importing ? t('execution.importing') : t('execution.import')}
        </button>
      </header>

      {loading ? <p className="execution-empty">{t('project.loading')}</p> : (
        <>
          <div className="execution-control">
            <label>
              <span>{t('execution.source')}</span>
              <select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} data-testid="source-asset-select">
                <option value="">{t('execution.selectAsset')}</option>
                {execution.sourceAssets.map((asset) => (
                  <option key={asset.sourceAssetId} value={asset.sourceAssetId}>{asset.displayName}</option>
                ))}
              </select>
            </label>
            <div className="execution-commands">
              <button
                className="secondary-command"
                type="button"
                disabled={!selectedAsset || !approvedOperation || !mediaProbeReady || Boolean(activeOperationId)}
                onClick={() => void startOperation(approvedOperation)}
                data-testid="media-probe-start"
              >
                {activeOperationId === approvedOperation?.operation.operationId
                  ? <LoaderCircle className="spin" size={14} aria-hidden="true" />
                  : <Play size={14} aria-hidden="true" />}
                {activeOperationId === approvedOperation?.operation.operationId ? t('execution.probing') : t('execution.startProbe')}
              </button>
              <button
                className="primary-command"
                type="button"
                disabled={!selectedAsset || !approvedTranscode || !mediaTranscodeReady || selectedAsset.state !== 'probed' || Boolean(activeOperationId) || hasActiveTask}
                onClick={() => void startOperation(approvedTranscode)}
                data-testid="media-transcode-start"
              >
                {activeOperationId === approvedTranscode?.operation.operationId
                  ? <LoaderCircle className="spin" size={14} aria-hidden="true" />
                  : <FileVideo2 size={14} aria-hidden="true" />}
                {activeOperationId === approvedTranscode?.operation.operationId ? t('execution.transcoding') : t('execution.startTranscode')}
              </button>
            </div>
          </div>
          {selectedAsset ? <AssetSummary asset={selectedAsset} t={t} /> : <p className="execution-empty">{t('execution.noAssets')}</p>}
          {blockedReason ? <p className="execution-notice">{blockedReason}</p> : null}
          {transcodeBlockedReason && !blockedReason ? <p className="execution-notice">{transcodeBlockedReason}</p> : null}

          <div className="execution-result-grid">
            <section className="execution-history">
              <h4><ScanSearch size={14} aria-hidden="true" />{t('execution.recentTasks')}</h4>
              {execution.taskRuns.length === 0 ? <p className="execution-empty">{t('execution.noTasks')}</p> : (
                <ul data-testid="task-run-list">
                {execution.taskRuns.slice(0, 4).map((task) => {
                  const job = execution.mediaJobs.find((candidate) => candidate.mediaJobId === task.mediaJobId);
                  const cancelable = ['queued', 'running'].includes(task.state);
                  const retryable = ['failed', 'canceled', 'interrupted'].includes(task.state)
                    && !retriedTaskIds.has(task.taskRunId);
                  const retryRuntimeReady = job?.operation === 'media_transcode'
                    ? mediaTranscodeReady
                    : job?.operation === 'media_probe' && mediaProbeReady;
                  return (
                    <li
                      key={task.taskRunId}
                      data-task-run-id={task.taskRunId}
                      data-task-state={task.state}
                      data-operation-id={task.operationId}
                      data-retry-of={task.retryOfTaskRunId ?? ''}
                      data-progress={job?.progressPercent ?? 0}
                      data-error-code={task.errorCode ?? ''}
                    >
                      <span>{operationLabel(job?.operation, task.operationId, t)}</span>
                      <div className="task-status">
                        {job && cancelable ? <small>{job.progressPercent}%</small> : null}
                        <strong className={task.errorCode === 'MEDIA_QA_FAILED' ? 'qa-failed' : undefined}>
                          {task.errorCode === 'MEDIA_QA_FAILED'
                            ? t('execution.qaFailed')
                            : t(`execution.task.${task.state}` as TranslationKey)}
                        </strong>
                        {cancelable ? (
                          <button
                            className="icon-command"
                            type="button"
                            title={t('execution.cancel')}
                            disabled={cancelingTaskId === task.taskRunId}
                            onClick={() => void cancelTask(task.taskRunId)}
                            data-testid={`task-cancel-${task.taskRunId}`}
                          >
                            {cancelingTaskId === task.taskRunId
                              ? <LoaderCircle className="spin" size={12} aria-hidden="true" />
                              : <Square size={11} fill="currentColor" aria-hidden="true" />}
                          </button>
                        ) : null}
                        {retryable ? (
                          <button
                            className="icon-command"
                            type="button"
                            title={t('execution.retry')}
                            disabled={!retryRuntimeReady || Boolean(retryingTaskId) || hasActiveTask}
                            onClick={() => void retryTask(task.taskRunId)}
                            data-testid={`task-retry-${task.taskRunId}`}
                          >
                            {retryingTaskId === task.taskRunId
                              ? <LoaderCircle className="spin" size={12} aria-hidden="true" />
                              : <RotateCcw size={12} aria-hidden="true" />}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                </ul>
              )}
            </section>

          <section className="execution-history">
            <h4>{t('execution.artifacts')}</h4>
            {execution.artifacts.length === 0 ? <p className="execution-empty">{t('execution.noArtifacts')}</p> : (
              <ul data-testid="artifact-list">
                {execution.artifacts.slice(0, 8).map((artifact) => {
                  const qa = artifact.qa ?? qaByTaskRunId.get(artifact.lineage.taskRunId);
                  const isCurrent = currentDeliverable?.artifactId === artifact.artifactId;
                  const confirmable = artifact.artifactType === 'media-output.v1' && qa?.passed;
                  return (
                    <li
                      key={artifact.artifactId}
                      data-artifact-id={artifact.artifactId}
                      data-artifact-type={artifact.artifactType}
                      data-task-run-id={artifact.lineage.taskRunId}
                      data-qa-state={qa ? (qa.passed ? 'passed' : 'failed') : 'none'}
                    >
                      <span>{artifactLabel(artifact.artifactType, t)}</span>
                      <div className="artifact-status">
                        {qa ? (
                          <strong className={qa.passed ? 'qa-passed' : 'qa-failed'}>
                            {qa.passed ? t('execution.qaPassed') : t('execution.qaFailed')}
                          </strong>
                        ) : <strong>{formatDuration(artifact.media.durationMs)}</strong>}
                        {isCurrent ? (
                          <strong className="deliverable-current"><BadgeCheck size={12} aria-hidden="true" />{t('execution.current')}</strong>
                        ) : null}
                        {confirmable && !isCurrent ? (
                          <button
                            className="secondary-command artifact-confirm"
                            type="button"
                            disabled={Boolean(confirmingArtifactId)}
                            onClick={() => void confirmDeliverable(artifact.artifactId)}
                            data-testid={`deliverable-confirm-${artifact.artifactId}`}
                          >
                            {confirmingArtifactId === artifact.artifactId
                              ? <LoaderCircle className="spin" size={12} aria-hidden="true" />
                              : <PackageCheck size={12} aria-hidden="true" />}
                            {confirmingArtifactId === artifact.artifactId ? t('execution.confirming') : t('execution.confirmDeliverable')}
                          </button>
                        ) : null}
                      </div>
                      <small>{formatDuration(artifact.media.durationMs)} · {formatContainer(artifact.media.container)} · {artifact.media.streams.length} {t('execution.streams')}</small>
                    </li>
                  );
                })}
              </ul>
            )}
            </section>

          <section className="execution-history">
            <h4><PackageCheck size={14} aria-hidden="true" />{t('execution.deliverables')}</h4>
            {execution.deliverables.length === 0 ? <p className="execution-empty">{t('execution.noDeliverables')}</p> : (
              <ul data-testid="deliverable-list">
                {execution.deliverables.map((deliverable) => (
                  <li
                    key={deliverable.deliverableId}
                    data-deliverable-id={deliverable.deliverableId}
                    data-artifact-id={deliverable.artifactId}
                    data-current={deliverable.isCurrent ? 'true' : 'false'}
                  >
                    <span>{deliverable.displayName}</span>
                    {deliverable.isCurrent ? (
                      <strong className="deliverable-current"><BadgeCheck size={12} aria-hidden="true" />{t('execution.current')}</strong>
                    ) : <strong>{formatDuration(deliverable.media.durationMs)}</strong>}
                    <small>{formatContainer(deliverable.media.container)} · {deliverable.media.streams.length} {t('execution.streams')}</small>
                  </li>
                ))}
              </ul>
            )}
            </section>
          </div>
        </>
      )}
      {errorMessage ? <p className="inline-error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}

function operationLabel(operation: string | undefined, fallback: string, t: (key: TranslationKey) => string) {
  if (operation === 'media_probe') return t('execution.operation.probe');
  if (operation === 'media_transcode') return t('execution.operation.transcode');
  if (fallback === 'probe-source') return t('execution.operation.probe');
  if (fallback === 'transcode-source') return t('execution.operation.transcode');
  return t('execution.operation.other');
}

function artifactLabel(artifactType: string, t: (key: TranslationKey) => string) {
  if (artifactType === 'media-manifest.v1') return t('execution.artifact.mediaManifest');
  if (artifactType === 'media-output.v1') return t('execution.artifact.mediaOutput');
  if (artifactType === 'qa-report.v1') return t('execution.artifact.qaReport');
  return t('execution.artifact.other');
}

function formatContainer(container: string) {
  const formats = container.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (formats.includes('mp4')) return 'MP4';
  return formats[0]?.toUpperCase() ?? container;
}

function AssetSummary({ asset, t }: { asset: SourceAsset; t: (key: TranslationKey) => string }) {
  return (
    <div className="source-asset-summary" data-testid="source-asset" data-source-state={asset.state}>
      <div><strong>{asset.displayName}</strong><span>{asset.mediaKind} · {formatBytes(asset.byteSize)}</span></div>
      <span>{t(`execution.asset.${asset.state}` as TranslationKey)}</span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 1)}s`;
}
