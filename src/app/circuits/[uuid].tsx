import { Redirect, useLocalSearchParams } from "expo-router";

/** `https://tensionboardapp2.com/circuits/<id>` and `slackboard://circuits/<id>` open the circuit. */
export default function CircuitLink() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <Redirect href={{ pathname: "/circuit/[uuid]", params: { uuid: uuid.toUpperCase() } }} />;
}
