import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@methanium/ui";
import {
  generatedAt,
  packageCount,
  packages,
} from "../../../../licenses/third-party-credits.json";
import { ExternalLink } from "lucide-react";

const licenseTexts = import.meta.glob("../../../../licenses/**/*", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function getLicenseFiles(licensePackage: (typeof packages)[number]) {
  return licensePackage.files.map((fileName) => ({
    fileName,
    text: licenseTexts[
      "../../../../" + licensePackage.licenseFolder + "/" + fileName
    ],
  }));
}

export default function Page() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex gap-2">
        <a
          className="underline"
          href="https://legal.methanium.net/tensamin/privacy-policy/"
          rel="noreferrer"
          target="_blank"
        >
          Privacy Policy
        </a>
        <a
          className="underline"
          href="https://legal.methanium.net/tensamin/terms-of-service/"
          rel="noreferrer"
          target="_blank"
        >
          Terms of Service
        </a>
      </div>
      <p className="text-xl font-semibold">Licenses</p>
      <div className="flex flex-col">
        <p>Last generated: {generatedAt}</p>
        <p>Package Count: {packageCount}</p>
      </div>
      <div className="min-h-0 flex-1 max-h-[calc(100vh-180px)] overflow-auto px-1">
        <div className="flex flex-col gap-5 p-px pb-14!">
          {packages.map((licensePackage) => (
            <Card
              className="pb-0!"
              key={licensePackage.name + licensePackage.version}
              id={licensePackage.name + licensePackage.version}
            >
              <CardHeader>
                <CardTitle className="flex gap-2 items-center">
                  <Badge>{licensePackage.license}</Badge> {licensePackage.name}{" "}
                  {licensePackage.version}
                </CardTitle>
              </CardHeader>
              {licensePackage.description && (
                <CardContent>
                  <CardDescription>
                    {licensePackage.description}
                  </CardDescription>
                </CardContent>
              )}
              <CardFooter className="gap-2 px-0! flex md:pl-3! justify-center md:justify-start!">
                <LicenseDialog licensePackage={licensePackage} />
                {licensePackage.repository ? (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={licensePackage.repository
                      .replace("git+", "")
                      .replace(".git", "")}
                  >
                    <Button variant="outline" className="cursor-pointer">
                      Repository <ExternalLink />
                    </Button>
                  </a>
                ) : (
                  <Button disabled variant="outline" className="cursor-pointer">
                    Repository <ExternalLink />
                  </Button>
                )}
                {licensePackage.homepage ? (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={licensePackage.homepage}
                  >
                    <Button variant="outline" className="cursor-pointer">
                      Homepage <ExternalLink />
                    </Button>
                  </a>
                ) : (
                  <Button disabled variant="outline" className="cursor-pointer">
                    Homepage <ExternalLink />
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function LicenseDialog({
  licensePackage,
}: {
  licensePackage: (typeof packages)[number];
}) {
  const licenseFiles = getLicenseFiles(licensePackage);
  return (
    <Dialog>
      <DialogTrigger
        render={({ onClick }) => (
          <Button
            onClick={onClick}
            disabled={!licenseFiles.some(({ text }) => text)}
            className="cursor-pointer"
          >
            View Text
          </Button>
        )}
      />
      <DialogContent className="flex max-h-[80vh] min-h-0 flex-col overflow-hidden sm:max-w-3xl">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
          {licenseFiles.map(({ fileName, text }, index) => (
            <section key={fileName} className="border-b last:border-b-0">
              <h3
                className={`border-b pb-2 text-sm font-medium ${index >= 1 && "pt-2"}`}
              >
                {fileName}
              </h3>
              <pre className="pt-2 whitespace-pre-wrap wrap-break-word text-xs leading-relaxed">
                {text ||
                  "License text could not be loaded. Please contact support@tensamin.net"}
              </pre>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
