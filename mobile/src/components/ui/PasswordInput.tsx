import { useState } from 'react';
import { Pressable, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { GlassInput } from './GlassInput';

// RN counterpart of the web PasswordInput. Same reasoning: every password field
// in the app was a bare secureTextEntry with no way to check what you typed,
// which matters most on a phone keyboard where typos are cheap and invisible.
//
// Visibility is per-field state, never a prop the parent owns - it always
// starts hidden, resets when the field unmounts, and revealing one field cannot
// leak into a sibling. Nothing here accepts `secureTextEntry`; this component
// is the one that decides it.
type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'> & { className?: string };

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Hide password' : 'Show password';

  return (
    <View className="relative justify-center">
      <GlassInput
        {...props}
        secureTextEntry={!visible}
        // Android re-enables its own suggestion strip when secureTextEntry
        // flips off, which would offer to "remember" the revealed password.
        autoComplete="off"
        autoCorrect={false}
        className={`pr-12 ${className ?? ''}`}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: visible }}
        // Generous hit slop: the icon itself is well under the 44px target that
        // a bare 18px glyph would otherwise give you.
        hitSlop={12}
        className="absolute right-4"
      >
        {visible ? <EyeOff size={18} color="#64748b" /> : <Eye size={18} color="#64748b" />}
      </Pressable>
    </View>
  );
}
