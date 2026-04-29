import { useCall } from "../store";

export default function Preview() {
  const currentCallData = useCall((state) => state.currentCallData);

  return <div>Preview View {JSON.stringify(currentCallData?.users)}</div>;
}
