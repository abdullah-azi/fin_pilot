import { Text } from 'react-native';

import { MetricRow } from '@/components/ui/MetricRow';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { palette } from '@/constants/theme';

export default function SavingsGoalsScreen() {
  return (
    <Screen
      title="Savings Goals"
      subtitle="This screen will hold goal creation, progress tracking, and AI suggestions."
    >
      <SectionCard title="Starter goal" tone="success">
        <MetricRow label="Emergency fund" value="$500 / $1,500" />
      </SectionCard>

      <SectionCard title="AI guidance">
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
          Build savings recommendations from income stability, spend trends, and user priorities.
        </Text>
      </SectionCard>
    </Screen>
  );
}

