export class EditorialError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function requestJSON(path, { body, signal } = {}) {
  let response;
  try {
    const url = new URL("/polit-compass" + path, window.location.origin);
    url.pathname += "/";
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new EditorialError("Връзката със сървъра е прекъсната. Провери връзката и опитай отново.", 0);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new EditorialError("Редакторската услуга е недостъпна в момента.", response.status);
  }
  const result = await response.json();
  if (!response.ok) {
    const details = Array.isArray(result.issues) ? result.issues.slice(0,10).map(item => typeof item === "string" ? item : item?.message).filter(Boolean).join(" ") : "";
    const message = typeof result.error === "string" ? result.error : "Сървърът не прие операцията.";
    throw new EditorialError([message,details].filter(Boolean).join(" "), response.status);
  }
  return result;
}
