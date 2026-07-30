import { describe, expect, it } from 'vitest';

import { createTranslator, localeDictionaries, resolveLocale } from './i18n';

describe('i18n', () => {
  it('keeps all five locale dictionaries structurally aligned', () => {
    const dictionaries = Object.values(localeDictionaries);
    const expectedKeys = Object.keys(dictionaries[0]).sort();
    for (const dictionary of dictionaries) {
      expect(Object.keys(dictionary).sort()).toEqual(expectedKeys);
      expect(Object.values(dictionary).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it('resolves supported locales and defaults to simplified Chinese', () => {
    expect(resolveLocale('zh-Hant-HK')).toBe('zh-TW');
    expect(resolveLocale('ja')).toBe('ja-JP');
    expect(resolveLocale('fr-FR')).toBe('zh-CN');
    expect(createTranslator('en-US')('agent.newConversation')).toBe('New conversation');
  });

  it('localizes the review workspace in all supported languages', () => {
    expect(createTranslator('zh-CN')('inspector.review')).toBe('审阅');
    expect(createTranslator('zh-TW')('inspector.changedFiles')).toBe('已修改檔案');
    expect(createTranslator('en-US')('inspector.filterFiles')).toBe('Filter files');
    expect(createTranslator('ja-JP')('inspector.openReview')).toBe('レビューを開く');
    expect(createTranslator('ko-KR')('inspector.closeReview')).toBe('검토 닫기');
  });

  it('localizes the workspace chrome in all supported languages', () => {
    expect(createTranslator('zh-CN')('workspace.tab.tasks')).toBe('侧边任务');
    expect(createTranslator('zh-TW')('workspace.toggleBottomPanel')).toBe('切換底部面板');
    expect(createTranslator('en-US')('workspace.expandPanel')).toBe('Expand full width');
    expect(createTranslator('ja-JP')('workspace.tab.terminal')).toBe('ターミナル');
    expect(createTranslator('ko-KR')('workspace.openTab')).toBe('새 탭 열기');
  });

  it('localizes the Composer model picker in all supported languages', () => {
    expect(createTranslator('zh-CN')('composer.model.effort.default')).toBe('默认');
    expect(createTranslator('zh-TW')('composer.model.effort.xhigh')).toBe('極高');
    expect(createTranslator('en-US')('composer.model.effort.low')).toBe('Low');
    expect(createTranslator('ja-JP')('composer.model.updateFailed')).toBe('モデル設定を更新できません');
    expect(createTranslator('ko-KR')('composer.model.usageFaster')).toBe('사용 한도를 더 빠르게 소모합니다');
  });

  it('localizes Composer attachments and modes in all supported languages', () => {
    expect(createTranslator('zh-CN')('composer.add.filesAndFolders')).toBe('文件和文件夹');
    expect(createTranslator('zh-TW')('composer.add.captureWindow')).toBe('擷取應用程式視窗');
    expect(createTranslator('en-US')('composer.add.openProject')).toBe('Choose or create folder');
    expect(createTranslator('ja-JP')('composer.placeholder.plan')).toBe('計画するタスクを入力');
    expect(createTranslator('ko-KR')('composer.add.removeAttachment')).toBe('첨부 파일 제거');
  });
});
