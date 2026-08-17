import {
  app,
  BrowserWindow,
  Menu,
  session,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';
import { currentAppearance, startBridge, stopBridge, WINDOW_CHROME } from './bridge';
import { createAppNativeImage, createTrayNativeImage } from './icons';
import {
  startMacKeyTargetTracking,
  stopMacKeyTargetTracking,
} from './keys-mac';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

const isMac = process.platform === 'darwin';
const isDev = process.env.NODE_ENV === 'development';
const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const applyContentSecurityPolicy = (): void => {
  if (isDev) {
    return;
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PRODUCTION_CSP],
      },
    });
  });
};

const TITLE_BAR_HEIGHT = 36;

const showMainWindow = (): void => {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
};

const createAppMenu = (): void => {
  if (!isMac) {
    if (!isDev) {
      Menu.setApplicationMenu(null);
      return;
    }
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'viewMenu' }]),
    );
    return;
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit NudgeBoard',
          accelerator: 'Cmd+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Close Window',
          accelerator: 'Cmd+W',
          click: () => {
            if (mainWindow) {
              mainWindow.hide();
            }
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createTray = (): void => {
  if (tray) {
    return;
  }

  const trayIcon = createTrayNativeImage();
  tray = new Tray(trayIcon);
  tray.setToolTip('NudgeBoard — Phone Deck Companion');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NudgeBoard',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit NudgeBoard',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) {
      showMainWindow();
      return;
    }
    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.focus();
      }
    } else {
      showMainWindow();
    }
  });

  tray.on('double-click', () => {
    showMainWindow();
  });
};

const createWindow = (): void => {
  const appIcon = createAppNativeImage();
  const chrome = WINDOW_CHROME[currentAppearance()];
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    icon: appIcon,
    backgroundColor: chrome.backgroundColor,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: chrome.backgroundColor,
            symbolColor: chrome.symbolColor,
            height: TITLE_BAR_HEIGHT,
          },
          autoHideMenuBar: true,
        }),
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;

  if (!isMac) {
    win.setMenuBarVisibility(false);
  }

  // Intercept close button: minimize/hide to tray instead of quitting
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  void win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== MAIN_WINDOW_WEBPACK_ENTRY) {
      event.preventDefault();
    }
  });
};

// Ensure single instance lock so duplicate processes aren't spawned
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    applyContentSecurityPolicy();
    createAppMenu();
    createTray();
    await startBridge();
    createWindow();
    if (isMac) {
      startMacKeyTargetTracking();
    }

    app.on('activate', () => {
      showMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit();
  }
  // Keep app running in tray when all windows are closed/hidden
});

app.on('before-quit', () => {
  isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
  void stopBridge();
  stopMacKeyTargetTracking();
});
