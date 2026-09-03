import { createFileRoute } from "@tanstack/react-router";
import { ghJson, jsonResponse, errorResponse } from "@/lib/github.server";

type FileChange = { path: string; content: string };

export const Route = createFileRoute("/api/gh/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            owner?: string;
            repo?: string;
            branch?: string;
            message?: string;
            files?: FileChange[];
            createRepo?: boolean;
            newRepoName?: string;
            isPrivate?: boolean;
          };

          let owner = body.owner;
          let repo = body.repo;
          let branch = body.branch;

          if (body.createRepo) {
            const name = (body.newRepoName || "").trim();
            if (!name) return jsonResponse({ error: "اسم المستودع مطلوب" }, 400);
            const created = await ghJson<any>("user/repos", {
              method: "POST",
              body: JSON.stringify({
                name,
                private: body.isPrivate ?? false,
                auto_init: true,
                description: "تم إنشاؤه بواسطة FATINY BUILDER",
              }),
            });
            owner = created.owner?.login;
            repo = created.name;
            branch = created.default_branch || "main";
          }

          const files = body.files ?? [];
          if (!owner || !repo) return jsonResponse({ error: "المستودع غير محدد" }, 400);
          if (files.length === 0) return jsonResponse({ error: "لا توجد ملفات للرفع" }, 400);

          if (!branch) {
            const info = await ghJson<any>(`repos/${owner}/${repo}`);
            branch = info.default_branch || "main";
          }

          const targetBranch: string = branch ?? "main";
          const ref = await ghJson<any>(
            `repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
          );
          const baseCommitSha = ref.object.sha;
          const baseCommit = await ghJson<any>(
            `repos/${owner}/${repo}/git/commits/${baseCommitSha}`,
          );

          const blobs = [];
          for (const f of files) {
            const blob = await ghJson<any>(`repos/${owner}/${repo}/git/blobs`, {
              method: "POST",
              body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
            });
            blobs.push({
              path: f.path.replace(/^\/+/, ""),
              mode: "100644",
              type: "blob",
              sha: blob.sha,
            });
          }

          const tree = await ghJson<any>(`repos/${owner}/${repo}/git/trees`, {
            method: "POST",
            body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
          });

          const commit = await ghJson<any>(`repos/${owner}/${repo}/git/commits`, {
            method: "POST",
            body: JSON.stringify({
              message: body.message || "تحديث من FATINY BUILDER",
              tree: tree.sha,
              parents: [baseCommitSha],
            }),
          });

          await ghJson<any>(
            `repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
            { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) },
          );

          return jsonResponse({
            ok: true,
            owner,
            repo,
            branch: targetBranch,
            commit: commit.sha,
            url: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
            repoUrl: `https://github.com/${owner}/${repo}`,
          });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
