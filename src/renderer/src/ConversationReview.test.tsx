// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConversationReview } from './ConversationReview';
import { createTranslator } from './i18n';

afterEach(cleanup);

describe('ConversationReview', () => {
  it('renders a large diff surface with a separate file tree and controlled selection', () => {
    const selectChange = vi.fn();
    const t = createTranslator('zh-CN');
    const turns = [{
      id: 'turn-1', status: 'completed' as const, itemsView: 'full' as const, items: [{
        id: 'change-1', type: 'fileChange' as const, kind: 'activity' as const, text: '', status: 'completed' as const,
        changes: [
          { path: 'src/components/App.tsx', kind: 'update', diff: '--- a/src/components/App.tsx\n+++ b/src/components/App.tsx\n@@ -1,2 +1,3 @@\n-old\n+new\n+next\n context' },
          { path: 'src/new.ts', kind: 'create', diff: '--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+export {}' },
        ],
      }],
    }];
    const props = { turns, onSelectedChangePathChange: selectChange, t };
    const { rerender } = render(<ConversationReview {...props} selectedChangePath="src/components/App.tsx" />);

    expect(screen.getByRole('region', { name: '审阅' }).getAttribute('data-selected-change-path')).toBe('src/components/App.tsx');
    expect(screen.getByRole('complementary', { name: '已修改文件' })).toBeTruthy();
    expect(screen.getByText('components')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'src/components/App.tsx' }).getAttribute('data-selected')).toBe('true');
    expect(screen.getAllByLabelText('+2 -1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('conversation-diff-viewer').querySelector('[data-diff-line="addition"]')?.textContent).toContain('+new');
    expect(screen.getByTestId('conversation-diff-viewer').querySelector('[data-diff-line="deletion"]')?.textContent).toContain('-old');
    expect(screen.getByTestId('conversation-diff-viewer').textContent).toContain('23 context');
    expect(document.querySelector('.conversation-status-surface')).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: '筛选文件' }), { target: { value: 'new.ts' } });
    expect(screen.queryByRole('button', { name: 'src/components/App.tsx' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'src/new.ts' }));
    expect(selectChange).toHaveBeenCalledWith('src/new.ts');

    rerender(<ConversationReview {...props} selectedChangePath="src/new.ts" />);
    expect(screen.getByTestId('conversation-diff-viewer').getAttribute('data-change-path')).toBe('src/new.ts');
    expect(screen.getByTestId('conversation-diff-viewer').textContent).toContain('+export {}');
  });

  it('uses the aggregate diff only when structured file changes are unavailable', () => {
    render(
      <ConversationReview
        turns={[{ id: 'turn-aggregate', status: 'completed', itemsView: 'full', items: [], diff: '@@ -1 +1 @@\n-old\n+new' }]}
        onSelectedChangePathChange={vi.fn()}
        t={createTranslator('zh-CN')}
      />,
    );

    expect(screen.getByText('聚合变更')).toBeTruthy();
    expect(screen.getByTestId('conversation-diff-viewer').querySelectorAll('[data-diff-line]')).toHaveLength(3);
  });
});
