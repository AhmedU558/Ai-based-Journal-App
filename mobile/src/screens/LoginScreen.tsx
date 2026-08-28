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

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuthContext();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const handleSubmit = async () => {
    setError('');
    if (!turnstileToken) {
      setError('Please complete the CAPTCHA verification.');
      return;
    }
    setLoading(true);
    try {
      const data = await authService.login(usernameOrEmail, password, turnstileToken);
      if (data.mfaRequired && data.challengeToken) {
        navigation.navigate('MfaChallenge', { challengeToken: data.challengeToken });
        return;
      }
      login();
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please check your credentials.');
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
              <Text className="text-2xl font-extrabold text-text-primary mb-1">Mindora</Text>
              <Text className="text-text-secondary text-sm text-center">
                Your thoughts. Your story. Your AI companion.
              </Text>
            </View>

            {error ? (
              <View className="mb-5">
                <ErrorBanner message={error} />
              </View>
            ) : null}

            <View className="gap-4">
              <View>
                <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Username or Email</Text>
                <GlassInput
                  autoCapitalize="none"
                  placeholder="Username or email"
                  value={usernameOrEmail}
                  onChangeText={setUsernameOrEmail}
                />
              </View>
              <View>
                <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Password</Text>
                <PasswordInput placeholder="••••••••••••" value={password} onChangeText={setPassword} />
                <Pressable onPress={() => navigation.navigate('ForgotPassword')} className="mt-2 self-start">
                  <Text className="text-accent-indigo text-xs">Forgot password?</Text>
                </Pressable>
              </View>

              <TurnstileGate action="login" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              <View className="mt-2">
                <PrimaryButton
                  title={loading ? 'Signing in...' : 'Sign In'}
                  onPress={handleSubmit}
                  loading={loading}
                  disabled={!usernameOrEmail.trim() || !password.trim() || !turnstileToken}
                  icon={<ArrowRight size={18} color="#ffffff" />}
                />
              </View>
            </View>

            <View className="mt-6 pt-5 border-t border-white/[0.08] items-center">
              <Pressable onPress={() => navigation.navigate('Register')}>
                <Text className="text-text-secondary text-sm">
                  Don't have an account? <Text className="text-accent-indigo font-bold">Sign Up</Text>
                </Text>
              </Pressable>
            </View>
          </GlassPanel>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
