import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type {
  AppUpdateSnapshot,
  AttachmentKind,
  ChatEvent,
  ChatMessageInput,
  ChatResumeInput,
  CoaseApi,
  RunInsightsPersisted,
  TranscriptEntryPersisted,
} from '../../shared/ipc';
import type { ProviderRecord } from '../../shared/providers';

const api: CoaseApi = {
  ping: () => ipcRenderer.invoke('app:ping'),

  updates: {
    getState: () => ipcRenderer.invoke('updates:getState'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onEvent: (handler) => {
      const channel = 'app-update:event';
      const listener = (_event: IpcRendererEvent, payload: AppUpdateSnapshot): void =>
        handler(payload);
      ipcRenderer.on(channel, listener);
      void ipcRenderer
        .invoke('updates:getState')
        .then((snapshot: AppUpdateSnapshot) => {
          handler(snapshot);
        })
        .catch((error) => {
          console.warn('failed to read update state', error);
        });
      return () => {
        ipcRenderer.off(channel, listener);
      };
    },
  },

  chat: {
    start: (payload: ChatMessageInput) => ipcRenderer.invoke('chat:start', payload),
    resume: (payload: ChatResumeInput) => ipcRenderer.invoke('chat:resume', payload),
    send: (sessionId: string, payload: ChatMessageInput) =>
      ipcRenderer.invoke('chat:send', sessionId, payload),
    cancel: (sessionId: string) => ipcRenderer.invoke('chat:cancel', sessionId),
    interrupt: (sessionId: string) => ipcRenderer.invoke('chat:interrupt', sessionId),
    onEvent: (sessionId, handler) => {
      const channel = `chat:event:${sessionId}`;
      const listener = (_event: IpcRendererEvent, payload: ChatEvent): void => handler(payload);
      ipcRenderer.on(channel, listener);
      void ipcRenderer
        .invoke('chat:attach', sessionId)
        .then((backlog: ChatEvent[]) => {
          for (const payload of backlog) {
            handler(payload);
          }
        })
        .catch((error) => {
          console.warn('failed to attach chat event stream', error);
        });
      return () => {
        ipcRenderer.off(channel, listener);
        void ipcRenderer.invoke('chat:detach', sessionId).catch(() => {});
      };
    },
  },

  files: {
    pick: (kind: AttachmentKind) => ipcRenderer.invoke('files:pick', kind),
  },

  workspaces: {
    pickDirectory: () => ipcRenderer.invoke('workspaces:pickDirectory'),
    getRoot: (sessionId: string) => ipcRenderer.invoke('workspaces:getRoot', sessionId),
    listTree: (sessionId: string) => ipcRenderer.invoke('workspaces:listTree', sessionId),
    previewFile: (filePath: string) => ipcRenderer.invoke('workspaces:previewFile', filePath),
  },

  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    upsert: (record: ProviderRecord) => ipcRenderer.invoke('providers:upsert', record),
    delete: (id: string) => ipcRenderer.invoke('providers:delete', id),
    setActive: (id: string | null) => ipcRenderer.invoke('providers:setActive', id),
    presets: () => ipcRenderer.invoke('providers:presets'),
    testConnection: (record: ProviderRecord) => ipcRenderer.invoke('providers:test', record),
    getCriticPanel: () => ipcRenderer.invoke('providers:getCriticPanel'),
    setCriticPanel: (ids: string[] | null) =>
      ipcRenderer.invoke('providers:setCriticPanel', ids),
    invokeCriticPanel: (payload) => ipcRenderer.invoke('providers:invokeCriticPanel', payload),
  },

  sessions: {
    recent: (limit?: number) => ipcRenderer.invoke('sessions:recent', limit),
    delete: (sessionId: string) => ipcRenderer.invoke('sessions:delete', sessionId),
    transcript: (sessionId: string) => ipcRenderer.invoke('sessions:transcript', sessionId),
    persistTranscript: (sessionId: string, entries: TranscriptEntryPersisted[]) =>
      ipcRenderer.invoke('sessions:persistTranscript', { sessionId, entries }),
    insights: (sessionId: string) => ipcRenderer.invoke('sessions:insights', sessionId),
    persistInsights: (sessionId: string, insights: RunInsightsPersisted) =>
      ipcRenderer.invoke('sessions:persistInsights', { sessionId, insights }),
  },

  artifacts: {
    openPath: (filePath: string) => ipcRenderer.invoke('artifacts:openPath', filePath),
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    toggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    import: () => ipcRenderer.invoke('skills:import'),
    delete: (name: string) => ipcRenderer.invoke('skills:delete', name),
    openUserDir: () => ipcRenderer.invoke('skills:openUserDir'),
  },

  rEnv: {
    check: () => ipcRenderer.invoke('rEnv:check'),
  },
};

contextBridge.exposeInMainWorld('coase', api);
