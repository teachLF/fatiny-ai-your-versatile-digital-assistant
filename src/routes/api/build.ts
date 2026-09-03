import { createFileRoute } from "@tanstack/react-router";

type ProjectFile = { path: string; content: string };

const SYSTEM = `أنت FATINY BUILDER، مهندس ويب خبير يبني ويعدّل مواقع كاملة.
القواعد:
- أعد النتيجة بصيغة JSON فقط بدون أي شرح خارج JSON وبدون علامات كود.
- الصيغة: {"message":"شرح قصير بالعربية","files":[{"path":"index.html","content":"..."}]}
- أعد فقط الملفات التي أنشأتها أو عدّلتها، بمحتواها الكامل النهائي (وليس اقتباسات جزئية).
- عند بناء موقع جديد من الصفر: استخدم HTML/CSS/JS ثابت وجميل (يمكنك استخدام Tailwind عبر CDN)، تصميم عصري متجاوب، واجعل الصفحة الرئيسية index.html.
- حافظ على أسلوب وبنية المشروع الحالي عند التعديل.`;

function extractJson(text: string): any {
  const cleaned = text.replace(/^```(?:json)?/gm, "").replace(/```$/gm, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("تعذر قراءة رد النموذج");
  }
}

export const Route = createFileRoute("/api/build")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { prompt, files, repo } = (await request.json()) as {
            prompt: string;
            files?: ProjectFile[];
            repo?: string;
          };
          const key = process.env["LOVABLE_API_KEY"];
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const context = (files ?? [])
            .slice(0, 25)
            .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 12000)}`)
            .join("\n\n");

          const userContent = context
            ? `المستودع: ${repo ?? "غير محدد"}\n\nملفات المشروع الحالية:\n${context}\n\nالمطلوب:\n${prompt}`
            : `المطلوب بناء مشروع جديد:\n${prompt}`;

          const upstream = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: SYSTEM },
                  { role: "user", content: userContent },
                ],
              }),
            },
          );

          if (!upstream.ok) {
            const text = await upstream.text();
            if (upstream.status === 429)
              return new Response(
                JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً." }),
                { status: 429, headers: { "Content-Type": "application/json" } },
              );
            if (upstream.status === 402)
              return new Response(
                JSON.stringify({ error: "نفدت الأرصدة. يرجى إضافة رصيد." }),
                { status: 402, headers: { "Content-Type": "application/json" } },
              );
            console.error(`AI gateway failed [${upstream.status}]: ${text}`);
            return new Response(JSON.stringify({ error: text }), {
              status: upstream.status,
              headers: { "Content-Type": "application/json" },
            });
          }

          const data = await upstream.json();
          const text: string = data?.choices?.[0]?.message?.content ?? "";
          const parsed = extractJson(text);

          return new Response(
            JSON.stringify({
              message: parsed.message ?? "تم التنفيذ",
              files: (parsed.files ?? []).filter(
                (f: any) => f && typeof f.path === "string" && typeof f.content === "string",
              ),
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "خطأ غير معروف" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
