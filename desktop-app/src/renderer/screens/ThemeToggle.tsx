import { LuMoon, LuSun } from 'react-icons/lu';
import { useAppStore } from '../store';

export function ThemeToggle() {
  const appearance = useAppStore((s) => s.snapshot?.appearance) ?? 'dark';
  const setSnapshot = useAppStore((s) => s.setSnapshot);
  const light = appearance === 'light';

  const toggle = () => {
    void window.api
      .setAppearance(light ? 'dark' : 'light')
      .then(setSnapshot);
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
