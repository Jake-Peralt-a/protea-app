import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

// Identity documents are served only to authenticated administrators (FR-13).
// The route performs its own authorization — it never relies on the proxy.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return new Response("Not found", { status: 404 });

  let object;
  try {
    object = await getStorage().get(document.storageKey);
  } catch {
    return new Response("Document unavailable", { status: 404 });
  }

  return new Response(new Uint8Array(object.bytes), {
    status: 200,
    headers: {
      "Content-Type": object.contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.originalFilename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
