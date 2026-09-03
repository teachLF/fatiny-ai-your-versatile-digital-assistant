import { createFileRoute } from "@tanstack/react-router";
import { ghJson, jsonResponse, errorResponse } from "@/lib/github.server";

export const Route = createFileRoute("/api/gh/file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const owner = url.searchParams.get("owner");
          const repo = url.searchParams.get("repo");
          const path = url.searchParams.get("path");
          const branch = url.searchParams.get("branch");
          if (!owner || !repo || !path)
            return jsonResponse({ error: "معطيات ناقصة" }, 400);

          const data = await ghJson<any>(
            `repos/${owner}/${repo}/contents/${path
              .split("/")
              .map(encodeURIComponent)
              .join("/")}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`,
          );
          const content =
            data.encoding === "base64"
              ? new TextDecoder().decode(
                  Uint8Array.from(atob(String(data.content).replace(/\n/g, "")), (c) =>
                    c.charCodeAt(0),
                  ),
                )
              : String(data.content ?? "");
          return jsonResponse({ path, sha: data.sha, content });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
