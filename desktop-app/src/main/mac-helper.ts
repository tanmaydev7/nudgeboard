import { existsSync } from 'fs';
import path from 'path';

const HELPER_NAME = 'nudgeboard-mac';

const resourcesPath = (): string => {
  if ('resourcesPath' in process && typeof process.resourcesPath === 'string') {
    return process.resourcesPath;
  }
  return '';
};

export const macHelperPath = (): string => {
  const candidates = [
    resourcesPath() ? path.join(resourcesPath(), HELPER_NAME) : '',
    path.join(process.cwd(), 'native/mac', HELPER_NAME),
    path.join(__dirname, '../../native/mac', HELPER_NAME),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
};
