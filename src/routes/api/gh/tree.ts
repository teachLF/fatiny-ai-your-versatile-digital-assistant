import { createFileRoute } from "@tanstack/react-router";
import { ghJson, jsonResponse, errorResponse } from "@/lib/github.server";

export const Route = createFileRoute("/api/gh/tree")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const owner = url.searchParams.get("owner");
          const repo = url.searchParams.get("repo");
          if (!owner || !repo) return jsonResponse({ error: "owner/repo مطلوبان" }, 400);

          const info = await ghJson<any>(`repos/${owner}/${repo}`);
          const branch = url.searchParams.get("branch") || info.default_branch;
          const tree = await ghJson<any>(
            `repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
          );
          const files = (tree.tree ?? [])
            .filter((n: any) => n.type === "blob" && n.size < 400_000)
            .map((n: any) => ({ path: n.path, size: n.size }));
          return jsonResponse({ branch, files, truncated: tree.truncated === true });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
