import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Sparkles,
  Send,
  Paperclip,
  ImageIcon,
  X,
  Loader2,
  FileText,
  Film,
  Link as LinkIcon,
  Bot,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/")({
  component: Index,
});

type Attachment = {
  name: string;
  type: string;
  dataUrl: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  image?: string; // generated image url
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function AttachmentChip({ att, onRemove }: { att: Attachment; onRemove?: () => void }) {
  const isImg = att.type.startsWith("image/");
  const isPdf = att.type === "application/pdf";
  const isVideo = att.type.startsWith("video/");
  return (
    <div className="relative flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 backdrop-blur">
      {isImg ? (
        <img src={att.dataUrl} className="h-8 w-8 rounded object-cover" alt="" />
      ) : isPdf ? (
        <FileText className="h-5 w-5 text-rose-400" />
      ) : isVideo ? (
        <Film className="h-5 w-5 text-violet-400" />
      ) : (
        <Paperclip className="h-5 w-5" />
      )}
      <span className="max-w-[140px] truncate">{att.name}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 rounded-full p-0.5 hover:bg-white/10"
          aria-label="remove"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function Index() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 20 * 1024 * 1024) continue;
      arr.push({ name: f.name, type: f.type || "application/octet-stream", dataUrl: await fileToDataUrl(f) });
    }
    setPendingAttachments((p) => [...p, ...arr]);
  }

  async function generateImage(prompt: string) {
    const id = crypto.randomUUID();
    setMessages((m) => [...m, { id, role: "assistant", content: "جاري إنشاء الصورة..." }]);
    try {
      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "فشل");
      setMessages((m) =>
        m.map((msg) =>
          msg.id === id ? { ...msg, content: "تم إنشاء الصورة:", image: data.url } : msg,
        ),
      );
    } catch (e) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === id
            ? { ...msg, content: `تعذر إنشاء الصورة: ${(e as Error).message}` }
            : msg,
        ),
      );
    }
  }

  async function send() {
    const text = input.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: pendingAttachments,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPendingAttachments([]);

    if (imageMode) {
      setImageMode(false);
      await generateImage(text);
      return;
    }

    setIsStreaming(true);
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments,
          })),
        }),
      });

      if (!resp.ok || !resp.body) {
        const t = await resp.text();
        throw new Error(t || "فشل الاتصال");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(j);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              flushSync(() => {
                setMessages((m) =>
                  m.map((msg) => (msg.id === assistantId ? { ...msg, content: acc } : msg)),
                );
              });
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `حدث خطأ: ${(e as Error).message}` }
            : msg,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a14] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-40" style={{
        backgroundImage:
          "radial-gradient(60% 50% at 20% 10%, rgba(168,85,247,0.25), transparent), radial-gradient(50% 50% at 80% 20%, rgba(56,189,248,0.18), transparent), radial-gradient(60% 60% at 50% 100%, rgba(244,114,182,0.18), transparent)",
      }} />

      <header className="relative z-10 border-b border-white/5 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-400 shadow-lg shadow-fuchsia-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">FATINY-AI</h1>
              <p className="text-[11px] text-white/50">ذكاء اصطناعي متعدد الوسائط</p>
            </div>
          </div>
          <div className="hidden gap-1 text-[11px] text-white/60 md:flex">
            <span className="rounded-full border border-white/10 px-2 py-1">صور</span>
            <span className="rounded-full border border-white/10 px-2 py-1">PDF</span>
            <span className="rounded-full border border-white/10 px-2 py-1">فيديو</span>
            <span className="rounded-full border border-white/10 px-2 py-1">روابط</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-4xl flex-col px-4" style={{ minHeight: "calc(100vh - 64px)" }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-6">
          {messages.length === 0 ? (
            <div className="mt-12 text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-cyan-400 shadow-2xl shadow-fuchsia-500/40">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h2 className="mt-6 text-3xl font-bold">مرحباً بك في FATINY-AI</h2>
              <p className="mt-2 text-white/60">اسأل أي شيء، أرفق صور وملفات PDF وفيديوهات وروابط، أو أنشئ صوراً جديدة.</p>
              <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
                {[
                  { icon: ImageIcon, t: "إنشاء صورة فنية لمدينة المستقبل" },
                  { icon: FileText, t: "تلخيص ملف PDF لي" },
                  { icon: LinkIcon, t: "اشرح محتوى هذا الرابط" },
                  { icon: Film, t: "حلل لقطات هذا الفيديو" },
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s.t)}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-right text-sm transition hover:bg-white/10"
                  >
                    <s.icon className="h-4 w-4 text-fuchsia-300" />
                    <span>{s.t}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m) => (
                <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      m.role === "user"
                        ? "bg-white/10"
                        : "bg-gradient-to-br from-fuchsia-500 to-cyan-400"
                    }`}
                  >
                    {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-fuchsia-600/30 to-cyan-500/20 border border-white/10"
                        : "bg-white/5 border border-white/10"
                    }`}
                  >
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.attachments.map((a, i) => (
                          <AttachmentChip key={i} att={a} />
                        ))}
                      </div>
                    )}
                    {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                    {m.image && (
                      <img
                        src={m.image}
                        alt="generated"
                        className="mt-2 max-h-96 rounded-xl border border-white/10"
                      />
                    )}
                    {m.role === "assistant" && !m.content && !m.image && (
                      <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 pb-4 pt-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl shadow-2xl">
            {pendingAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingAttachments.map((a, i) => (
                  <AttachmentChip
                    key={i}
                    att={a}
                    onRemove={() => setPendingAttachments((p) => p.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
            {imageMode && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-200">
                <ImageIcon className="h-3.5 w-3.5" />
                <span>وضع إنشاء الصور — اكتب وصف الصورة</span>
                <button onClick={() => setImageMode(false)} className="mr-auto rounded p-0.5 hover:bg-white/10">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={imageMode ? "صف الصورة التي تريد إنشاءها..." : "اكتب رسالتك، أو ألصق رابطاً، أو أرفق ملفاً..."}
              className="min-h-[56px] resize-none border-0 bg-transparent text-white placeholder:text-white/40 focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf,video/*"
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileRef.current?.click()}
                className="text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Paperclip className="h-4 w-4" />
                <span className="mr-1 hidden sm:inline">إرفاق</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setImageMode((v) => !v)}
                className={`hover:bg-white/10 hover:text-white ${
                  imageMode ? "text-fuchsia-300" : "text-white/70"
                }`}
              >
                <ImageIcon className="h-4 w-4" />
                <span className="mr-1 hidden sm:inline">إنشاء صورة</span>
              </Button>
              <div className="flex-1" />
              <Button
                onClick={send}
                disabled={isStreaming || (!input.trim() && pendingAttachments.length === 0)}
                className="bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-white hover:opacity-90"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="mr-1">إرسال</span>
              </Button>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-white/40">
            FATINY-AI قد يخطئ. تحقق من المعلومات المهمة.
          </p>
        </div>
      </main>
    </div>
  );
}
