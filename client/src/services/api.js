const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function api(path, options = {}) {
  const token = localStorage.getItem("token");

  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,

    headers: {
      // Only send JSON Content-Type for normal JSON requests.
      // For FormData, the browser automatically sets the correct
      // multipart/form-data boundary.
      ...(isFormData
        ? {}
        : {
            "Content-Type": "application/json"
          }),

      ...(options.headers || {}),

      ...(token
        ? {
            Authorization: `Bearer ${token}`
          }
        : {})
    }
  });

  const contentType = response.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data.error?.message || "Something went wrong."
    );
  }

  return data;
}

export function saveSession(session) {
  localStorage.setItem("token", session.token);

  localStorage.setItem(
    "user",
    JSON.stringify(session.user)
  );
}

export function clearSession() {
  localStorage.clear();
}