import { LuMoon, LuSun } from 'react-icons/lu';
import { useAppStore } from '../store';

export function ThemeToggle() {
  const appearance = useAppStore((s) => s.snapshot?.appearance) ?? 'dark';
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const light = appearance === 'light';

  const toggle = () => {
    const next = light ? 'dark' : 'light';
    const current = useAppStore.getState().snapshot;
    if (current) {
      setSnapshot({ ...current, appearance: next });
    }
    void window.api.setAppearance(next).then((snap) => {
      if (useAppStore.getState().snapshot?.appearance !== next) {
        return;
      }
      setSnapshot(snap);
    });
  };

  return (
    <button
      type="button"
      className={`theme-dock${light ? ' light' : ' dark'}`}
      aria-label={light ? 'Switch to dark appearance' : 'Switch to light appearance'}
      aria-pressed={!light}
      onClick={toggle}
    >
      <span className="theme-dock-thumb">
        {light ? <LuSun size={14} aria-hidden /> : <LuMoon size={14} aria-hidden />}
      </span>
    </button>
  );
}
