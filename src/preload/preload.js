const { contextBridge, ipcRenderer } = require('electron');

// Surface minimale exposée à l'interface : lire l'état, s'abonner aux mises à jour, ouvrir le menu.
contextBridge.exposeInMainWorld('overlay', {
  getView: () => ipcRenderer.invoke('overlay:get-view'),
  onView: (callback) => {
    const listener = (_event, view) => callback(view);
    ipcRenderer.on('overlay:view', listener);
    return () => ipcRenderer.removeListener('overlay:view', listener);
  },
  openMenu: () => ipcRenderer.send('overlay:menu'),
  drag: (phase, dx, dy) => ipcRenderer.send('overlay:drag', phase, dx, dy),
});
