import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text } from 'react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = { Dashboard: '📊', Monitors: '🔍', Tests: '🧪', Alerts: '🔔', Settings: '⚙️' };
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icons[label] || '❓'}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarStyle: { backgroundColor: '#18181b', borderTopColor: '#27272a' },
        tabBarActiveTintColor: '#4c6ef5',
        tabBarInactiveTintColor: '#71717a',
        headerStyle: { backgroundColor: '#09090b' },
        headerTintColor: '#fff',
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Monitors" component={DashboardScreen} options={{ title: 'Monitors' }} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </QueryClientProvider>
  );
}
