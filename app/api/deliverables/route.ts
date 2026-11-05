import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { storeDeliverablePhoto, storeDeliverableVideoMaster, storeVideoReviewCopy } from "@/lib/deliverables/storage";

/**
 * Uploads a project's deliverables (studio staff only).
 *
 * multipart/form-data:
 *   projectId   the project
 *   gallery     gallery name (created if new), default "Final selects"
 *   kind        "PHOTO" (default) or "VIDEO"
 *   files       PHOTO: one or more images
 *   master      VIDEO: the master file, released after the final balance
 *   review      VIDEO: a review copy clients can stream before paying
 *   title       VIDEO: its title
 *
 * Masters are stored privately; clients see watermarked previews until the balance is paid.
 */

const MB = 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/tiff": ".tif" };
const VIDEO_TYPES: Record<string, string> = { "video/mp4": ".mp4", "video/quicktime": ".mov" };
const MAX_PHOTO = 50 * MB;
const MAX_VIDEO = 200 * MB;
const MAX_REQUEST = 500 * MB;

const titleFrom = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Untitled";

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST) {
      return NextResponse.json({ error: "Upload too large. Send fewer files at a time." }, { status: 413 });
    }
    const session = await getCurrentUser();
    if (!session || !STAFF_ROLES.has(session.role)) {
      return NextResponse.json({ error: session ? "Not permitted" : "Sign in required" }, { status: session ? 403 : 401 });
    }

    const form = await request.formData();
    const projectId = String(form.get("projectId") ?? "");
    const project = await db.project.findUnique({ where: { id: projectId }, include: { tenant: { select: { id: true, name: true, slug: true } } } });
    if (!project || (session.role !== "SUPER_ADMIN" && session.tenantId !== project.tenantId)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const galleryName = String(form.get("gallery") ?? "").trim().slice(0, 80) || "Final selects";
    const kind = form.get("kind") === "VIDEO" ? "VIDEO" : "PHOTO";
    const gallery =
      (await db.clientDeliverable.findFirst({ where: { projectId: project.id, title: galleryName } })) ??
      (await db.clientDeliverable.create({
        data: { projectId: project.id, title: galleryName, discipline: kind === "VIDEO" ? "VIDEOGRAPHY" : "PHOTOGRAPHY" },
      }));

    const created: string[] = [];
    const skipped: string[] = [];

    if (kind === "PHOTO") {
      const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length === 0) return NextResponse.json({ error: "Choose at least one photo." }, { status: 400 });
      for (const file of files) {
        const ext = PHOTO_TYPES[file.type];
        if (!ext || file.size > MAX_PHOTO) {
          skipped.push(`${file.name} (${!ext ? "not a JPG, PNG, WebP or TIFF" : "over 50 MB"})`);
          continue;
        }
        try {
          const stored = await storeDeliverablePhoto({
            tenantId: project.tenantId,
            projectId: project.id,
            data: Buffer.from(await file.arrayBuffer()),
            ext,
            watermark: project.tenant.name,
          });
          const item = await db.deliverableItem.create({
            data: { deliverableId: gallery.id, itemType: "PHOTO", title: titleFrom(file.name), thumbnailUrl: stored.previewUrl, ...stored },
          });
          created.push(item.id);
        } catch {
          skipped.push(`${file.name} (couldn't be read as an image)`);
        }
      }
    } else {
      const master = form.get("master");
      const review = form.get("review");
      if (!(master instanceof File) || master.size === 0 || !(review instanceof File) || review.size === 0) {
        return NextResponse.json({ error: "Add both the master file and a review copy." }, { status: 400 });
      }
      const masterExt = VIDEO_TYPES[master.type];
      const reviewExt = VIDEO_TYPES[review.type];
      if (!masterExt || !reviewExt) return NextResponse.json({ error: "Videos must be MP4 or MOV." }, { status: 400 });
      if (master.size > MAX_VIDEO || review.size > MAX_VIDEO) {
        return NextResponse.json({ error: "Each video must be 200 MB or less." }, { status: 413 });
      }
      const stored = await storeDeliverableVideoMaster({
        tenantId: project.tenantId,
        projectId: project.id,
        data: Buffer.from(await master.arrayBuffer()),
        ext: masterExt,
      });
      const previewUrl = await storeVideoReviewCopy(Buffer.from(await review.arrayBuffer()), reviewExt);
      const item = await db.deliverableItem.create({
        data: {
          deliverableId: gallery.id,
          itemType: "VIDEO",
          title: String(form.get("title") ?? "").trim().slice(0, 120) || titleFrom(master.name),
          previewUrl,
          downloadUrl: stored.downloadUrl,
          fileSize: stored.fileSize,
        },
      });
      created.push(item.id);
    }

    for (const path of [`/${project.tenant.slug}/admin/projects/${project.id}`, `/${project.tenant.slug}/vault/${project.id}`]) {
      try {
        revalidatePath(path);
      } catch {
        // non-request context
      }
    }
    return NextResponse.json({ created: created.length, skipped });
  } catch (err: any) {
    console.error("Deliverable upload failed:", err?.message || err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
