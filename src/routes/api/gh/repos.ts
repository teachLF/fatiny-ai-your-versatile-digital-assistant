import { createFileRoute } from "@tanstack/react-router";
import { ghJson, jsonResponse, errorResponse } from "@/lib/github.server";

export const Route = createFileRoute("/api/gh/repos")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const repos = await ghJson<any[]>(
            "user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
          );
          return jsonResponse(
            repos.map((r) => ({
              full_name: r.full_name,
              name: r.name,
              owner: r.owner?.login,
              private: r.private,
              default_branch: r.default_branch,
              description: r.description,
              updated_at: r.updated_at,
            })),
          );
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
