import { View } from "react-native";
import { durationText } from "../../core/attempts";
import { clockOffset, fixed } from "../../core/devFormat";
import { sessionOverview, type LinkedAttempt, type SessionData } from "../../core/watchData";
import { SectionLabel } from "../parts";
import { Text } from "../Text";
import { c, r } from "../../theme";
import { DevRow } from "./DevRow";

/** The session as a whole, and the heart rate during each attempt logged in the Log. */
export function SessionAttempts({ data, linked, nameOf }: { data: SessionData; linked: LinkedAttempt[]; nameOf: (provider: string, climbUuid: string) => string }) {
  const o = sessionOverview(data);
  const start = data.session.startedAt;
  return (
    <View style={{ gap: 6 }}>
      <SectionLabel>Session</SectionLabel>
      <DevRow label="Duration" value={durationText(o.durationMs / 1000)} />
      <DevRow label="Heart rate" value={o.hr ? `avg ${fixed(o.hr.avg, 0)}, min ${o.hr.min}, peak ${o.hr.peak}` : "no samples"} />
      <DevRow label="Elevation" value={o.elevationNet !== null ? `net ${fixed(o.elevationNet, 2)} m, range ${fixed(o.elevationRange, 2)} m` : "no samples"} />
      <DevRow label="Watch calories" value={data.session.stats.calories !== null ? `${fixed(data.session.stats.calories, 1)} kcal` : "-"} />

      <SectionLabel>Attempts you logged</SectionLabel>
      {linked.length === 0 ? <Text v="secondary">No logged attempts fall inside this session. Attempt windows come from your log and lighting history (see attempts.ts); a logged climb at a time that overlaps the session shows here.</Text> : null}
      {linked.map((l) => {
        const w = l.window;
        return (
          <View key={w.id} style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 12, gap: 2 }}>
            <Text v="bodyStrong">{nameOf(w.provider, w.climbUuid)}</Text>
            <Text v="secondary">{clockOffset(w.start, start)} to {clockOffset(w.end, start)} · {w.tries} {w.tries === 1 ? "try" : "tries"} · {w.isSend ? "send" : "attempts"} · {w.quality === "bounded" ? "bounded by lighting" : "estimated length"}</Text>
            <Text v="caption">{l.hr ? `Heart rate: average ${fixed(l.hr.avg, 0)}, peak ${l.hr.peak}, climbed ${fixed(l.hr.rise, 0)} from the start (${l.hr.count} readings)` : "No heart-rate readings in this window"}</Text>
          </View>
        );
      })}
      <Text v="caption">A window is a pair of bounds, not a measurement: the heart rate between them includes any rest around the real attempt.</Text>
    </View>
  );
}
