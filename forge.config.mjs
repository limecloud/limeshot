import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { currentPlatformKey } from './scripts/desktop/codex-resource.mjs';

const target = process.platform === 'win32' ? 'business-server.exe' : 'business-server';
const codexTarget = process.platform === 'win32' ? 'codex.exe' : 'codex';
const packageBin = resolve('rust', 'target', 'package-resources', currentPlatformKey(), 'bin');
const companion = resolve(packageBin, target);
const codexSource = resolve(packageBin, codexTarget);
const signingIdentity = process.env.LIMESHOT_CODESIGN_IDENTITY ?? '-';
const adHocSigning = signingIdentity === '-';

if (!existsSync(companion)) {
  throw new Error(`缺少已准备的 Rust companion，请先运行 npm run package:stage: ${companion}`);
}
if (!existsSync(codexSource)) {
  throw new Error(`缺少已准备的固定 Codex，请先运行 npm run package:stage: ${codexSource}`);
}

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  outDir: 'forge-out',
  packagerConfig: {
    name: 'LimeShot',
    executableName: 'LimeShot',
    appBundleId: 'ai.limecloud.limeshot',
    appCategoryType: 'public.app-category.video',
    asar: true,
    osxSign: process.platform === 'darwin' ? {
      identity: signingIdentity,
      identityValidation: !adHocSigning,
      ...(adHocSigning ? { timestamp: 'none' } : {}),
      continueOnError: false,
    } : undefined,
    extraResource: [
      packageBin,
      resolve('resources'),
    ],
    ignore: [
      /^\/.git(?:$|\/)/,
      /^\/internal(?:$|\/)/,
      /^\/rust(?:$|\/)/,
      /^\/scripts(?:$|\/)/,
      /^\/src(?:$|\/)/,
      /^\/schemas(?:$|\/)/,
      /^\/test-results(?:$|\/)/,
      /^\/forge-out(?:$|\/)/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'limeshot',
        authors: 'Lime Cloud',
        exe: 'LimeShot.exe',
        setupExe: 'LimeShot-Setup.exe',
      },
    },
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32'] },
    { name: '@electron-forge/maker-dmg', platforms: ['darwin'] },
  ],
};

export default config;
