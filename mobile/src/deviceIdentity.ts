export type DeviceNameHints = {
  names?: string[];
  userName?: string;
  marketName?: string;
  manufacturer?: string;
  model?: string;
};

const clean = (value?: string): string => value?.trim() ?? '';

const sameName = (left: string, right: string): boolean =>
  left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;

const titleCase = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const uniqueNames = (...values: Array<string | string[] | undefined>): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const name = clean(item);
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) {
        continue;
      }
      seen.add(key);
      names.push(name);
    }
  }
  return names;
};

const longest = (names: string[]): string =>
  names.reduce((best, name) => (name.length >= best.length ? name : best));

export function resolveDeviceIdentity(
  platform: 'ios' | 'android',
  hints: DeviceNameHints,
): { name: string; model: string } {
  const model = clean(hints.model) || (platform === 'ios' ? 'iPhone' : 'Android');
  const marketName = clean(hints.marketName);
  const manufacturer = titleCase(clean(hints.manufacturer));
  const names = uniqueNames(hints.names, hints.userName);

  if (platform === 'ios') {
    return { name: names[0] || 'iPhone', model };
  }

  const customized = names.filter(
    (name) => !sameName(name, model) && !(marketName && sameName(name, marketName)),
  );
  if (customized.length > 0) {
    return { name: longest(customized), model };
  }
  const labeled = names.find((name) => !sameName(name, model));
  if (labeled) {
    return { name: labeled, model };
  }
  if (marketName && !sameName(marketName, model)) {
    return { name: marketName, model };
  }
  if (manufacturer && !sameName(manufacturer, model)) {
    return { name: `${manufacturer} ${model}`, model };
  }
  return { name: model, model };
}
