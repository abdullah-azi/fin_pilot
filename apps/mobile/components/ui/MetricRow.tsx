import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/constants/theme';

type MetricRowProps = {
  label: string;
  value: string;
};

export function MetricRow({ label, value }: MetricRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: palette.textMuted,
    ...typography.label,
  },
  value: {
    color: palette.text,
    ...typography.bodyStrong,
  },
});
