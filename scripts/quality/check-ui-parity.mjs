import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('../..', import.meta.url)));
const rendererRoot = join(root, 'src/renderer/src');
const rendererFiles = (await readdir(rendererRoot))
  .filter((name) => /\.(?:ts|tsx)$/.test(name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(name));
const rendererSource = (await Promise.all(rendererFiles.map((name) => readFile(join(rendererRoot, name), 'utf8')))).join('\n');
const files = {
  renderer: rendererSource,
  styles: await readFile(join(rendererRoot, 'styles.css'), 'utf8'),
};
const appSource = await readFile(join(rendererRoot, 'App.tsx'), 'utf8');
const homeSource = await readFile(join(rendererRoot, 'WorkspaceHome.tsx'), 'utf8');
const smokeSource = await readFile(join(root, 'scripts/smoke/electron-smoke.mjs'), 'utf8');

const forbidden = [
  ['legacy marketing banner', /workspace-banner|banner-features/],
  ['legacy profile summary card', /profile-summary/],
  ['legacy profile segmented control', /profile-workspace|profile-tabs|profile-tab/],
  ['legacy home marketing copy', /home\.(?:banner|feature|cue|profilePrompt|subtitle|foundation|selected|continue)/],
  ['purple brand block', /#7c3aed/i],
  ['saturated user bubble', /#278df0/i],
  ['legacy fixed content width', /--content-width:\s*760px/],
  ['legacy product brand row', /className=["']brand-row["']|\.brand-row(?:\s|[{>,.#:])|className=["']brand-mark["']|\.brand-mark(?:\s|[{>,.#:])/],
  ['raw reasoning surface', /agent\.rawReasoning|agent-nested-details/],
];

const required = [
  ['thread content width token', files.styles, /--thread-content-max-width:\s*48rem/],
  ['markdown content width token', files.styles, /--markdown-content-max-width:\s*40rem/],
  ['markdown wide block token', files.styles, /--markdown-wide-block-max-width:\s*56rem/],
  ['Electron toolbar token', files.styles, /--height-toolbar:\s*46px/],
  ['conversation item gap', files.styles, /--conversation-item-gap:\s*16px/],
  ['conversation grouped item gap', files.styles, /--conversation-grouped-item-gap:\s*4px/],
  ['pill row token', files.styles, /--radius-row:\s*9999px/],
  ['composer radius token', files.styles, /--radius-composer:\s*22px/],
  ['OpenAI Sans declaration', files.styles, /font-family:\s*"OpenAI Sans"/],
  ['main surface elevation', files.styles, /\.workspace[^}]*box-shadow:\s*var\(--elevation-prominent\)/s],
  ['Electron left panel', files.renderer, /app-shell-left-panel/],
  ['Electron product row', files.renderer, /sidebar-brand-row/],
  ['main surface class', appSource, /className="workspace main-surface"/],
  ['activity row summary', files.renderer, /agent-item-summary/],
  ['structured JSON redaction', files.renderer, /function redactJson/],
  ['mobile sidebar breakpoint', files.styles, /@media\s*\(max-width:\s*680px\)/],
  ['mobile sidebar overlay', files.styles, /\.sidebar\s*\{[^}]*position:\s*fixed/is],
  ['responsive inspector breakpoint', files.styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.workspace-inspector\s*\{[^}]*position:\s*absolute/],
  ['narrow full-width inspector', files.styles, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.workspace-inspector\s*\{[^}]*width:\s*100%/],
  ['mobile sidebar scrim', appSource, /className="sidebar-scrim"/],
  ['direct workspace home', homeSource, /className="home-heading"/],
  ['composer profile selector', homeSource, /className="composer-profile-popover"\s+role="menu"/],
  ['responsive Electron Gate B', smokeSource, /projectResponsiveEvidence/],
  ['activity projection Electron Gate B', smokeSource, /projectionActivityEvidence/],
  ['MCP and media detail Electron Gate B', smokeSource, /projectionDetailEvidence/],
  ['boundary and Multi-Agent Electron Gate B', smokeSource, /projectionBoundaryParityEvidence/],
  ['MCP progress Electron Gate B', smokeSource, /progressLastEight/],
  ['dynamic tool failure Electron Gate B', smokeSource, /dynamicFailureVisible/],
  ['MCP secret DOM Gate B', smokeSource, /mcpSecretAbsent/],
];

const violations = [];
for (const [label, pattern] of forbidden) {
  for (const [file, source] of Object.entries(files)) {
    if (pattern.test(source)) violations.push(`${label}: ${file}`);
  }
}
for (const [label, source, pattern] of required) {
  if (!pattern.test(source)) violations.push(`missing ${label}`);
}

const cssClasses = [...new Set([...files.styles.matchAll(/\.([a-z][a-zA-Z0-9_-]*)/g)].map((match) => match[1]))];
for (const className of cssClasses) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`(?:^|[^a-zA-Z0-9_-])${escaped}(?:$|[^a-zA-Z0-9_-])`).test(rendererSource)) {
    violations.push(`orphan CSS selector: .${className}`);
  }
}

if (violations.length > 0) {
  process.stderr.write(`UI parity governance failed:\n${violations.map((violation) => `- ${violation}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('UI parity governance passed\n');
