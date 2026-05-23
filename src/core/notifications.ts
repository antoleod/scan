import { Platform } from 'react-native';
import { diag } from './diagnostics';

declare const require: (moduleName: string) => any;

export interface LocalNotificationInput {
  title: string;
  body: string;
  at?: number;
  data?: Record<string, unknown>;
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof Notification === 'undefined') return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      return (await Notification.requestPermission()) === 'granted';
    }

    const Notifications = require('expo-notifications');
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync();
    return Boolean(next.granted);
  } catch (error) {
    await diag.warn('notifications.permission.error', { message: String(error) });
    return false;
  }
}

export async function scheduleLocalNotification(input: LocalNotificationInput): Promise<string | null> {
  const allowed = await requestNotificationPermission();
  if (!allowed) return null;

  try {
    if (Platform.OS === 'web') {
      const delay = Math.max(0, Number(input.at || Date.now()) - Date.now());
      const id = `web_notification_${Date.now()}`;
      setTimeout(() => {
        try {
          new Notification(input.title, { body: input.body, data: input.data });
        } catch {
          // Browser notification delivery is best-effort.
        }
      }, delay);
      return id;
    }

    const Notifications = require('expo-notifications');
    const trigger = input.at && input.at > Date.now()
      ? { date: new Date(input.at) }
      : null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: input.data || {},
      },
      trigger,
    });
  } catch (error) {
    await diag.warn('notifications.schedule.error', { message: String(error) });
    return null;
  }
}
