import { Text } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { palette } from '@/constants/theme';

export default function AskAIScreen() {
  return (
    <Screen
      title="Ask AI"
      subtitle='This is FinPilot’s core screen for questions like "Can I afford this purchase?"'
    >
      <SectionCard title="Example prompt">
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
          Can I afford a $250 pair of headphones this week without hurting my savings target?
        </Text>
      </SectionCard>

      <SectionCard title="Expected response" tone="warning">
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
          The backend should combine real balances and spending trends with AI explanation, not
          let the model guess the numbers.
        </Text>
      </SectionCard>
    </Screen>
  );
}

