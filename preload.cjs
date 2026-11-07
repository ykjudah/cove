const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pocketchatDesktop', {
  windows:process.platform==='win32',
  setTray: enabled=>ipcRenderer.invoke('desktop:tray',enabled),
  desktopNotice: notice=>ipcRenderer.invoke('desktop:notice',notice),
  openNotice: callback=>ipcRenderer.on('desktop:open-room',(_event,room)=>callback(room)),
  selectCapture: (id, sourceId) => ipcRenderer.invoke('capture:select',id,sourceId),
  onCapture: callback => {
    const choose=(_event,value)=>callback(value), closed=(_event,id)=>callback({id,closed:true});
    ipcRenderer.on('capture:choose',choose);ipcRenderer.on('capture:closed',closed);
    return ()=>{ipcRenderer.removeListener('capture:choose',choose);ipcRenderer.removeListener('capture:closed',closed);};
  },
  signedIn: () => ipcRenderer.invoke('updates:signed-in'),
  updateState: () => ipcRenderer.invoke('updates:state'),
  setUpdateSource: value => ipcRenderer.invoke('updates:source', value),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('updates:state-changed', listener);
    return () => ipcRenderer.removeListener('updates:state-changed', listener);
  }
});
