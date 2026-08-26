import { useCallback, useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';
import { LayoutDashboard, BookOpen, CalendarDays, Search, MessageCircle, BarChart3, Settings as SettingsIcon } from 'lucide-react-native';
import { useAuthContext } from '@/context/AuthContext';
import { authService } from '@/services';
import type { AuthStackParamList, MainStackParamList, MainTabParamList } from './types';

import LoginScreen from '@/screens/LoginScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import MfaChallengeScreen from '@/screens/MfaChallengeScreen';
import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';
import DashboardScreen from '@/screens/DashboardScreen';
import JournalListScreen from '@/screens/JournalListScreen';
import JournalEditorScreen from '@/screens/JournalEditorScreen';
import CalendarScreen from '@/screens/CalendarScreen';
import SearchScreen from '@/screens/SearchScreen';
import ChatScreen from '@/screens/ChatScreen';
import AnalyticsScreen from '@/screens/AnalyticsScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import AchievementsScreen from '@/screens/AchievementsScreen';
import NotificationsScreen from '@/screens/NotificationsScreen';
import CommandPaletteScreen from '@/screens/CommandPaletteScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navigationRef = createNavigationContainerRef<MainStackParamList>();

const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#090d16',
    card: '#0f172a',
    border: 'rgba(255,255,255,0.08)',
    primary: '#818cf8',
    text: '#f8fafc',
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="MfaChallenge" component={MfaChallengeScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // Icon-only past 6 tabs - labels would get cramped/truncated at 7.
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: 'rgba(255,255,255,0.08)' },
        tabBarActiveTintColor: '#818cf8',
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Journals"
        component={JournalListScreen}
        options={{ tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{ tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs" component={MainTabs} />
      <MainStack.Screen
        name="JournalEditor"
        component={JournalEditorScreen}
        options={{ presentation: 'modal' }}
      />
      <MainStack.Screen
        name="Achievements"
        component={AchievementsScreen}
        options={{ presentation: 'modal' }}
      />
      <MainStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ presentation: 'modal' }}
      />
      <MainStack.Screen
        name="CommandPalette"
        component={CommandPaletteScreen}
        options={{ presentation: 'modal' }}
      />
    </MainStack.Navigator>
  );
}

export function RootNavigator() {
  const { isAuthenticated, checking } = useAuthContext();

  // Real user activity extends the 10-minute session. session.touchSession()
  // shipped with the original port but was never wired to anything, so the
  // "sliding" expiry was in fact a flat 10-minute countdown from login: an
  // actively-used app logged the user out mid-session. (The web app hit the
  // identical bug and fixed it in App.jsx with DOM activity listeners; this is
  // the RN equivalent.) onTouchStart on an ancestor View still fires for
  // touches landing on descendants, so this observes taps and the start of
  // scrolls/swipes app-wide without intercepting any of them. Typing is
  // covered separately by api.ts's response interceptor. Throttled to 30s to
  // match the web app and to keep this off the per-touch hot path.
  const lastTouch = useRef(0);
  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastTouch.current < 30000) return;
    lastTouch.current = now;
    authService.touchSession();
  }, []);

  // Tapping a delivered reminder (see notification-service's ReminderScheduler)
  // takes the user straight into a new journal entry - the whole point of the
  // nudge is to get them writing, not just to open the app to the Dashboard.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('JournalEditor', undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  if (checking) {
    return (
      <View className="flex-1 bg-bg-primary items-center justify-center">
        <ActivityIndicator color="#818cf8" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onTouchStart={handleActivity}>
      <NavigationContainer ref={navigationRef} theme={NAV_THEME}>
        {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
      </NavigationContainer>
    </View>
  );
}
