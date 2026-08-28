import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ArrowRight } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { GlassInput } from '@/components/ui/GlassInput';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MindoraLogo } from '@/components/ui/MindoraLogo';
import { TurnstileGate } from '@/components/ui/TurnstileGate';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FadeInView } from '@/components/ui/FadeInView';
import { authService } from '@/services';
import { useAuthContext } from '@/context/AuthContext';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { login } = useAuthContext();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const canSubmit =
    fullName.trim() && username.trim() && email.trim() && password.trim() && confirmPassword.trim() && turnstileToken;

  const handleSubmit = async () => {
    setError('');
    // Checked before the CAPTCHA guard, same as the web form: a mismatch is
    // the user's to fix, and complaining about the CAPTCHA first buries it.
    // Returning here leaves turnstileToken unspent - nothing was sent - so the
    // retry reuses it instead of forcing a fresh challenge.
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!turnstileToken) {
      setError('Please complete the CAPTCHA verification.');
      return;
    }
    setLoading(true);
    try {
      await authService.register(username, email, password, fullName, turnstileToken);
      login();
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try a different username or email.');
    } finally {
      setLoading(false);
      setTurnstileToken('');
      setTurnstileResetKey((k) => k + 1);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg-primary" behavior="padding">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <FadeInView>
          <GlassPanel className="p-8">
            <View className="items-center mb-8">
              <MindoraLogo size={58} />
              <Text className="text-sm font-bold text-accent-indigo tracking-wide mb-1">MINDORA</Text>
              <Text className="text-2xl font-extrabold text-text-primary mb-1">Create your account</Text>
              <Text className="text-text-secondary text-sm text-center">Start journaling with your personal AI companion</Text>
            </View>

            {error ? (
              <View className="mb-5">
                <ErrorBanner message={error} />
              </View>
            ) : null}

            <View className="gap-4">
              <View>
                <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Full Name</Text>
                <GlassInput placeholder="Enter your full name" value={fullName} onChangeText={setFullName} />
              </View>
              <View>
                <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Username</Text>
                <GlassInput autoCapitalize="none" placeholder="Choose a username" value={username} onChangeText={setUsername} />
              </View>
              <View>
                <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Email Address</Text>
                <GlassInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Enter your email"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
              <View>
                <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Password</Text>
                <PasswordInput placeholder="••••••••••••" value={password} onChangeText={setPassword} />
              </View>
              <View>
                <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Confirm Password</Text>
                <PasswordInput
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              <TurnstileGate action="register" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              <View className="mt-2">
                <PrimaryButton
                  title={loading ? 'Creating account...' : 'Create Account'}
                  onPress={handleSubmit}
                  loading={loading}
                  disabled={!canSubmit}
                  icon={<ArrowRight size={18} color="#ffffff" />}
                />
              </View>
            </View>

            <View className="mt-6 pt-5 border-t border-white/[0.08] items-center">
              <Pressable onPress={() => navigation.navigate('Login')}>
                <Text className="text-text-secondary text-sm">
                  Already have an account? <Text className="text-accent-indigo font-bold">Sign In</Text>
                </Text>
              </Pressable>
            </View>
          </GlassPanel>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
