import { Stack } from 'expo-router';

export default function InsightsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Insights' }} />
      <Stack.Screen name="spending-analysis" options={{ headerShown: false }} />
      <Stack.Screen name="savings-goals" options={{ headerShown: false }} />
      <Stack.Screen name="reports" options={{ headerShown: false }} />
    </Stack>
  );
}
