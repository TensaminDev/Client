import Form from "@/components/screens/login/form";
import CreateScreen from "@tensamin/ui/screens/util";

/**
 * Executes Page.
 * @param none This function has no parameters.
 * @returns unknown.
 */
export default function Page() {
  return (
    <CreateScreen className="gap-5">
      <Form />
      <div className="flex">
        <a target="_blank" href="https://docs.tensamin.net/installation/#iota">
          <p className="text-sm underline text-foreground/75 text-center whitespace-pre-wrap">
            Don't have an account yet?{"\n"}Click here to get help setting up an
            Iota.
          </p>
        </a>
      </div>
    </CreateScreen>
  );
}
