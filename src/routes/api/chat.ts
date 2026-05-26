import { createFileRoute } from "@tanstack/react-router";

type Attachment = {
  name: string;
  type: string; // mime
  dataUrl: string; // base64 data URL
};

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

function buildContent(msg: ClientMessage) {
  const parts: any[] = [];
  if (msg.content) parts.push({ type: "text", text: msg.content });
  for (const att of msg.attachments ?? []) {
    if (att.type.startsWith("image/")) {
      parts.push({ type: "image_url", image_url: { url: att.dataUrl } });
    } else {
      // PDF / video / other: include a note so the model knows it exists
      parts.push({
        type: "text",
        text: `\n[ملف مرفق: ${att.name} (${att.type})]`,
      });
    }
  }
  return parts.length === 1 && parts[0].type === "text" ? msg.content : parts;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages } = (await request.json()) as { messages: ClientMessage[] };
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const systemPrompt = `أنت FATINY-AI، مساعد ذكاء اصطناعي متطور ومتعدد الوسائط. تتحدث العربية بطلاقة وتجيب بشكل واضح ومفيد. يمكنك تحليل الصور وملفات PDF والفيديوهات والروابط التي يرسلها المستخدم. إذا طلب المستخدم إنشاء صورة، فاطلب منه استخدام زر "إنشاء صورة". أجب دائماً بالعربية ما لم يطلب المستخدم لغة أخرى.`;

          const apiMessages = [
            { role: "system", content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: buildContent(m) })),
          ];

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
                messages: apiMessages,
                stream: true,
              }),
            },
          );

          if (!upstream.ok || !upstream.body) {
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
            return new Response(text, { status: upstream.status });
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
