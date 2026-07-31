// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProductionPlan, ProjectExecutionReadResult } from '@business/generated';
import { ExecutionPanel } from './ExecutionPanel';
import { createTranslator } from './i18n';

const plan: ProductionPlan = {
  planId: 'plan-1',
  projectId: 'project-1',
  version: 1,
  state: 'approved',
  briefId: 'brief-1',
  briefVersion: 1,
  createdBy: 'agent',
  approvedBy: 'user',
  createdAtEpochMs: 1,
  approvedAtEpochMs: 2,
  content: {
    title: 'Media output',
    summary: 'Probe and transcode',
    deliverables: ['MP4'],
    gaps: [],
    risks: [],
    operations: [
      { operationId: 'probe-source', kind: 'media_probe', title: 'Probe', capabilityId: null, dependsOn: [] },
      { operationId: 'transcode-source', kind: 'media_transcode', title: 'Transcode', capabilityId: null, dependsOn: ['probe-source'] },
    ],
  },
};

const sourceAsset = {
  sourceAssetId: 'asset-1', projectId: 'project-1', displayName: 'source.wav', mediaKind: 'audio',
  byteSize: 64, sha256: 'a'.repeat(64), state: 'probed' as const, probeArtifactId: 'artifact-probe',
  importedAtEpochMs: 1, updatedAtEpochMs: 2,
};

const emptyExecution: ProjectExecutionReadResult = {
  sourceAssets: [sourceAsset],
  taskRuns: [],
  mediaJobs: [],
  artifacts: [],
  deliverables: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ExecutionPanel', () => {
  it('starts the approved structured transcode through the semantic API', async () => {
    const start = vi.fn(async () => undefined);
    installApi(vi.fn(async () => emptyExecution), start, vi.fn(), vi.fn());
    render(React.createElement(ExecutionPanel, {
      projectId: 'project-1', plans: [plan], mediaProbeReady: true, mediaTranscodeReady: true,
      t: createTranslator('zh-CN'),
    }));
    fireEvent.click(await screen.findByRole('button', { name: '生成 MP4' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({
      projectId: 'project-1', planId: 'plan-1', sourceAssetId: 'asset-1', operationId: 'transcode-source',
    }));
  });

  it('cancels a running media task without exposing process details', async () => {
    const running: ProjectExecutionReadResult = {
      ...emptyExecution,
      taskRuns: [{
        taskRunId: 'task-1', projectId: 'project-1', planId: 'plan-1', planVersion: 1,
        approvalId: 'approval-1', sourceAssetId: 'asset-1', operationId: 'transcode-source',
        retryOfTaskRunId: null, state: 'running', inputSha256: sourceAsset.sha256, mediaJobId: 'media-1', artifactIds: [],
        errorCode: null, createdAtEpochMs: 1, startedAtEpochMs: 2, completedAtEpochMs: null,
      }],
      mediaJobs: [{
        mediaJobId: 'media-1', taskRunId: 'task-1', operation: 'media_transcode', state: 'running',
        progressPercent: 52, errorCode: null, createdAtEpochMs: 1, startedAtEpochMs: 2, completedAtEpochMs: null,
      }],
    };
    const cancel = vi.fn(async () => undefined);
    installApi(vi.fn(async () => running), vi.fn(), cancel, vi.fn());
    render(React.createElement(ExecutionPanel, {
      projectId: 'project-1', plans: [plan], mediaProbeReady: true, mediaTranscodeReady: true,
      t: createTranslator('zh-CN'),
    }));
    fireEvent.click(await screen.findByTitle('取消任务'));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ projectId: 'project-1', taskRunId: 'task-1' }));
    expect(screen.getByText('52%')).toBeTruthy();
  });

  it('retries a canceled task through its stable task identity', async () => {
    const canceled: ProjectExecutionReadResult = {
      ...emptyExecution,
      taskRuns: [{
        taskRunId: 'task-canceled', projectId: 'project-1', planId: 'plan-1', planVersion: 1,
        approvalId: 'approval-1', sourceAssetId: 'asset-1', operationId: 'transcode-source',
        retryOfTaskRunId: null, state: 'canceled', inputSha256: sourceAsset.sha256,
        mediaJobId: 'media-canceled', artifactIds: [], errorCode: 'TASK_CANCELED',
        createdAtEpochMs: 1, startedAtEpochMs: 2, completedAtEpochMs: 3,
      }],
      mediaJobs: [{
        mediaJobId: 'media-canceled', taskRunId: 'task-canceled', operation: 'media_transcode',
        state: 'canceled', progressPercent: 10, errorCode: 'TASK_CANCELED', createdAtEpochMs: 1,
        startedAtEpochMs: 2, completedAtEpochMs: 3,
      }],
    };
    const retry = vi.fn(async () => undefined);
    installApi(vi.fn(async () => canceled), vi.fn(), vi.fn(), retry);
    render(React.createElement(ExecutionPanel, {
      projectId: 'project-1', plans: [plan], mediaProbeReady: true, mediaTranscodeReady: true,
      t: createTranslator('zh-CN'),
    }));
    fireEvent.click(await screen.findByTitle('重试任务'));
    await waitFor(() => expect(retry).toHaveBeenCalledWith({
      projectId: 'project-1', taskRunId: 'task-canceled',
    }));
  });

  it('projects deterministic media QA failure from the task error code', async () => {
    const failed: ProjectExecutionReadResult = {
      ...emptyExecution,
      taskRuns: [{
        taskRunId: 'task-qa-failed', projectId: 'project-1', planId: 'plan-1', planVersion: 1,
        approvalId: 'approval-1', sourceAssetId: 'asset-1', operationId: 'transcode-source',
        retryOfTaskRunId: null, state: 'failed', inputSha256: sourceAsset.sha256,
        mediaJobId: 'media-qa-failed', artifactIds: [], errorCode: 'MEDIA_QA_FAILED',
        createdAtEpochMs: 1, startedAtEpochMs: 2, completedAtEpochMs: 3,
      }],
      mediaJobs: [{
        mediaJobId: 'media-qa-failed', taskRunId: 'task-qa-failed', operation: 'media_transcode',
        state: 'failed', progressPercent: 95, errorCode: 'MEDIA_QA_FAILED', createdAtEpochMs: 1,
        startedAtEpochMs: 2, completedAtEpochMs: 3,
      }],
    };
    installApi(vi.fn(async () => failed), vi.fn(), vi.fn(), vi.fn());
    render(React.createElement(ExecutionPanel, {
      projectId: 'project-1', plans: [plan], mediaProbeReady: true, mediaTranscodeReady: true,
      t: createTranslator('zh-CN'),
    }));

    expect(await screen.findByText('QA 未通过')).toBeTruthy();
    expect(screen.getByText('QA 未通过').closest('li')?.getAttribute('data-error-code')).toBe('MEDIA_QA_FAILED');
  });

  it('confirms only a media output with passing QA through the semantic API', async () => {
    const outputArtifact = {
      artifactId: 'artifact-output', projectId: 'project-1', artifactType: 'media-output.v1', schemaVersion: 1,
      relativePath: 'outputs/final.mp4', byteSize: 128, sha256: 'b'.repeat(64), createdAtEpochMs: 3, qa: null,
      lineage: { sourceAssetId: 'asset-1', planId: 'plan-1', planVersion: 1, approvalId: 'approval-1', taskRunId: 'task-output', mediaJobId: 'media-output' },
      media: { durationMs: 1_000, container: 'mp4', byteSize: 128, streams: [{ index: 0, kind: 'audio', codec: 'aac', width: null, height: null, sampleRate: 48_000, channels: 2 }] },
    };
    const qaArtifact = {
      ...outputArtifact,
      artifactId: 'artifact-qa', artifactType: 'qa-report.v1', relativePath: '.limeshot/artifacts/artifact-qa.json',
      qa: { passed: true, checks: [{ checkId: 'container.mp4', passed: true, detail: 'container=mp4' }] },
    };
    const execution = { ...emptyExecution, artifacts: [qaArtifact, outputArtifact] };
    const confirm = vi.fn(async () => ({
      deliverable: {
        deliverableId: 'deliverable-1', projectId: 'project-1', artifactId: outputArtifact.artifactId,
        qaArtifactId: qaArtifact.artifactId, planId: 'plan-1', planVersion: 1, displayName: 'project.mp4',
        media: outputArtifact.media, confirmedBy: 'user', confirmedAtEpochMs: 4, isCurrent: true,
      },
    }));
    installApi(vi.fn(async () => execution), vi.fn(), vi.fn(), vi.fn(), confirm);
    render(React.createElement(ExecutionPanel, {
      projectId: 'project-1', plans: [plan], mediaProbeReady: true, mediaTranscodeReady: true,
      t: createTranslator('zh-CN'),
    }));

    expect(await screen.findAllByText('QA 通过')).toHaveLength(2);
    expect(screen.getAllByText('媒体成片')).toHaveLength(1);
    expect(screen.getAllByText(/1s · MP4 · 1 个媒体流/)).toHaveLength(2);
    expect(screen.queryByText('media-output.v1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认交付' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ projectId: 'project-1', artifactId: 'artifact-output' }));
  });
});

function installApi(
  read: ReturnType<typeof vi.fn>,
  start: ReturnType<typeof vi.fn>,
  cancel: ReturnType<typeof vi.fn>,
  retry: ReturnType<typeof vi.fn>,
  confirm: ReturnType<typeof vi.fn> = vi.fn(),
) {
  window.limeShot = {
    execution: { read },
    sourceAsset: { import: vi.fn() },
    task: { start, cancel, retry },
    deliverable: { confirm },
  } as unknown as typeof window.limeShot;
}
