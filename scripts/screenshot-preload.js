const { contextBridge, ipcRenderer } = require('electron');

// Même surface que src/preload/preload.js, mais figée : l'état est fourni une fois par le script.
contextBridge.exposeInMainWorld('overlay', {
  getView: () => ipcRenderer.invoke('shot:view'),
  onView: () => () => {},
  openMenu: () => {},
  drag: () => {},
});
