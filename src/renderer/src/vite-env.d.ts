/// <reference types="vite/client" />

import type { DesktopApi } from '../../shared/desktop';

declare global {
  interface Window {
    limeShot: DesktopApi;
  }
}

export {};
