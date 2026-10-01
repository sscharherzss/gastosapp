export function createMisFinanzasApi(baseUrl, fetchImpl = fetch) {
  const base = baseUrl.replace(/\/$/, "");
  async function request(path, options = {}) {
    const response = await fetchImpl(`${base}${path}`, { credentials: "include", ...options, headers: { accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `La API respondió ${response.status}.`);
    return payload.result ?? payload;
  }
  return {
    health: () => request("/v1/health"),
    invoke: (command, args, profile = "personal") => request(`/v1/commands/${encodeURIComponent(command)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ args, profile }) }),
    uploadReceipt: (movementId, file) => request(`/v1/movements/${encodeURIComponent(movementId)}/receipt`, { method: "POST", headers: { "content-type": file.type, "x-file-name": file.name }, body: file })
  };
}
