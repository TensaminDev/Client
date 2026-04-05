import Form from "@/components/screens/login/form";

/**
 * Executes Page.
 * @param none This function has no parameters.
 * @returns unknown.
 */
export default function Page() {
  return (
    <div className="w-full h-full flex flex-col gap-10 items-center justify-center">
      <Form />
      <div className="flex">
        <a target="_blank" href="https://docs.tensamin.net/installation/#iota">
          <p className="text-sm underline text-foreground/75 text-center whitespace-pre-wrap">
            Don't have an account yet?{"\n"}Click here to get help setting up an
            Iota.
          </p>
        </a>
      </div>
    </div>
  );
}
