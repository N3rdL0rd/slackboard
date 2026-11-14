import { useState } from "react";
import { Platform, View } from "react-native";
import { requestPinWidget } from "react-native-android-widget";
import { Button, SectionLabel } from "./parts";
import { Text } from "./Text";

const WIDGETS = [
  { name: "Streak", label: "Streak" },
  { name: "Today", label: "Today's session" },
  { name: "Week", label: "This week" },
  { name: "QuickLog", label: "Quick log" },
  { name: "Goal", label: "Goal" },
] as const;

/** Adds a widget to the home screen through the launcher's own "Add to home screen" prompt. Android only. */
export function WidgetSettings() {
  const [note, setNote] = useState("");
  if (Platform.OS !== "android") return null;
  const pin = async (name: string) => {
    setNote("");
    try { if (!(await requestPinWidget({ widgetName: name }))) setNote("Your launcher can't add this from here. Use the widget picker."); }
    catch { setNote("Couldn't add the widget."); }
  };
  return (
    <>
      <SectionLabel>Home-screen widgets</SectionLabel>
      <View style={{ gap: 8 }}>
        {WIDGETS.map((w) => <Button key={w.name} variant="secondary" label={w.label} onPress={() => void pin(w.name)} />)}
      </View>
      {note ? <Text v="secondary" style={{ marginTop: 8 }} aria-live="polite">{note}</Text> : null}
    </>
  );
}
