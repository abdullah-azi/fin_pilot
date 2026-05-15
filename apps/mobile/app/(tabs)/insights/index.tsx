import { Text } from 'react-native';

import { MetricRow } from '@/components/ui/MetricRow';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { palette } from '@/constants/theme';

export default function SpendingAnalysisScreen() {
  return (
    <Screen
      title="Spending Analysis"
      subtitle="Group analytics, top categories, and overspending patterns under Insights."
    >
      <SectionCard title="Top categories" tone="danger">
        <MetricRow label="Food delivery" value="$210" />
        <MetricRow label="Shopping" value="$180" />
        <MetricRow label="Transport" value="$95" />
      </SectionCard>

      <SectionCard title="Observation">
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
          Spending Analysis is the default Insights screen. Savings Goals and Reports can branch
          from here as nested routes.
        </Text>
      </SectionCard>
    </Screen>
  );
}

