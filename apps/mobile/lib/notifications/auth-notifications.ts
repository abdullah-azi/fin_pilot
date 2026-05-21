import * as Notifications from 'expo-notifications';

type AuthNotificationKind = 'login' | 'restore' | 'signup';
type PresentAuthNotificationOptions = {
  requestPermission: boolean;
};

function getNotificationCopy(kind: AuthNotificationKind) {
  switch (kind) {
    case 'signup':
      return {
        body: 'Your FinPilot account is ready. Start tracking your money with confidence.',
        title: 'Account created successfully',
      };
    case 'restore':
      return {
        body: 'Your session is active and your finances are ready to go.',
        title: 'Welcome back',
      };
    case 'login':
    default:
      return {
        body: 'You are signed in and ready to continue.',
        title: 'Welcome back',
      };
  }
}

export async function presentAuthNotification(
  kind: AuthNotificationKind,
  { requestPermission }: PresentAuthNotificationOptions,
) {
  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;

  if (status !== 'granted' && requestPermission) {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return false;
  }

  const content = getNotificationCopy(kind);
  await Notifications.scheduleNotificationAsync({
    content: {
      body: content.body,
      data: {
        kind: 'auth_status',
        source: kind,
      },
      title: content.title,
    },
    trigger: null,
  });
  return true;
}
