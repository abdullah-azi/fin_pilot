import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Redirect, Tabs } from 'expo-router';

import { authPalette } from '@/constants/theme';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/providers/AuthProvider';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={20} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  useColorScheme();
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (!isBootstrapping && !isAuthenticated) {
    return <Redirect href="/(auth)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: authPalette.violetBright,
        tabBarInactiveTintColor: authPalette.textSoft,
        tabBarStyle: {
          backgroundColor: authPalette.surface,
          borderTopColor: authPalette.border,
          borderTopWidth: 0.5,
          height: 78,
          paddingTop: 10,
          paddingBottom: 12,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        sceneStyle: {
          backgroundColor: authPalette.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <TabBarIcon name="list-alt" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ask-ai"
        options={{
          title: 'Ask AI',
          tabBarIcon: ({ color }) => <TabBarIcon name="commenting" color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <TabBarIcon name="line-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name="user-o" color={color} />,
        }}
      />
    </Tabs>
  );
}
