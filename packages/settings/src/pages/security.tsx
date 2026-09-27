import { useMTP } from "@tensamin/mtp";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@methanium/ui";
import ClearStorageButton from "@tensamin/shared/clearStorageButton";
import { Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Grant = {
  app_id: string;
  app_name: string;
  domain: string;
  scopes: string[];
  insecure: boolean;
  metadata: string | null;
};

export default function Page() {
  const { send } = useMTP();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [json, setJson] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const { data } = await send("TAuthGrantList", {});
    const next = JSON.parse(data.Json) as Grant[];
    setGrants(next);
    setJson(
      Object.fromEntries(
        next.map((grant) => [grant.app_id, grant.metadata ?? "null"]),
      ),
    );
  }, [send]);

  useEffect(() => {
    void refresh().catch((caught) =>
      setError(caught instanceof Error ? caught.message : String(caught)),
    );
  }, [refresh]);

  async function run(appId: string, action: () => Promise<void>) {
    setBusy(appId);
    setError("");
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="mb-1 text-sm text-muted-foreground">
          Remove local client credentials and log out.
        </p>
        <ClearStorageButton className="w-full md:w-auto!" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Authorized apps</h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">App name</TableHead>
              <TableHead>JSON</TableHead>
              <TableHead className="w-0">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((grant) => (
              <TableRow key={grant.app_id}>
                <TableCell className="align-top">
                  <p className="font-medium">{grant.app_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {grant.domain}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {grant.scopes.join(", ")}
                  </p>
                  {grant.insecure && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      Insecure
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Textarea
                    aria-label={`${grant.app_name} JSON metadata`}
                    className="min-h-28 font-mono text-xs"
                    spellCheck={false}
                    value={json[grant.app_id] ?? "null"}
                    onChange={(event) =>
                      setJson((current) => ({
                        ...current,
                        [grant.app_id]: event.currentTarget.value,
                      }))
                    }
                  />
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex gap-1">
                    <Button
                      disabled={busy === grant.app_id}
                      size="icon-xs"
                      title={`Save ${grant.app_name} JSON`}
                      variant="ghost"
                      onClick={() => {
                        const value = json[grant.app_id] ?? "null";
                        try {
                          JSON.parse(value);
                        } catch {
                          setError(`${grant.app_name} JSON is invalid.`);
                          return;
                        }
                        void run(grant.app_id, () =>
                          send("TAuthGrantMetadataSet", {
                            AppId: grant.app_id,
                            Json: value,
                          }).then(() => undefined),
                        );
                      }}
                    >
                      <Save className="size-3.5" />
                    </Button>
                    <Button
                      className="text-destructive hover:text-destructive"
                      disabled={busy === grant.app_id}
                      size="icon-xs"
                      title={`Revoke ${grant.app_name}`}
                      variant="ghost"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Revoke ${grant.app_name} and delete its JSON?`,
                          )
                        )
                          return;
                        void run(grant.app_id, () =>
                          send("TAuthGrantRevoke", {
                            AppId: grant.app_id,
                          }).then(() => undefined),
                        );
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {grants.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  No authorized apps.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
