import { Text } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { palette } from '@/constants/theme';

export default function ReportsScreen() {
  return (
    <Screen
      title="Reports & Charts"
      subtitle="This route is ready for monthly summaries, graphs, and category visualizations."
    >
      <SectionCard title="Reporting scope">
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
          Keep reports deterministic in the backend, then render charts in the mobile client.
        </Text>
      </SectionCard>
    </Screen>
  );
}

