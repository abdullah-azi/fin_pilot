import { Stack } from 'expo-router';

export default function InsightsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Spending Analysis' }} />
      <Stack.Screen name="savings-goals" options={{ title: 'Savings Goals' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports & Charts' }} />
    </Stack>
  );
}

