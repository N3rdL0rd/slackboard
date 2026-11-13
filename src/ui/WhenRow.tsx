import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform } from "react-native";
import { localStamp, shortDate } from "../core/shareCard";
import { c, r } from "../theme";
import { Tap } from "./parts";
import { Text } from "./Text";

/** When a climb happened: the date and time, with a control to change them. A time in the future becomes now. Android only for now. */
export function WhenRow({ when, onChange }: { when: Date; onChange: (d: Date) => void }) {
  const pick = () => {
    if (Platform.OS !== "android") return;
    DateTimePickerAndroid.open({
      value: when, mode: "date", maximumDate: new Date(),
      onChange: (e, day) => {
        if (e.type !== "set" || !day) return;
        DateTimePickerAndroid.open({
          value: day, mode: "time",
          onChange: (e2, t) => {
            if (e2.type !== "set" || !t) return;
            const next = new Date(day);
            next.setHours(t.getHours(), t.getMinutes(), 0, 0);
            onChange(next > new Date() ? new Date() : next);
          },
        });
      },
    });
  };
  return (
    <Tap accessibilityRole="button" accessibilityLabel="Change date and time" onPress={pick}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
      <Text v="bodyStrong" style={{ flex: 1 }}>{shortDate(localStamp(when))}, {String(when.getHours()).padStart(2, "0")}:{String(when.getMinutes()).padStart(2, "0")}</Text>
      <Text v="caption">Change</Text>
    </Tap>
  );
}
