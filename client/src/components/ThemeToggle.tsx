import { useId } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useSession } from '../session';

/** Light/dark switch. A per-person preference on this device; it overrides the organization's default mode. */
export default function ThemeToggle({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useSession();
  const id = useId();
  const dark = theme === 'dark';
  return (
    <div className="switch-row">
      <span>
        <b id={id} className="small">Dark mode</b>
        {!compact && <small>Applies to the whole dashboard on this device. Both modes meet WCAG 2.2 AA contrast.</small>}
      </span>
      <button
        type="button" role="switch" aria-checked={dark} aria-labelledby={id} className="switch"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
      >
        <span className="knob" aria-hidden>{dark ? <Moon className="i" /> : <Sun className="i" />}</span>
      </button>
    </div>
  );
}
