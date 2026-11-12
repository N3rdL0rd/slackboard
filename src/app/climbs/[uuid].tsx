import { Redirect, useLocalSearchParams } from "expo-router";

/** `https://tensionboardapp2.com/climbs/<id>` and `slackboard://climbs/<id>` open the climb. */
export default function ClimbLink() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <Redirect href={{ pathname: "/climb/[uuid]", params: { uuid: uuid.toUpperCase() } }} />;
}
