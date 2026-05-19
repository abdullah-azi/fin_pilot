import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { authPalette } from '@/constants/theme';

const COLORS = authPalette;

export default function InsightsHubScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Insights</Text>
          <Text style={styles.subtitle}>Analysis, savings planning, and reports in one place.</Text>
        </View>

        <View style={styles.cardStack}>
          <Pressable
            onPress={() => router.push('/(tabs)/insights/savings-goals?create=1')}
            style={styles.primaryCard}
          >
            <View style={styles.primaryIcon}>
              <FontAwesome color="#FFFFFF" name="flag" size={18} />
            </View>
            <View style={styles.primaryCopy}>
              <Text style={styles.primaryTitle}>Create savings goal</Text>
              <Text style={styles.primarySubtitle}>Start a target and let FinPilot project the monthly pace.</Text>
            </View>
            <FontAwesome color="rgba(255,255,255,0.65)" name="chevron-right" size={14} />
          </Pressable>

          <InsightRouteCard
            background="#161616"
            borderColor="#2A2A2A"
            icon="money"
            iconBackground="#0D1A12"
            iconColor={COLORS.green}
            subtitle="Track progress, pace status, and monthly allocation advice."
            title="Savings Goals"
            onPress={() => router.push('/(tabs)/insights/savings-goals')}
          />

          <InsightRouteCard
            background="#161616"
            borderColor="#2A2A2A"
            icon="pie-chart"
            iconBackground="#1A1525"
            iconColor={COLORS.violetBright}
            subtitle="Category breakdowns, monthly trends, behavior score, and AI insight cards."
            title="Spending Analysis"
            onPress={() => router.push('/(tabs)/insights/spending-analysis')}
          />

          <InsightRouteCard
            background="#161616"
            borderColor="#2A2A2A"
            icon="bar-chart"
            iconBackground="#131520"
            iconColor="#818CF8"
            subtitle="Monthly summaries, trends, and report exports."
            title="Reports"
            onPress={() => router.push('/(tabs)/insights/reports')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InsightRouteCard({
  background,
  borderColor,
  icon,
  iconBackground,
  iconColor,
  onPress,
  subtitle,
  title,
}: {
  background: string;
  borderColor: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  iconBackground: string;
  iconColor: string;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.routeCard, { backgroundColor: background, borderColor }]}>
      <View style={[styles.routeIcon, { backgroundColor: iconBackground }]}>
        <FontAwesome color={iconColor} name={icon} size={16} />
      </View>
      <View style={styles.routeCopy}>
        <Text style={styles.routeTitle}>{title}</Text>
        <Text style={styles.routeSubtitle}>{subtitle}</Text>
      </View>
      <FontAwesome color="#4B4B52" name="chevron-right" size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  title: {
    color: '#F0F0F0',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  subtitle: {
    color: '#555555',
    fontSize: 11,
    lineHeight: 16,
  },
  cardStack: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 10,
  },
  primaryCard: {
    backgroundColor: COLORS.violet,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCopy: {
    flex: 1,
  },
  primaryTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  primarySubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    lineHeight: 15,
  },
  routeCard: {
    borderRadius: 12,
    borderWidth: 0.5,
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCopy: {
    flex: 1,
  },
  routeTitle: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  routeSubtitle: {
    color: '#66666F',
    fontSize: 10,
    lineHeight: 15,
  },
});
