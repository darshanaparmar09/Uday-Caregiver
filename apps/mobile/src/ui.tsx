import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, F, S } from "./theme";

type Tone = "amber" | "teal" | "coral" | "night" | "outline";
const BG: Record<Tone, string> = { amber: C.amber, teal: C.teal, coral: C.coral, night: C.night, outline: "transparent" };
const FG: Record<Tone, string> = { amber: C.night, teal: "#fff", coral: "#fff", night: "#fff", outline: C.ink };

/** Every tappable control is at least 72px high. */
export function Button({ title, onPress, tone = "amber", busy, sub, style, accessibilityLabel }: { title: string; onPress: () => void; tone?: Tone; busy?: boolean; sub?: string; style?: ViewStyle; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={busy ? undefined : onPress}
      style={({ pressed }) => [st.btn, { backgroundColor: BG[tone], borderWidth: tone === "outline" ? 3 : 0, borderColor: C.night, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
      {busy ? <ActivityIndicator color={FG[tone]} size="large" /> : <>
        <Text style={[st.btnText, { color: FG[tone] }]}>{title}</Text>
        {sub ? <Text style={[st.btnSub, { color: FG[tone] }]}>{sub}</Text> : null}</>}
    </Pressable>
  );
}

export function T({ children, size = S.body, color = C.ink, weight = "regular", center, style }: { children: React.ReactNode; size?: number; color?: string; weight?: keyof typeof F; center?: boolean; style?: object }) {
  return <Text style={[{ fontFamily: F[weight], fontSize: Math.max(size, S.label), lineHeight: Math.max(size, S.label) * 1.3, color, textAlign: center ? "center" : "left" }, style]}>{children}</Text>;
}

export function Field(p: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <T weight="semi">{p.label}</T>
      <TextInput placeholderTextColor={C.inkSoft} {...p} style={[st.input, p.style]} />
    </View>
  );
}

export function Screen({ children, tone = "peach", scroll = true, tabbed = false }: { children: React.ReactNode; tone?: "peach" | "night"; scroll?: boolean; tabbed?: boolean }) {
  const bg = tone === "night" ? C.night : C.peach;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={tabbed ? ["top", "left", "right"] : ["top", "bottom", "left", "right"]}>
      {scroll ? <ScrollView contentContainerStyle={{ padding: 20, gap: S.gap, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        : <View style={{ flex: 1 }}>{children}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, tone = "cream", style }: { children: React.ReactNode; tone?: "cream" | "teal" | "amber" | "coral" | "night"; style?: ViewStyle }) {
  const m = { cream: [C.cream, C.line], teal: ["#E3F3F0", C.teal], amber: ["#FFF0D6", C.amber], coral: ["#FDE5E5", C.coral], night: [C.night2, C.night2] }[tone];
  return <View style={[st.card, { backgroundColor: m[0], borderColor: m[1] }, style]}>{children}</View>;
}

export function ErrorText({ msg }: { msg: string }) { return msg ? <Card tone="coral"><T color={C.ink} weight="semi">{msg}</T></Card> : null; }

const st = StyleSheet.create({
  btn: { minHeight: S.touch, borderRadius: S.radius, paddingHorizontal: 24, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: F.bold, fontSize: 24, lineHeight: 30, textAlign: "center" },
  btnSub: { fontFamily: F.medium, fontSize: S.label, lineHeight: 28, textAlign: "center", opacity: 0.95 },
  input: { minHeight: S.touch, borderRadius: 18, borderWidth: 3, borderColor: C.night, backgroundColor: "#fff", paddingHorizontal: 18, fontFamily: F.semi, fontSize: 26, color: C.ink },
  card: { borderRadius: S.radius, borderWidth: 2, padding: 20, gap: 12 },
});

export function Chips({ options, value, onChange, multi = true }: { options: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {options.map((o) => { const on = value.includes(o); return (
        <Pressable key={o} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onChange(multi ? (on ? value.filter((x) => x !== o) : [...value, o]) : [o])}
          style={{ minHeight: S.touch, paddingHorizontal: 18, borderRadius: 36, borderWidth: 3, borderColor: on ? C.amber : C.night, backgroundColor: on ? "#FFF0D6" : "#fff", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.semi, fontSize: S.label, color: C.ink }}>{on ? "✓ " : ""}{o}</Text></Pressable>); })}
    </View>
  );
}
