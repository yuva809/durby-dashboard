// fetch() has no equivalent of XHR's `upload.onprogress` — there is no
// browser-standard way to observe request-body upload progress via fetch.
// This is the one place in the app that intentionally bypasses `apiClient`
// (fetch-based) and uses XHR instead, specifically to get real 0-100%
// upload-transfer progress for large file uploads (Data Center CSV import).
// Everything else in the app keeps using apiClient/fetch as-is.

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const clerk = (window as unknown as {
      Clerk?: { session?: { getToken: () => Promise<string | null> } };
    }).Clerk;
    return (await clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function uploadFileWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const token = await getAuthToken();
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}${path}`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as T);
          } catch {
            reject(new Error("Failed to parse server response"));
          }
        } else {
          let message = xhr.statusText || `Upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText) as { message?: string };
            if (body.message) message = body.message;
          } catch {
            // response body wasn't JSON — fall back to statusText
          }
          reject(new Error(message));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new Error("Upload cancelled"));

      xhr.send(formData);
    })();
  });
}
