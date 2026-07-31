// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectReadResult } from '@business/generated';
import { createTranslator } from './i18n';
import { ProductionProject } from './ProductionProject';

const detail: ProjectReadResult = {
  project: {
    projectId: 'project-1', name: 'Production project', profileId: 'general', state: 'active',
    workspaceName: 'production-project', createdAtEpochMs: 1, updatedAtEpochMs: 1,
  },
  brief: {
    briefId: 'brief-1', projectId: 'project-1', version: 1, completeness: 'workable',
    missingFields: [], conflicts: [], createdAtEpochMs: 1,
    content: {
      subject: 'Initial subject', audience: 'Editors', platform: 'desktop', targetDurationSeconds: 30,
      aspectRatio: '16:9', language: 'zh-CN', style: 'technical', mustInclude: [], prohibited: [], deliveryFormat: 'mp4',
    },
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProductionProject', () => {
  it('keeps production surfaces in extension-owned tabs and projects brief save state', async () => {
    const updatedBrief = { ...detail.brief, version: 2, content: { ...detail.brief.content, subject: 'Updated subject' } };
    const updateBrief = vi.fn(async () => ({ brief: updatedBrief }));
    const readExecution = vi.fn(async () => ({ sourceAssets: [], taskRuns: [], mediaJobs: [], artifacts: [], deliverables: [] }));
    window.limeShot = {
      project: { updateBrief },
      execution: { read: readExecution },
    } as unknown as typeof window.limeShot;

    function Harness() {
      const [current, setCurrent] = useState(detail);
      return (
        <ProductionProject
          detail={current}
          plans={[]}
          mediaProbeReady
          mediaTranscodeReady
          onBriefUpdated={(brief) => setCurrent((value) => ({ ...value, brief }))}
          onPlanUpdated={vi.fn()}
          t={createTranslator('zh-CN')}
        />
      );
    }

    render(<Harness />);
    expect(screen.getByText('全能模式')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Brief' }).getAttribute('aria-selected')).toBe('true');
    const saveButton = screen.getByRole('button', { name: '保存 Brief' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: '内容目标' }), { target: { value: 'Updated subject' } });
    expect(screen.getByText('有未保存的修改')).toBeTruthy();
    expect(saveButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateBrief).toHaveBeenCalledWith({
      projectId: 'project-1', expectedVersion: 1, brief: updatedBrief.content,
    }));
    expect(await screen.findByText('Brief 已保存')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '制作计划' }));
    expect(screen.getByText('Agent 尚未创建制作计划')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '素材与任务' }));
    await waitFor(() => expect(readExecution).toHaveBeenCalledWith('project-1'));
  });
});
