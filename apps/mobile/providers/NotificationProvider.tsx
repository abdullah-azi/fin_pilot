import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { PropsWithChildren, createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { deactivateNotificationDevice, registerNotificationDevice } from '@/lib/api/notifications';
import { useAuth } from '@/providers/AuthProvider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationContextValue = {
  expoPushToken: string | null;
  permissionStatus: Notifications.PermissionStatus | null;
  refreshPushRegistration: (promptForPermissions?: boolean) => Promise<boolean>;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: PropsWithChildren) {
  const { accessToken, getValidAccessToken, isAuthenticated, isBootstrapping, user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus | null>(null);
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => undefined);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => undefined);

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  }, []);

  useEffect(() => {
    if (isBootstrapping || !isAuthenticated) {
      return;
    }

    if (user?.preferences?.notifications_enabled === false) {
      void deactivateRegisteredDevice();
      return;
    }

    void refreshPushRegistration(false);
  }, [isAuthenticated, isBootstrapping, user?.preferences?.notifications_enabled]);

  async function deactivateRegisteredDevice() {
    const activeToken = registeredTokenRef.current ?? expoPushToken;
    const token = accessToken ?? (await getValidAccessToken());
    if (!activeToken || !token) {
      setExpoPushToken(null);
      return;
    }

    try {
      await deactivateNotificationDevice(token, activeToken);
    } catch {
      // Best-effort cleanup only.
    } finally {
      registeredTokenRef.current = null;
      setExpoPushToken(null);
    }
  }

  async function refreshPushRegistration(promptForPermissions = false) {
    if (!isAuthenticated) {
      return false;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      null;

    if (!Device.isDevice || !projectId) {
      return false;
    }

    const currentPermissions = await Notifications.getPermissionsAsync();
    let nextStatus = currentPermissions.status;

    if (nextStatus !== 'granted' && promptForPermissions) {
      const requested = await Notifications.requestPermissionsAsync();
      nextStatus = requested.status;
    }

    setPermissionStatus(nextStatus);
    if (nextStatus !== 'granted') {
      return false;
    }

    let pushToken: string;
    try {
      pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
      return false;
    }

    setExpoPushToken(pushToken);

    if (registeredTokenRef.current === pushToken) {
      return true;
    }

    const token = accessToken ?? (await getValidAccessToken());
    if (!token) {
      return false;
    }

    await registerNotificationDevice(token, {
      expo_push_token: pushToken,
      platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
      device_name: Device.modelName ?? Device.deviceName ?? null,
      app_build: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
      push_enabled: true,
    });

    registeredTokenRef.current = pushToken;
    return true;
  }

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        permissionStatus,
        refreshPushRegistration,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider.');
  }

  return context;
}
