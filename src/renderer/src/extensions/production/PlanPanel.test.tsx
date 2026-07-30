// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProductionPlan } from '@business/generated';
import { createTranslator } from './i18n';
import { PlanPanel } from './PlanPanel';

const readyPlan: ProductionPlan = {
  planId: 'plan-1',
  projectId: 'project-1',
  version: 2,
  state: 'ready_for_review',
  briefId: 'brief-1',
  briefVersion: 3,
  content: {
    title: '口播制作计划',
    summary: '完成一条 30 秒口播视频。',
    deliverables: ['成片 MP4'],
    operations: [{ operationId: 'script', kind: 'script', title: '确认口播稿', capabilityId: null, dependsOn: [] }],
    gaps: [],
    risks: ['声音样本尚未授权'],
  },
  createdBy: 'agent',
  approvedBy: null,
  createdAtEpochMs: 1,
  approvedAtEpochMs: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlanPanel', () => {
  it('records an explicit user approval and projects its immutable receipt', async () => {
    const approved = { ...readyPlan, state: 'approved' as const, approvedBy: 'user', approvedAtEpochMs: 2 };
    const decide = vi.fn(async () => ({
      plan: approved,
      receipt: {
        approvalId: 'approval-1',
        projectId: readyPlan.projectId,
        planId: readyPlan.planId,
        planVersion: readyPlan.version,
        decision: 'approve' as const,
        actor: 'user',
        note: '',
        decidedAtEpochMs: 2,
      },
    }));
    Object.defineProperty(window, 'limeShot', {
      configurable: true,
      value: { approval: { decide } },
    });
    const onPlanUpdated = vi.fn();

    render(<PlanPanel plans={[readyPlan]} onPlanUpdated={onPlanUpdated} t={createTranslator('zh-CN')} />);
    fireEvent.click(screen.getByRole('button', { name: '批准计划' }));

    await waitFor(() => expect(decide).toHaveBeenCalledWith({
      projectId: 'project-1',
      planId: 'plan-1',
      expectedVersion: 2,
      decision: 'approve',
      note: '',
    }));
    expect(onPlanUpdated).toHaveBeenCalledWith(approved);
    expect((await screen.findByTestId('approval-receipt')).getAttribute('data-approval-id')).toBe('approval-1');
  });
});
