const GATEWAY_URL = "https://connector-gateway.lovable.dev/github";

export async function gh(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const ghKey = process.env["GITHUB_API_KEY"];
  if (!lovableKey || !ghKey) {
    throw new Error("GitHub غير مربوط بعد (مفاتيح مفقودة)");
  }
  return fetch(`${GATEWAY_URL}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": ghKey,
    },
  });
}

export async function ghJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await gh(path, init);
  if (!res.ok) {
    const body = await res.text();
    console.error(`GitHub request failed [${res.status}]: ${body}`);
    throw new Error(`GitHub [${res.status}]: ${body}`);
  }
  return (await res.json()) as T;
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : "خطأ غير معروف";
  return jsonResponse({ error: message }, status);
}
