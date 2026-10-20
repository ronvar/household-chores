import { appVersion } from "@/lib/app-version";

export function GET() {
  return Response.json({ version: appVersion }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
