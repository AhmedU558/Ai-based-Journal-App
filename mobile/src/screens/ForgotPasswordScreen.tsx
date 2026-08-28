import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyRound, ArrowRight } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { GlassInput } from '@/components/ui/GlassInput';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FadeInView } from '@/components/ui/FadeInView';
import { authService } from '@/services';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

type Stage = 'request' | 'reset';

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [stage, setStage] = useState<Stage>('request');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async () => {
    setError('');
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setInfoMessage('If that email is registered, a reset code has been sent.');
      setStage('reset');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(resetCode, newPassword);
      navigation.navigate('Login');
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired reset code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg-primary" behavior="padding">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <FadeInView>
          <GlassPanel className="p-8">
            <View className="items-center mb-8">
              <LinearGradient colors={['#6366f1', '#a855f7']} style={{ padding: 14, borderRadius: 20, marginBottom: 16 }}>
                <KeyRound size={30} color="#ffffff" />
              </LinearGradient>
              <Text className="text-2xl font-extrabold text-text-primary mb-1">
                {stage === 'request' ? 'Reset Your Password' : 'Enter Reset Code'}
              </Text>
              <Text className="text-text-secondary text-sm text-center">
                {stage === 'request'
                  ? "Enter your account email and we'll send you a reset code"
                  : 'Check your email for the code, then choose a new password'}
              </Text>
            </View>

            {infoMessage && stage === 'reset' ? (
              <View className="mb-5">
                <Text className="text-[#4ade80] text-sm bg-[rgba(34,197,94,0.15)] border border-[rgba(34,197,94,0.3)] py-3 px-4 rounded-xl">
                  {infoMessage}
                </Text>
              </View>
            ) : null}
            {error ? (
              <View className="mb-5">
                <ErrorBanner message={error} />
              </View>
            ) : null}

            {stage === 'request' ? (
              <View className="gap-4">
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
                <View className="mt-2">
                  <PrimaryButton
                    title={loading ? 'Sending...' : 'Send Reset Code'}
                    onPress={handleRequestCode}
                    loading={loading}
                    disabled={!email.trim()}
                    icon={<ArrowRight size={18} color="#ffffff" />}
                  />
                </View>
              </View>
            ) : (
              <View className="gap-4">
                <View>
                  <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Reset Code</Text>
                  <GlassInput autoCapitalize="none" placeholder="XXXXX-XXXXX" value={resetCode} onChangeText={setResetCode} />
                </View>
                <View>
                  <Text className="text-[#cbd5e1] text-sm font-medium mb-2">New Password</Text>
                  <PasswordInput placeholder="••••••••••••" value={newPassword} onChangeText={setNewPassword} />
                </View>
                <View>
                  <Text className="text-[#cbd5e1] text-sm font-medium mb-2">Confirm New Password</Text>
                  <PasswordInput
                    placeholder="Re-enter your new password"
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                  />
                </View>
                <View className="mt-2">
                  <PrimaryButton
                    title={loading ? 'Resetting...' : 'Reset Password'}
                    onPress={handleResetPassword}
                    loading={loading}
                    disabled={!resetCode.trim() || !newPassword.trim() || !confirmNewPassword.trim()}
                    icon={<ArrowRight size={18} color="#ffffff" />}
                  />
                </View>
              </View>
            )}

            <View className="mt-6 pt-5 border-t border-white/[0.08] items-center">
              <Pressable onPress={() => navigation.navigate('Login')}>
                <Text className="text-text-muted text-xs">Back to Sign In</Text>
              </Pressable>
            </View>
          </GlassPanel>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
