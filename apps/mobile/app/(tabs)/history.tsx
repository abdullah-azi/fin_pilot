import { Text } from 'react-native';

import { MetricRow } from '@/components/ui/MetricRow';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { palette } from '@/constants/theme';

export default function HistoryScreen() {
  return (
    <Screen
      title="Transaction History"
      subtitle="Review income and expenses, then drill into individual records later."
    >
      <SectionCard title="Recent activity">
        <MetricRow label="Salary" value="+$3,000" />
        <MetricRow label="Groceries" value="-$120" />
        <MetricRow label="Transport" value="-$42" />
      </SectionCard>

      <SectionCard title="Upcoming work">
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
          This screen is structured for filters, categories, and edit/delete transaction flows.
        </Text>
      </SectionCard>
    </Screen>
  );
}

