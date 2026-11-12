import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../../ui/Icon";
import { c, font, size } from "../../theme";

const tab = (name: string, title: string, icon: IconName) => (
  <Tabs.Screen
    name={name}
    options={{
      title,
      tabBarIcon: ({ color }) => <Icon name={icon} color={String(color)} size={26} />,
    }}
  />
);

export default function TabsLayout() {
  // Pad for the system navigation bar (3-button or gesture) so the tabs are never covered.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: font.uiMedium, fontSize: 12 },
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line, height: size.bottomNav + insets.bottom, paddingTop: 8, paddingBottom: 10 + insets.bottom },
        sceneStyle: { backgroundColor: c.ground },
      }}
    >
      {tab("index", "Climb", "climb")}
      {tab("discover", "Discover", "search")}
      {tab("log", "Log", "log")}
      {tab("you", "You", "you")}
    </Tabs>
  );
}
