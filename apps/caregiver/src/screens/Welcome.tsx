import { Image, View, useWindowDimensions } from "react-native";
import { Button, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

export function Welcome({ onSignIn }: { onSignIn: () => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 40, 520);
  return (
    <Screen tone="night">
      <Image source={require("../../assets/nurse.jpg")} accessibilityIgnoresInvertColors accessible accessibilityLabel="An Uday caregiver in uniform"
        style={{ width: w, height: w * 0.64, borderRadius: 26, alignSelf: "center" }} resizeMode="cover" />
      <View style={{ gap: 8, marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.amber }} />
          <T size={38} weight="bold" color={C.onNight}>Uday Caregiver</T>
        </View>
        <T color={C.onNightSoft}>Your jobs, schedule, pay and training in one place.</T>
      </View>
      <View style={{ gap: 12, marginTop: 8 }}>
        {[["Paid every week", "for each completed shift"], ["Insured while you work", "health and accident cover"], ["Grow your tier", "with Uday academy training"]].map(([a, b]) => (
          <View key={a} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <T size={24} weight="bold" color={C.amber}>✓</T><View style={{ flex: 1 }}><T weight="semi" color={C.onNight}>{a}</T><T color={C.onNightSoft}>{b}</T></View>
          </View>))}
      </View>
      <Button title="Sign in" onPress={onSignIn} style={{ marginTop: 12 }} />
      <T color={C.onNightSoft} center>New to Uday? Apply on the Uday website under Careers. Our recruiter calls you within a week.</T>
    </Screen>
  );
}
