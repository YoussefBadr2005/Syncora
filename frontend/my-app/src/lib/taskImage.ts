import api from "@/lib/api";

// The thumbnail (resized bucket) is produced ASYNCHRONOUSLY by the ImageResize
// Lambda, so right after upload it does not exist yet — and SVG/PDF are never
// resized. The ORIGINAL is available the instant the S3 PUT completes. So we
// fetch the original for an immediate, reliable preview, and (best-effort) the
// thumbnail to upgrade once it exists.
export async function fetchTaskImageUrls(
  taskId: string
): Promise<{ original: string | null; thumbnail: string | null }> {
  const [original, thumbnail] = await Promise.all([
    api
      .get(`/tasks/${taskId}/image-url`, { params: { variant: "original" } })
      .then((r) => (r.data?.url as string) ?? null)
      .catch(() => null),
    api
      .get(`/tasks/${taskId}/image-url`)
      .then((r) => (r.data?.url as string) ?? null)
      .catch(() => null),
  ]);
  return { original, thumbnail };
}
