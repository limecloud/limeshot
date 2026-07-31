// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProductionPlan } from '@business/generated';
import { createTranslator } from './i18n';
import { PlanPanel } from './PlanPanel';

const readyPlan: ProductionPlan = {
  planId: 'plan-1', projectId: 'project-1', version: 2, state: 'ready_for_review', briefId: 'brief-1', briefVersion: 1,
  createdBy: 'agent', approvedBy: null, createdAtEpochMs: 1, approvedAtEpochMs: null,
  content: {
    title: 'Production plan', summary: 'Create the final video.', deliverables: ['MP4'], gaps: [], risks: [],
    operations: [{ operationId: 'transcode', kind: 'media_transcode', title: 'Create MP4', capabilityId: null, dependsOn: [] }],
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PlanPanel request changes', () => {
  it('requires and submits a user-visible change note', async () => {
    const requested = { ...readyPlan, version: 3, state: 'needs_input' as const };
    const decide = vi.fn(async () => ({
      plan: requested,
      receipt: {
        approvalId: 'approval-1', projectId: 'project-1', planId: 'plan-1', planVersion: 2,
        decision: 'request_changes' as const, actor: 'user', note: 'Add subtitles', decidedAtEpochMs: 2,
      },
    }));
    window.limeShot = { approval: { decide } } as unknown as typeof window.limeShot;

    render(<PlanPanel plans={[readyPlan]} onPlanUpdated={vi.fn()} t={createTranslator('zh-CN')} />);
    fireEvent.click(screen.getByRole('button', { name: '要求修改' }));

    const note = screen.getByRole('textbox', { name: '修改意见' });
    const submit = screen.getByRole('button', { name: '提交修改意见' });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(note, { target: { value: '  Add subtitles  ' } });
    fireEvent.click(submit);

    await waitFor(() => expect(decide).toHaveBeenCalledWith({
      projectId: 'project-1', planId: 'plan-1', expectedVersion: 2,
      decision: 'request_changes', note: 'Add subtitles',
    }));
  });
});
