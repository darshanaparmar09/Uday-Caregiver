// GENERATED from packages/mobile-shared/src/push.ts. Do not edit here; run node scripts/sync-mobile-shared.mjs
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Ask permission, create the urgent channel (Android), and register this phone's push token with Uday. */
export async function registerForPush(): Promise<string | null> {
  try {
    if (Platform.OS === "web" || !Device.isDevice) return null;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("urgent", { name: "New requests and safety", importance: Notifications.AndroidImportance.MAX, sound: "default", vibrationPattern: [0, 400, 200, 400] });
      await Notifications.setNotificationChannelAsync("default", { name: "Updates", importance: Notifications.AndroidImportance.DEFAULT });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api("/api/push", { token, platform: Platform.OS });
    return token;
  } catch { return null; }
}

export function onNotificationTap(fn: (data: any) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => fn(r.notification.request.content.data));
  return () => sub.remove();
}
