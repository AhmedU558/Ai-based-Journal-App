import { useState, type InputHTMLAttributes } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

// Every password field in this app was a bare type="password" with no way to
// see what you typed - which is exactly where a mistyped password on a form
// that also has a confirm field turns into a silent, repeated failure. This
// wraps the existing .glass-input markup (leading lock icon, same spacing) and
// adds the reveal toggle, so the four AuthView fields and the three in
// SettingsModal all behave identically instead of each growing their own copy.
//
// Deliberately not lifted into a `visible` prop the parent controls: visibility
// is per-field, always starts hidden, and resets when the field unmounts. A
// parent holding that state would make "reveal one field" leak into the others.
// `withLockIcon` is opt-out rather than opt-in because AuthView - four of the
// seven call sites - wants the icon. SettingsModal's change-password form is a
// compact stack of placeholder-only inputs sitting beside other plain
// .glass-input fields, so a lock on those three would look bolted on.
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  withLockIcon?: boolean;
};

export default function PasswordInput({ className = '', withLockIcon = true, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Hide password' : 'Show password';

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`glass-input ${withLockIcon ? 'pl-[2.6rem]' : ''} pr-[2.8rem] ${className}`}
      />
      {withLockIcon && (
        <Lock size={18} color="#64748b" className="absolute left-[0.85rem] top-1/2 -translate-y-1/2 pointer-events-none" />
      )}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        // tabIndex={-1} so tabbing through the form goes field -> field and
        // never detours into the toggle; it stays reachable by click, and by
        // keyboard via shift-tab from the next field.
        tabIndex={-1}
        className="absolute right-[0.85rem] top-1/2 -translate-y-1/2 flex items-center bg-transparent border-0 p-0 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
