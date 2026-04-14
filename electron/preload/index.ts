import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { ChatEvent, CoaseApi } from '../../shared/ipc';
import type { ProviderRecord } from '../../shared/providers';

// 只暴露白名单里的有限 API 给 renderer。
// 原则：renderer 永远拿不到 ipcRenderer / Node API 本体，
//       所有能力必须是声明式的、可审计的函数。
const api: CoaseApi = {
  ping: () => ipcRenderer.invoke('app:ping'),

  chat: {
    start: (firstMessage: string) => ipcRenderer.invoke('chat:start', firstMessage),
    send: (sessionId: string, text: string) =>
      ipcRenderer.invoke('chat:send', sessionId, text),
    cancel: (sessionId: string) => ipcRenderer.invoke('chat:cancel', sessionId),
    onEvent: (sessionId, handler) => {
      const channel = `chat:event:${sessionId}`;
      const listener = (_event: IpcRendererEvent, payload: ChatEvent): void =>
        handler(payload);
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.off(channel, listener);
      };
    },
  },

  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    upsert: (record: ProviderRecord) => ipcRenderer.invoke('providers:upsert', record),
    delete: (id: string) => ipcRenderer.invoke('providers:delete', id),
    setActive: (id: string | null) => ipcRenderer.invoke('providers:setActive', id),
    presets: () => ipcRenderer.invoke('providers:presets'),
    testConnection: (record: ProviderRecord) => ipcRenderer.invoke('providers:test', record),
  },

  sessions: {
    recent: (limit?: number) => ipcRenderer.invoke('sessions:recent', limit),
  },

  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
  },
};

contextBridge.exposeInMainWorld('coase', api);
