import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Github,
  Hammer,
  Loader2,
  Send,
  UploadCloud,
  FolderGit2,
  FileCode2,
  Eye,
  Plus,
  Search,
  Sparkles,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  component: Builder,
  head: () => ({
    meta: [
      { title: "FATINY BUILDER — بناء المواقع بالذكاء الاصطناعي" },
      {
        name: "description",
        content:
          "منصة مجانية تبني المواقع بالذكاء الاصطناعي، تستورد مشاريعك من GitHub، تعدلها، ثم ترفعها مرة أخرى بضغطة واحدة.",
      },
      { property: "og:title", content: "FATINY BUILDER — بناء المواقع بالذكاء الاصطناعي" },
      {
        property: "og:description",
        content: "استورد مستودعك من GitHub، عدّله بالذكاء الاصطناعي، وارفعه مرة أخرى مجاناً.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Repo = {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  default_branch: string;
  description: string | null;
};

type ProjectFile = { path: string; content: string; dirty?: boolean };

type LogEntry = { id: string; kind: "ai" | "sys" | "you"; text: string };

const TEXT_EXT =
  /\.(html?|css|scss|js|jsx|ts|tsx|json|md|txt|yml|yaml|svg|vue|py|php|xml|env|toml|astro)$/i;

export default function BuilderRoute() {
  return <Builder />;
}

function Builder() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoQuery, setRepoQuery] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [branch, setBranch] = useState<string>("");
  const [tree, setTree] = useState<{ path: string; size: number }[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [preview, setPreview] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const activeFile = files.find((f) => f.path === active) ?? null;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  function say(kind: LogEntry["kind"], text: string) {
    setLog((l) => [...l, { id: crypto.randomUUID(), kind, text }]);
  }

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const r = await fetch("/api/gh/repos");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "فشل جلب المستودعات");
      setRepos(data);
      say("sys", `تم العثور على ${data.length} مستودع في حسابك.`);
    } catch (e) {
      say("sys", `خطأ: ${(e as Error).message}`);
    } finally {
      setLoadingRepos(false);
    }
  }

  async function importRepo(r: Repo) {
    setRepo(r);
    setFiles([]);
    setActive(null);
    setBusy("import");
    say("sys", `جاري استيراد ${r.full_name} ...`);
    try {
      const res = await fetch(
        `/api/gh/tree?owner=${encodeURIComponent(r.owner)}&repo=${encodeURIComponent(r.name)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل قراءة المستودع");
      setBranch(data.branch);
      setTree(data.files);

      const wanted = (data.files as { path: string }[])
        .filter((f) => TEXT_EXT.test(f.path) && !f.path.includes("node_modules/"))
        .slice(0, 20);

      const loaded: ProjectFile[] = [];
      for (const f of wanted) {
        const fr = await fetch(
          `/api/gh/file?owner=${encodeURIComponent(r.owner)}&repo=${encodeURIComponent(
            r.name,
          )}&path=${encodeURIComponent(f.path)}&branch=${encodeURIComponent(data.branch)}`,
        );
        const fd = await fr.json();
        if (fr.ok) loaded.push({ path: f.path, content: fd.content });
      }
      setFiles(loaded);
      setActive(loaded.find((f) => /index\.html?$/i.test(f.path))?.path ?? loaded[0]?.path ?? null);
      say(
        "sys",
        `تم استيراد المشروع بالكامل (${data.files.length} ملف، تم تحميل ${loaded.length} ملف نصي للتعديل).`,
      );
    } catch (e) {
      say("sys", `خطأ: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runAI() {
    const p = prompt.trim();
    if (!p || busy) return;
    setPrompt("");
    say("you", p);
    setBusy("ai");
    try {
      const r = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: p,
          repo: repo?.full_name,
          files: files.map((f) => ({ path: f.path, content: f.content })),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "فشل التنفيذ");
      const changed: ProjectFile[] = data.files ?? [];
      setFiles((prev) => {
        const map = new Map(prev.map((f) => [f.path, f]));
        for (const c of changed) map.set(c.path, { ...c, dirty: true });
        return Array.from(map.values());
      });
      if (changed[0]) setActive(changed[0].path);
      say("ai", `${data.message}\n\nالملفات المعدلة: ${changed.map((c) => c.path).join("، ") || "لا شيء"}`);
    } catch (e) {
      say("ai", `تعذر التنفيذ: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function push(createRepo: boolean) {
    const dirty = files.filter((f) => f.dirty);
    if (dirty.length === 0) {
      say("sys", "لا توجد تعديلات للرفع.");
      return;
    }
    setBusy("push");
    try {
      const r = await fetch("/api/gh/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: repo?.owner,
          repo: repo?.name,
          branch: branch || repo?.default_branch,
          message: "تحديث بواسطة FATINY BUILDER",
          files: dirty.map((f) => ({ path: f.path, content: f.content })),
          createRepo,
          newRepoName,
          isPrivate: false,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "فشل الرفع");
      setFiles((prev) => prev.map((f) => ({ ...f, dirty: false })));
      if (createRepo) {
        setRepo({
          full_name: `${data.owner}/${data.repo}`,
          name: data.repo,
          owner: data.owner,
          private: false,
          default_branch: data.branch,
          description: null,
        });
        setBranch(data.branch);
        setNewRepoName("");
      }
      say("sys", `تم الرفع إلى GitHub ✓ — ${data.repoUrl}`);
    } catch (e) {
      say("sys", `خطأ في الرفع: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const previewHtml = useMemo(() => {
    const index = files.find((f) => /index\.html?$/i.test(f.path)) ?? activeFile;
    if (!index || !/\.html?$/i.test(index.path)) return "";
    let html = index.content;
    for (const f of files) {
      if (f.path.endsWith(".css")) {
        html = html.replace(
          new RegExp(`<link[^>]*href=["'][^"']*${f.path.split("/").pop()}["'][^>]*>`, "i"),
          `<style>${f.content}</style>`,
        );
      }
      if (f.path.endsWith(".js")) {
        html = html.replace(
          new RegExp(`<script[^>]*src=["'][^"']*${f.path.split("/").pop()}["'][^>]*></script>`, "i"),
          `<script>${f.content}<\/script>`,
        );
      }
    }
    return html;
  }, [files, activeFile]);

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(repoQuery.toLowerCase()),
  );

  return (
    <div dir="rtl" className="min-h-screen bg-[#07070f] text-white">
      <div
        className="pointer-events-none fixed inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(55% 45% at 15% 5%, rgba(16,185,129,0.18), transparent), radial-gradient(50% 45% at 85% 10%, rgba(56,189,248,0.16), transparent), radial-gradient(60% 50% at 50% 100%, rgba(99,102,241,0.16), transparent)",
        }}
      />

      <header className="relative z-10 border-b border-white/5 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30">
              <Hammer className="h-5 w-5 text-black" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">FATINY BUILDER</h1>
              <p className="text-[11px] text-white/50">
                يبني المواقع • يستورد من GitHub • يعدّل • يرفع مرة أخرى — مجاني بالكامل
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPreview((v) => !v)}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Eye className="h-4 w-4" />
              <span className="mr-1 hidden sm:inline">{preview ? "الكود" : "معاينة"}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => push(false)}
              disabled={!repo || busy !== null}
              className="bg-gradient-to-br from-emerald-400 to-cyan-500 text-black hover:opacity-90"
            >
              {busy === "push" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              <span className="mr-1">رفع إلى GitHub</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1500px] gap-3 p-3 lg:grid-cols-[300px_1fr_360px]">
        {/* المستودعات والملفات */}
        <aside className="flex max-h-[calc(100vh-90px)] flex-col gap-3 overflow-hidden">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Github className="h-4 w-4" /> مستودعاتك
            </div>
            <Button
              size="sm"
              onClick={loadRepos}
              disabled={loadingRepos}
              className="w-full bg-white/10 text-white hover:bg-white/20"
            >
              {loadingRepos ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderGit2 className="h-4 w-4" />
              )}
              <span className="mr-1">تحميل المستودعات</span>
            </Button>
            {repos.length > 0 && (
              <div className="mt-2">
                <div className="relative">
                  <Search className="absolute right-2 top-2.5 h-3.5 w-3.5 text-white/40" />
                  <Input
                    value={repoQuery}
                    onChange={(e) => setRepoQuery(e.target.value)}
                    placeholder="بحث..."
                    className="h-8 border-white/10 bg-black/30 pr-7 text-xs text-white placeholder:text-white/40"
                  />
                </div>
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto pl-1">
                  {filteredRepos.map((r) => (
                    <button
                      key={r.full_name}
                      onClick={() => importRepo(r)}
                      className={`w-full truncate rounded-lg px-2 py-1.5 text-right text-xs transition hover:bg-white/10 ${
                        repo?.full_name === r.full_name ? "bg-emerald-400/15 text-emerald-200" : ""
                      }`}
                    >
                      {r.full_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4" /> مستودع جديد
            </div>
            <Input
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              placeholder="my-new-site"
              className="h-8 border-white/10 bg-black/30 text-xs text-white placeholder:text-white/40"
            />
            <Button
              size="sm"
              onClick={() => push(true)}
              disabled={!newRepoName.trim() || busy !== null}
              className="mt-2 w-full bg-white/10 text-white hover:bg-white/20"
            >
              إنشاء ورفع المشروع
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FileCode2 className="h-4 w-4" /> ملفات المشروع
              {busy === "import" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
            {files.length === 0 ? (
              <p className="text-xs text-white/40">
                استورد مستودعاً أو اطلب من الذكاء الاصطناعي بناء موقع جديد.
              </p>
            ) : (
              <div className="space-y-0.5">
                {files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => {
                      setActive(f.path);
                      setPreview(false);
                    }}
                    className={`flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-right text-[11px] transition hover:bg-white/10 ${
                      active === f.path ? "bg-white/10 text-cyan-200" : "text-white/70"
                    }`}
                  >
                    {f.dirty ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    ) : (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-transparent" />
                    )}
                    <span className="truncate">{f.path}</span>
                  </button>
                ))}
              </div>
            )}
            {tree.length > files.length && (
              <p className="mt-2 text-[10px] text-white/30">
                المستودع يحتوي {tree.length} ملف — تم تحميل الملفات النصية القابلة للتعديل.
              </p>
            )}
          </div>
        </aside>

        {/* المحرر / المعاينة */}
        <section className="flex h-[calc(100vh-90px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-white/60">
            <span className="truncate">
              {preview ? "معاينة مباشرة" : activeFile?.path ?? "لا يوجد ملف مفتوح"}
            </span>
            {repo && (
              <span className="truncate text-white/40">
                {repo.full_name} • {branch}
              </span>
            )}
          </div>
          {preview ? (
            previewHtml ? (
              <iframe
                title="preview"
                srcDoc={previewHtml}
                className="h-full w-full flex-1 bg-white"
                sandbox="allow-scripts"
              />
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-white/40">
                لا توجد صفحة HTML للمعاينة
              </div>
            )
          ) : activeFile ? (
            <textarea
              dir="ltr"
              value={activeFile.content}
              onChange={(e) =>
                setFiles((prev) =>
                  prev.map((f) =>
                    f.path === activeFile.path
                      ? { ...f, content: e.target.value, dirty: true }
                      : f,
                  ),
                )
              }
              spellCheck={false}
              className="h-full w-full flex-1 resize-none bg-transparent p-4 font-mono text-[12.5px] leading-relaxed text-emerald-100 outline-none"
            />
          ) : (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <Sparkles className="mx-auto h-10 w-10 text-emerald-300" />
                <h2 className="mt-4 text-2xl font-bold">ابنِ موقعك أو استورد مشروعك</h2>
                <p className="mt-2 max-w-md text-sm text-white/50">
                  اكتب وصف الموقع في لوحة الذكاء الاصطناعي على اليسار، أو حمّل مستودعاتك من GitHub
                  لتعديل مشروع قائم ثم إعادة رفعه.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* لوحة الذكاء الاصطناعي */}
        <aside className="flex h-[calc(100vh-90px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="border-b border-white/10 px-3 py-2 text-sm font-semibold">
            مساعد البناء
          </div>
          <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {log.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-white/40">جرّب أحد هذه الطلبات:</p>
                {[
                  "ابنِ لي موقع شركة تقنية بصفحة هبوط عصرية داكنة",
                  "أضف قسم تواصل معنا مع نموذج جميل",
                  "حوّل تصميم الموقع إلى الوضع الفاتح واجعله متجاوباً",
                  "أصلح الأخطاء وحسّن سرعة الصفحة",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-right text-xs transition hover:bg-white/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {log.map((l) => (
              <div
                key={l.id}
                className={`rounded-xl border px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  l.kind === "you"
                    ? "border-white/10 bg-gradient-to-br from-emerald-500/15 to-cyan-500/10"
                    : l.kind === "ai"
                      ? "border-white/10 bg-white/5"
                      : "border-white/5 bg-black/30 text-white/60 text-xs"
                }`}
              >
                {l.text}
              </div>
            ))}
            {busy === "ai" && (
              <div className="flex items-center gap-2 text-xs text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري البناء...
              </div>
            )}
          </div>
          <div className="border-t border-white/10 p-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  runAI();
                }
              }}
              placeholder="صف الموقع أو التعديل المطلوب..."
              className="min-h-[70px] resize-none border-white/10 bg-black/30 text-white placeholder:text-white/40"
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] text-white/30">
                {files.filter((f) => f.dirty).length > 0 ? (
                  <span className="text-amber-300">
                    {files.filter((f) => f.dirty).length} ملف بانتظار الرفع
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> متزامن
                  </span>
                )}
              </span>
              <div className="flex-1" />
              <Button
                onClick={runAI}
                disabled={busy !== null || !prompt.trim()}
                className="bg-gradient-to-br from-emerald-400 to-cyan-500 text-black hover:opacity-90"
              >
                {busy === "ai" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="mr-1">تنفيذ</span>
              </Button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
