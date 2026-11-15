import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { C } from "../theme";

/** The sunrise circle. With pulse, three soft rings breathe outward around a solid amber disc. */
export function Sun({ size, pulse = true, color = C.amber, children }: { size: number; pulse?: boolean; color?: string; children?: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start(); return () => loop.stop();
  }, [pulse]);
  const ring = (delay: number) => {
    const p = Animated.modulo(Animated.add(t, delay), 1);
    return { position: "absolute" as const, width: size, height: size, borderRadius: size / 2, backgroundColor: color,
      opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }] };
  };
  const breathe = pulse ? { transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.04, 1] }) }] } : {};
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {pulse && <><Animated.View style={ring(0)} /><Animated.View style={ring(0.33)} /><Animated.View style={ring(0.66)} /></>}
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center",
        shadowColor: color, shadowOpacity: 0.6, shadowRadius: 40, shadowOffset: { width: 0, height: 0 }, elevation: 12 }, breathe]}>{children}</Animated.View>
    </View>
  );
}
