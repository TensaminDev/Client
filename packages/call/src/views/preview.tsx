import { useCall } from "../context";

export default function Preview() {
  const { currentCallData } = useCall();

  return <div>Preview View {JSON.stringify(currentCallData?.users)}</div>;
}
