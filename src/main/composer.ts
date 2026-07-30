import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { app, BrowserWindow, desktopCapturer, dialog, nativeImage, type OpenDialogOptions, type WebContents } from 'electron';

import type { CodexUserInput } from '@codex/index';
import type {
  AgentAttachmentPickInput,
  AgentCaptureSourceInput,
  AgentCaptureSourceOption,
  AgentComposerAttachment,
  AgentComposerAttachmentKind,
  AgentComposerCatalogResult,
} from '../shared/desktop';
import type { CodexSupervisor } from './codex/supervisor';

interface AttachmentRecord {
  ownerId: number;
  path: string;
  kind: AgentComposerAttachmentKind;
}

interface CapabilityRecord {
  ownerId: number;
  cwd: string;
  input: CodexUserInput;
}

interface CaptureRecord {
  ownerId: number;
  label: string;
  png: Buffer;
}

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp']);
const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']);

export class ComposerHost {
  private readonly attachments = new Map<string, AttachmentRecord>();
  private readonly capabilities = new Map<string, CapabilityRecord>();
  private readonly captureSources = new Map<string, CaptureRecord>();

  constructor(private readonly codex: CodexSupervisor) {}

  async listCatalog(ownerId: number, cwd: string): Promise<AgentComposerCatalogResult> {
    for (const [id, capability] of this.capabilities) {
      if (capability.ownerId === ownerId && capability.cwd === cwd) this.capabilities.delete(id);
    }
    const [modes, plugins] = await Promise.allSettled([
      this.codex.request('collaborationMode/list', {}),
      this.codex.request('plugin/list', { cwds: [cwd] }),
    ]);
    const capabilities = plugins.status === 'fulfilled'
      ? plugins.value.marketplaces
        .flatMap((marketplace) => marketplace.plugins)
        .filter((plugin, index, all) => plugin.installed
          && plugin.enabled
          && plugin.availability === 'AVAILABLE'
          && all.findIndex((candidate) => candidate.id === plugin.id) === index)
        .map((plugin) => {
          const label = plugin.interface?.displayName?.trim() || plugin.name;
          const description = plugin.interface?.shortDescription?.trim()
            || plugin.interface?.longDescription?.trim()
            || '';
          const id = randomUUID();
          this.capabilities.set(id, {
            ownerId,
            cwd,
            input: { type: 'mention', name: label, path: `plugin://${plugin.id}` },
          });
          const defaultPrompt = plugin.interface?.defaultPrompt?.find((prompt) => prompt.trim())?.trim();
          return {
            id,
            kind: 'plugin' as const,
            label,
            description,
            ...(defaultPrompt ? { defaultPrompt } : {}),
            recordSkill: plugin.name === 'record-and-replay',
          };
        })
        .sort((left, right) => left.label.localeCompare(right.label))
      : [];

    return {
      capabilities,
      planModeAvailable: modes.status === 'fulfilled'
        && modes.value.data.some((mode) => mode.mode === 'plan'),
      pluginLoadFailed: plugins.status === 'rejected'
        || plugins.value.marketplaceLoadErrors.length > 0,
    };
  }

  async pickAttachments(owner: WebContents, input: AgentAttachmentPickInput): Promise<AgentComposerAttachment[]> {
    if (!input || (input.selection !== 'files' && input.selection !== 'folder')) throw new Error('无效的附件选择类型');
    const properties: OpenDialogOptions['properties'] = input.selection === 'folder'
      ? ['openDirectory']
      : ['openFile', 'multiSelections'];
    const options: OpenDialogOptions = {
      properties,
      filters: input.selection === 'files' ? [{ name: 'All files', extensions: ['*'] }] : undefined,
    };
    const parent = BrowserWindow.fromWebContents(owner);
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    return Promise.all(result.filePaths.map((path) => this.registerPath(ownerId(owner), path)));
  }

  async listCaptureSources(owner: WebContents): Promise<AgentCaptureSourceOption[]> {
    const id = ownerId(owner);
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      fetchWindowIcons: true,
      thumbnailSize: { width: 1280, height: 800 },
    });
    return sources
      .filter((source) => !source.thumbnail.isEmpty())
      .map((source) => {
        const captureId = token(id, source.id, source.name);
        const png = source.thumbnail.toPNG();
        this.captureSources.set(captureId, { ownerId: id, label: source.name, png });
        const preview = nativeImage.createFromBuffer(png).resize({ width: 160, quality: 'good' });
        return { id: captureId, label: source.name, previewUrl: preview.toDataURL() };
      });
  }

  async captureSource(owner: WebContents, input: AgentCaptureSourceInput): Promise<AgentComposerAttachment> {
    const source = input && typeof input.id === 'string' ? this.captureSources.get(input.id) : undefined;
    if (!source || source.ownerId !== ownerId(owner)) throw new Error('截图来源已失效，请重新选择');
    this.captureSources.delete(input.id);
    const directory = join(app.getPath('temp'), 'limeshot-composer-captures');
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${randomUUID()}.png`);
    await writeFile(path, source.png);
    return this.registerPath(source.ownerId, path, 'appScreenshot', source.label);
  }

  resolveInputs(owner: WebContents, cwd: string, attachmentIds: string[], capabilityIds: string[]): CodexUserInput[] {
    const id = ownerId(owner);
    const uniqueAttachmentIds = unique(attachmentIds);
    const uniqueCapabilityIds = unique(capabilityIds);
    if (uniqueAttachmentIds.length > 32 || uniqueCapabilityIds.length > 16) throw new Error('Composer 选择项过多');
    const fileReferences: Array<{ label: string; path: string }> = [];
    const attachmentInputs = uniqueAttachmentIds.flatMap((attachmentId): CodexUserInput[] => {
      const attachment = this.attachments.get(attachmentId);
      if (!attachment || attachment.ownerId !== id) throw new Error('附件已失效，请重新选择');
      if (attachment.kind === 'image' || attachment.kind === 'appScreenshot') {
        return [{ type: 'localImage', path: attachment.path }];
      }
      if (attachment.kind === 'audio') return [{ type: 'localAudio', path: attachment.path }];
      fileReferences.push({ label: basename(attachment.path), path: attachment.path });
      return [];
    });
    const capabilityInputs = uniqueCapabilityIds.map((capabilityId): CodexUserInput => {
      const capability = this.capabilities.get(capabilityId);
      if (!capability || capability.ownerId !== id || capability.cwd !== cwd) throw new Error('插件能力已失效，请重新选择');
      return capability.input;
    });
    const fileInput = fileReferences.length > 0 ? [fileReferenceInput(fileReferences)] : [];
    return [...fileInput, ...attachmentInputs, ...capabilityInputs];
  }

  releaseInputs(owner: WebContents, attachmentIds: string[], capabilityIds: string[]): void {
    const id = ownerId(owner);
    for (const attachmentId of unique(attachmentIds)) {
      if (this.attachments.get(attachmentId)?.ownerId === id) this.attachments.delete(attachmentId);
    }
    for (const capabilityId of unique(capabilityIds)) {
      if (this.capabilities.get(capabilityId)?.ownerId === id) this.capabilities.delete(capabilityId);
    }
  }

  private async registerPath(ownerIdValue: number, path: string, forcedKind?: AgentComposerAttachmentKind, forcedLabel?: string): Promise<AgentComposerAttachment> {
    const file = await stat(path);
    const kind = forcedKind ?? attachmentKind(path, file.isDirectory());
    const id = randomUUID();
    this.attachments.set(id, { ownerId: ownerIdValue, path, kind });
    const previewUrl = kind === 'image' || kind === 'appScreenshot' ? imagePreview(path) : undefined;
    return {
      id,
      label: forcedLabel ?? basename(path),
      kind,
      ...(previewUrl ? { previewUrl } : {}),
    };
  }
}

function attachmentKind(path: string, directory: boolean): AgentComposerAttachmentKind {
  if (directory) return 'folder';
  const extension = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'file';
}

function imagePreview(path: string): string | undefined {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) return undefined;
  return image.resize({ width: 96, quality: 'good' }).toDataURL();
}

function fileReferenceInput(files: Array<{ label: string; path: string }>): CodexUserInput {
  const references = files.map((file) => `\n## ${file.label}: ${file.path}\n`).join('');
  return { type: 'text', text: `# Files mentioned by the user:\n${references}`, text_elements: [] };
}

function ownerId(owner: WebContents): number {
  return Number.isSafeInteger(owner.id) ? owner.id : 0;
}

function token(...parts: Array<string | number>): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))];
}
