import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';

import { App } from './App';
import './styles.css';
import './conversationReview.css';
import './conversationModelMenu.css';
import './composerAddMenu.css';
import './workspaceChrome.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
