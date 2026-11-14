import "expo-router/entry";
import { registerWidgetTaskHandler } from "react-native-android-widget";
import { widgetTaskHandler } from "./src/widgets/taskHandler";

// Home-screen widgets are drawn by this handler, which Android can start without opening the app.
registerWidgetTaskHandler(widgetTaskHandler);
