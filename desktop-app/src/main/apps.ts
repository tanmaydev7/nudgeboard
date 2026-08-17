import { execFile, spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { basename, dirname, extname, isAbsolute, join } from 'path';
import { promisify } from 'util';
import { readdir, readFile, unlink } from 'fs/promises';
import { app, nativeImage, shell, type NativeImage } from 'electron';
import type { DesktopApp } from '../shared/ipc-types';

const execFileAsync = promisify(execFile);

export type { DesktopApp };

const windowsRoots = (): string[] => {
  const roots: string[] = [];
  if (process.env.ProgramData) {
    roots.push(
      join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    );
  }
  if (process.env.APPDATA) {
    roots.push(
      join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    );
  }
  return roots;
};

const macRoots = (): string[] => [
  '/Applications',
  join(homedir(), 'Applications'),
];

const linuxRoots = (): string[] => [
  '/usr/share/applications',
  '/usr/local/share/applications',
  join(homedir(), '.local', 'share', 'applications'),
];

const walkFiles = async (
  dir: string,
  match: (name: string, fullPath: string, isDirectory: boolean) => 'take' | 'descend' | 'skip',
): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const isDirectory = entry.isDirectory();
    const decision = match(entry.name, fullPath, isDirectory);
    if (decision === 'take') {
      found.push(fullPath);
      continue;
    }
    if (decision === 'descend' && isDirectory) {
      found.push(...(await walkFiles(fullPath, match)));
    }
  }
  return found;
};

const parseDesktopEntry = async (
  filePath: string,
): Promise<{ name: string; iconPath?: string } | null> => {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let name: string | null = null;
  let icon = '';
  let type = '';
  let hidden = false;
  let noDisplay = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('Name=') && !name) {
      name = line.slice(5).trim();
    } else if (line.startsWith('Icon=')) {
      icon = line.slice(5).trim();
    } else if (line.startsWith('Type=')) {
      type = line.slice(5).trim();
    } else if (line === 'Hidden=true') {
      hidden = true;
    } else if (line === 'NoDisplay=true') {
      noDisplay = true;
    }
  }
  if (!name || hidden || noDisplay || (type && type !== 'Application')) {
    return null;
  }
  return {
    name,
    iconPath: icon.includes('/') || icon.includes('\\') ? icon : undefined,
  };
};

const nameFromFile = (filePath: string): string =>
  basename(filePath, extname(filePath));

const isLnk = (filePath: string): boolean =>
  extname(filePath).toLowerCase() === '.lnk';

const expandEnv = (value: string): string =>
  value
    .replace(/^"(.*)"$/, '$1')
    .replace(/%([^%]+)%/g, (match, name: string) => {
      const env = process.env[name] ?? process.env[name.toUpperCase()];
      return env ?? match;
    })
    .replace(/,-?\d+$/, '');

const isLibraryIcon = (filePath: string): boolean => {
  const ext = extname(filePath).toLowerCase();
  return ext === '.dll' || ext === '.icl';
};

const resolveShortcutSource = (filePath: string): string | undefined => {
  try {
    const details = shell.readShortcutLink(filePath);
    const icon = details.icon ? expandEnv(details.icon.trim()) : '';
    const target = details.target ? expandEnv(details.target.trim()) : '';
    if (icon && !isLibraryIcon(icon) && existsSync(icon)) {
      return icon;
    }
    if (target && existsSync(target)) {
      return target;
    }
    if (icon && existsSync(icon)) {
      return icon;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const isShellAppPath = (filePath: string): boolean =>
  filePath.toLowerCase().startsWith('shell:');

const isProtocolLaunch = (filePath: string): boolean =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(filePath);

const isNonFileLaunchPath = (filePath: string): boolean =>
  isShellAppPath(filePath) || isProtocolLaunch(filePath);

const resolveIconSource = (filePath: string): string => {
  if (isShellAppPath(filePath)) {
    return filePath;
  }
  if (process.platform !== 'win32' || !isLnk(filePath)) {
    return filePath;
  }
  return resolveShortcutSource(filePath) ?? filePath;
};

const normalizeAppName = (name: string): string =>
  name
    .toLocaleLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueByName = (apps: DesktopApp[]): DesktopApp[] => {
  const seen = new Map<string, DesktopApp>();
  const byPath = new Map<string, DesktopApp>();
  for (const item of apps) {
    const nameKey = normalizeAppName(item.name);
    const pathKey = item.path.toLocaleLowerCase();
    const existing = seen.get(nameKey) ?? byPath.get(pathKey);
    if (existing) {
      if (!existing.iconPath && item.iconPath) {
        existing.iconPath = item.iconPath;
      }
      if (isNonFileLaunchPath(existing.path) && !isNonFileLaunchPath(item.path)) {
        existing.path = item.path;
        existing.id = item.id;
      }
      continue;
    }
    seen.set(nameKey, item);
    byPath.set(pathKey, item);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
};

// FOLDERID_* values from Microsoft. They identify a *kind* of folder
// (Program Files, System32, …), not a specific PC. Windows uses the same
// GUIDs worldwide; the mapped path still comes from this machine's env.
const WINDOWS_KNOWN_FOLDERS: Record<string, () => string> = {
  '6D809377-6AF0-444B-8957-A3773F02200E': () =>
    process.env.ProgramFiles ?? 'C:\\Program Files',
  '7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E': () =>
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  '1AC14E77-02E7-4E5D-B744-2EB1AE5198B7': () =>
    join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
  'D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27': () =>
    join(process.env.SystemRoot ?? 'C:\\Windows', 'SysWOW64'),
  'F38BF404-1D43-42F2-9305-67DE0B28FC23': () =>
    process.env.SystemRoot ?? 'C:\\Windows',
};

const expandStartAppId = (appId: string): string => {
  const match = /^\{([0-9A-Fa-f-]+)\}\\(.+)$/.exec(appId);
  if (!match) {
    return appId;
  }
  const root = WINDOWS_KNOWN_FOLDERS[match[1].toUpperCase()]?.();
  return root ? join(root, match[2]) : appId;
};

const startAppLaunchPath = (appId: string): string => {
  if (isProtocolLaunch(appId)) {
    return appId;
  }
  const expanded = expandStartAppId(appId);
  if (existsSync(expanded)) {
    return expanded;
  }
  return `shell:AppsFolder\\${appId}`;
};

const packageFamilyFromFullName = (fullName: string): string | null => {
  const parts = fullName.split('_');
  if (parts.length < 5) {
    return null;
  }
  return `${parts.slice(0, -4).join('_')}_${parts[parts.length - 1]}`;
};

const logoFileCandidates = (relative: string): string[] => {
  const normalized = relative.replace(/[/\\]+/g, '/');
  const dir = dirname(normalized);
  const stem = basename(normalized, extname(normalized));
  return [
    `${stem}.targetsize-256_altform-unplated.png`,
    `${stem}.targetsize-256.png`,
    `${stem}.scale-400.png`,
    `${stem}.scale-200.png`,
    `${stem}.scale-100.png`,
    `${stem}.png`,
    basename(normalized),
  ].map((name) => (dir === '.' ? name : join(dir, name)));
};

const firstExisting = (root: string, relatives: string[]): string | undefined => {
  for (const relative of relatives) {
    const fullPath = join(root, relative);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
};

const resolveAppxLogo = async (packageRoot: string): Promise<string | undefined> => {
  const fromAssets = firstExisting(packageRoot, [
    ...logoFileCandidates('Assets/Square44x44Logo.png'),
    ...logoFileCandidates('Assets/StoreLogo.png'),
  ]);
  if (fromAssets) {
    return fromAssets;
  }

  let manifest: string;
  try {
    manifest = await readFile(join(packageRoot, 'AppxManifest.xml'), 'utf8');
  } catch {
    return undefined;
  }
  const listed =
    manifest.match(/Square44x44Logo="([^"]+)"/)?.[1] ??
    manifest.match(/<Logo>([^<]+)<\/Logo>/)?.[1];
  if (!listed) {
    return undefined;
  }
  return firstExisting(packageRoot, logoFileCandidates(listed.trim()));
};

type StartApp = { Name?: string; AppID?: string };
type PackageRow = { Id?: string; PSChildName?: string; PackageRootFolder?: string };
type StartAppsPayload = {
  apps?: StartApp | StartApp[];
  packages?: PackageRow | PackageRow[];
};

const asArray = <T,>(value: T | T[] | undefined): T[] => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const listWindowsStartApps = async (): Promise<DesktopApp[]> => {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); [pscustomobject]@{ apps = @(Get-StartApps | Select-Object Name, AppID); packages = @(Get-ItemProperty 'HKCU:\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages\\*' -ErrorAction SilentlyContinue | Select-Object @{n='Id';e={$_.PSChildName}}, PackageRootFolder) } | ConvertTo-Json -Compress -Depth 4",
      ],
      {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 20 * 1024 * 1024,
        encoding: 'utf8',
      },
    );
    const parsed = JSON.parse(stdout.trim()) as StartAppsPayload;
    const familyRoot = new Map<string, string>();
    for (const row of asArray(parsed.packages)) {
      const id = row.Id?.trim() || row.PSChildName?.trim() || '';
      const root = row.PackageRootFolder?.trim() || '';
      const family = packageFamilyFromFullName(id);
      if (family && root) {
        familyRoot.set(family, root);
      }
    }

    const logoByRoot = new Map<string, string | undefined>();
    const apps: DesktopApp[] = [];
    for (const row of asArray(parsed.apps)) {
      const name = row.Name?.trim() ?? '';
      const appId = row.AppID?.trim() ?? '';
      if (!name || !appId) {
        continue;
      }
      const path = startAppLaunchPath(appId);
      const bang = appId.indexOf('!');
      const family = bang > 0 ? appId.slice(0, bang) : null;
      const packageRoot = family ? familyRoot.get(family) : undefined;
      let iconPath: string | undefined;
      if (packageRoot) {
        if (!logoByRoot.has(packageRoot)) {
          logoByRoot.set(packageRoot, await resolveAppxLogo(packageRoot));
        }
        iconPath = logoByRoot.get(packageRoot);
      }
      apps.push({ id: path, name, path, iconPath });
    }
    return apps;
  } catch {
    return [];
  }
};

const parseUrlShortcut = async (
  filePath: string,
): Promise<DesktopApp | null> => {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let url = '';
  let iconFile = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('URL=')) {
      url = line.slice(4).trim();
    } else if (line.startsWith('IconFile=')) {
      iconFile = line.slice(9).trim().replace(/^"(.*)"$/, '$1');
    }
  }
  if (!url || /^https?:/i.test(url)) {
    return null;
  }
  return {
    id: filePath,
    name: nameFromFile(filePath),
    path: url,
    iconPath: iconFile && existsSync(iconFile) ? iconFile : undefined,
  };
};

const listWindowsShortcuts = async (): Promise<DesktopApp[]> => {
  const paths: string[] = [];
  for (const root of windowsRoots()) {
    paths.push(
      ...(await walkFiles(root, (name, _full, isDirectory) => {
        if (isDirectory) {
          return 'descend';
        }
        const ext = extname(name).toLowerCase();
        return ext === '.lnk' || ext === '.url' ? 'take' : 'skip';
      })),
    );
  }
  const apps: DesktopApp[] = [];
  for (const filePath of paths) {
    if (extname(filePath).toLowerCase() === '.url') {
      const parsed = await parseUrlShortcut(filePath);
      if (parsed) {
        apps.push(parsed);
      }
      continue;
    }
    apps.push({
      id: filePath,
      name: nameFromFile(filePath),
      path: filePath,
    });
  }
  return apps;
};

const listWindows = async (): Promise<DesktopApp[]> => {
  const [shortcuts, startApps] = await Promise.all([
    listWindowsShortcuts(),
    listWindowsStartApps(),
  ]);
  return [...startApps, ...shortcuts];
};

const listMac = async (): Promise<DesktopApp[]> => {
  const paths: string[] = [];
  for (const root of macRoots()) {
    paths.push(
      ...(await walkFiles(root, (name, _full, isDirectory) => {
        if (name.endsWith('.app')) {
          return 'take';
        }
        return isDirectory ? 'descend' : 'skip';
      })),
    );
  }
  return paths.map((filePath) => ({
    id: filePath,
    name: nameFromFile(filePath),
    path: filePath,
  }));
};

const listLinux = async (): Promise<DesktopApp[]> => {
  const paths: string[] = [];
  for (const root of linuxRoots()) {
    paths.push(
      ...(await walkFiles(root, (name, _full, isDirectory) => {
        if (isDirectory) {
          return 'descend';
        }
        return extname(name).toLowerCase() === '.desktop' ? 'take' : 'skip';
      })),
    );
  }
  const apps: DesktopApp[] = [];
  for (const filePath of paths) {
    const entry = await parseDesktopEntry(filePath);
    if (entry) {
      apps.push({
        id: filePath,
        name: entry.name,
        path: filePath,
        iconPath: entry.iconPath,
      });
    }
  }
  return apps;
};

const IMAGE_EXTS = new Set([
  '.bmp',
  '.gif',
  '.ico',
  '.icns',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);

const iconCache = new Map<string, string | null>();

const toDataUrl = (image: NativeImage, size: number): string | null => {
  if (image.isEmpty()) {
    return null;
  }
  const { width, height } = image.getSize();
  const maxEdge = Math.max(width, height, 1);
  const target = Math.min(size, maxEdge);
  const ready =
    width === target && height === target
      ? image
      : image.resize({ width: target, height: target, quality: 'best' });
  const png = ready.toPNG();
  if (png.length === 0) {
    return null;
  }
  return `data:image/png;base64,${png.toString('base64')}`;
};

const yieldMain = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const cacheKey = (filePath: string, size: number): string =>
  `${size}:${filePath}`;

const sipsPngDataUrl = async (
  inputPath: string,
  size: number,
): Promise<string | null> => {
  const out = join(
    tmpdir(),
    `nudgeboard-icon-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
  );
  try {
    await execFileAsync(
      'sips',
      ['-z', String(size), String(size), '-s', 'format', 'png', inputPath, '--out', out],
      { timeout: 8000, maxBuffer: 1024 * 1024 },
    );
    const buf = await readFile(out);
    if (buf.length === 0) {
      return null;
    }
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    try {
      await unlink(out);
    } catch {
      // ignore
    }
  }
};

const resolveMacIconFile = async (source: string): Promise<string | null> => {
  const ext = extname(source).toLowerCase();
  if (IMAGE_EXTS.has(ext)) {
    return source;
  }
  if (ext !== '.app') {
    return null;
  }

  const resources = join(source, 'Contents', 'Resources');
  const infoPlist = join(source, 'Contents', 'Info.plist');
  let iconName = '';
  try {
    const { stdout } = await execFileAsync(
      'plutil',
      ['-convert', 'json', '-o', '-', infoPlist],
      { timeout: 4000, maxBuffer: 4 * 1024 * 1024 },
    );
    const info = JSON.parse(stdout) as {
      CFBundleIconFile?: string;
      CFBundleIconName?: string;
    };
    iconName = (info.CFBundleIconFile || info.CFBundleIconName || '').trim();
  } catch {
    iconName = '';
  }

  const candidates: string[] = [];
  if (iconName) {
    candidates.push(join(resources, iconName));
    if (!iconName.toLowerCase().endsWith('.icns')) {
      candidates.push(join(resources, `${iconName}.icns`));
    }
  }
  candidates.push(
    join(resources, 'AppIcon.icns'),
    join(resources, 'icon.icns'),
    join(resources, 'app.icns'),
  );
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  try {
    const names = await readdir(resources);
    const icns = names.find((name) => name.toLowerCase().endsWith('.icns'));
    return icns ? join(resources, icns) : null;
  } catch {
    return null;
  }
};

const macIconDataUrl = async (
  source: string,
  size: number,
): Promise<string | null> => {
  const iconFile = await resolveMacIconFile(source);
  if (!iconFile) {
    return null;
  }
  return sipsPngDataUrl(iconFile, size);
};

export const iconDataUrl = async (
  filePath: string,
  size = 32,
): Promise<string | null> => {
  const key = cacheKey(filePath, size);
  if (iconCache.has(key)) {
    return iconCache.get(key) ?? null;
  }

  const source = resolveIconSource(filePath);
  if (isNonFileLaunchPath(source) || !existsSync(source)) {
    iconCache.set(key, null);
    return null;
  }
  let url: string | null = null;

  // Electron nativeImage / getFileIcon / createThumbnailFromPath all go through
  // NSImage on macOS and have aborted Chromium (EXC_BREAKPOINT) on macOS 26.
  // Convert icons in a child process (sips) and only read PNG bytes.
  if (process.platform === 'darwin') {
    url = await macIconDataUrl(source, size);
  } else {
    if (IMAGE_EXTS.has(extname(source).toLowerCase())) {
      try {
        url = toDataUrl(nativeImage.createFromPath(source), size);
      } catch {
        url = null;
      }
    }

    if (!url && size > 32 && process.platform === 'win32') {
      try {
        const thumb = await nativeImage.createThumbnailFromPath(source, {
          width: size,
          height: size,
        });
        url = toDataUrl(thumb, size);
      } catch {
        url = null;
      }
    }

    if (!url) {
      try {
        url = toDataUrl(
          await app.getFileIcon(source, { size: size > 32 ? 'large' : 'normal' }),
          size,
        );
      } catch {
        url = null;
      }
    }
  }
  iconCache.set(key, url);
  if (source !== filePath) {
    iconCache.set(cacheKey(source, size), url);
  }
  return url;
};

export const iconsForPaths = async (
  paths: string[],
  size = 32,
): Promise<Record<string, string>> => {
  const unique = [...new Set(paths.filter((item) => item.length > 0))];
  const result: Record<string, string> = {};
  const concurrency = 2;
  let cursor = 0;

  const worker = async () => {
    while (cursor < unique.length) {
      const current = unique[cursor];
      cursor += 1;
      const icon = await iconDataUrl(current, size);
      if (icon) {
        result[current] = icon;
      }
      await yieldMain();
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
};

export const listDesktopApps = async (): Promise<DesktopApp[]> => {
  let apps: DesktopApp[] = [];
  if (process.platform === 'win32') {
    apps = await listWindows();
  } else if (process.platform === 'darwin') {
    apps = await listMac();
  } else {
    apps = await listLinux();
  }
  return uniqueByName(apps.filter((app) => app.name.length > 0));
};

const BLOCKED_PROTOCOL = /^(file|javascript|data|vbscript|about|blob):/i;

export const launchDesktopApp = async (target: string): Promise<void> => {
  if (!target) {
    return;
  }
  if (BLOCKED_PROTOCOL.test(target)) {
    return;
  }
  if (process.platform === 'win32' && isShellAppPath(target)) {
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (isProtocolLaunch(target)) {
    const scheme = target.slice(0, target.indexOf(':')).toLowerCase();
    if (scheme === 'https' || scheme === 'mailto') {
      await shell.openExternal(target);
      return;
    }
    if (
      scheme !== 'http' &&
      !scheme.startsWith('ms-') &&
      /^[a-z][a-z0-9+.-]{1,31}$/.test(scheme)
    ) {
      await shell.openExternal(target);
    }
    return;
  }
  if (!isAbsolute(target) || !existsSync(target)) {
    return;
  }
  const error = await shell.openPath(target);
  if (error) {
    throw new Error(error);
  }
};
