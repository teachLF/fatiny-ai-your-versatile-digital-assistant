import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt: string };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              prompt,
            }),
          },
        );

        if (!upstream.ok) {
          const text = await upstream.text();
          return new Response(
            JSON.stringify({ error: text || "فشل إنشاء الصورة" }),
            { status: upstream.status, headers: { "Content-Type": "application/json" } },
          );
        }
        const data = await upstream.json();
        // OpenAI-compatible: data.data[0].b64_json or .url
        const item = data?.data?.[0];
        const url =
          item?.url ||
          (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
        if (!url)
          return new Response(JSON.stringify({ error: "لا توجد صورة" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        return new Response(JSON.stringify({ url }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
