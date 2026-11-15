import { View } from "react-native";
import { Button, Screen, T } from "../ui";
import { C } from "../theme";
import { Sun } from "./Sun";
import type { Role } from "../../App";

export function Welcome({ onPick }: { onPick: (r: Role) => void }) {
  return (
    <Screen tone="night">
      <View style={{ alignItems: "center", paddingTop: 24, gap: 12 }}>
        <Sun size={140} pulse={false} />
        <T size={44} weight="bold" color={C.onNight} center>uday</T>
        <T size={24} color={C.onNightSoft} center>Care for your parents, every single day.</T>
      </View>
      <View style={{ gap: 16, marginTop: 24 }}>
        <T size={26} weight="semi" color={C.onNight}>Who is using this phone?</T>
        <Button title="I check in each day" sub="For parents and seniors" onPress={() => onPick("senior")} />
        <Button title="I look after a parent" sub="For family members" tone="teal" onPress={() => onPick("family")} />
        <Button title="I am an Uday caregiver" sub="Jobs, shifts and earnings" tone="night" style={{ borderWidth: 3, borderColor: C.amber }} onPress={() => onPick("caregiver")} />
      </View>
    </Screen>
  );
}
