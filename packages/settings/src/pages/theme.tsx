import { StylePicker } from "@tensamin/ui";

export default function Page() {
  return <div className="overflow-y-auto"><StylePicker /><div className="absolute bottom-0 right-0 mb-3 mr-2"><a className="block w-60 text-xs whitespace-pre-wrap" href="https://git.methanium.net/tensamin/client/issues/new" target="_blank" rel="noreferrer">Please open a Git issue to help us improve this feature. We want to get it right.</a></div></div>;
}
