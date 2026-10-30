import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";
import { createZipArchive, ZipFileEntry } from "@/lib/zip";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get("projectId");
    const type = searchParams.get("type"); // "photo_zip" | "video_master" | "photo_master"
    const assetId = searchParams.get("assetId");

    if (!projectId || !type) {
      return NextResponse.json(
        { error: "Missing required query parameters: projectId and type" },
        { status: 400 }
      );
    }

    // 1. Fetch Project with deliverables and items
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        deliverables: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 2. CANONICAL PAYWALL GATE
    if (!project.isFinalBalancePaid) {
      return NextResponse.json(
        {
          error: "Payment Required: Final balance milestone must be settled before accessing master files.",
          projectId: project.id,
          isFinalBalancePaid: false,
        },
        { status: 403 }
      );
    }

    // Flatten all deliverable items
    const allItems = project.deliverables.flatMap((d) => d.items);

    // 3. Handle type: "photo_zip"
    if (type === "photo_zip") {
      const photoItems = allItems.filter((i) => i.itemType === "PHOTO");
      if (photoItems.length === 0) {
        return NextResponse.json({ error: "No photo assets found in project deliverables" }, { status: 404 });
      }

      const zipEntries: ZipFileEntry[] = [];

      for (let idx = 0; idx < photoItems.length; idx++) {
        const item = photoItems[idx]!;
        const relativePath = item.downloadUrl.startsWith("/") ? item.downloadUrl.slice(1) : item.downloadUrl;
        const filePath = path.join(process.cwd(), "public", relativePath);

        try {
          const fileData = await fs.readFile(filePath);
          const ext = path.extname(filePath) || ".jpg";
          const safeTitle = item.title.replace(/[^a-zA-Z0-9_-]/g, "_");
          const filename = `${String(idx + 1).padStart(2, "0")}_${safeTitle}${ext}`;
          zipEntries.push({ filename, data: fileData });
        } catch {
          const ext = path.extname(filePath) || ".jpg";
          const safeTitle = item.title.replace(/[^a-zA-Z0-9_-]/g, "_");
          zipEntries.push({
            filename: `${String(idx + 1).padStart(2, "0")}_${safeTitle}${ext}`,
            data: Buffer.from(`Master High-Resolution Asset: ${item.title}`),
          });
        }
      }

      const zipBuffer = createZipArchive(zipEntries);
      const safeProjectNumber = project.projectNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
      const zipFilename = `${safeProjectNumber}_Master_Deliverables.zip`;

      return new Response(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zipFilename}"`,
          "Content-Length": zipBuffer.length.toString(),
          "Cache-Control": "private, no-cache, no-store",
        },
      });
    }

    // 4. Handle type: "video_master"
    if (type === "video_master") {
      const videoItem = assetId
        ? allItems.find((i) => i.id === assetId && i.itemType === "VIDEO")
        : allItems.find((i) => i.itemType === "VIDEO");

      if (!videoItem) {
        return NextResponse.json({ error: "Video master deliverable not found" }, { status: 404 });
      }

      const relativePath = videoItem.downloadUrl.startsWith("/") ? videoItem.downloadUrl.slice(1) : videoItem.downloadUrl;
      const filePath = path.join(process.cwd(), "public", relativePath);

      let fileData: Buffer;
      try {
        fileData = await fs.readFile(filePath);
      } catch {
        fileData = Buffer.from(`Master 4K Video Asset: ${videoItem.title}`);
      }

      const ext = path.extname(filePath) || ".mov";
      const mimeType = ext === ".mp4" ? "video/mp4" : "video/quicktime";
      const safeFilename = `${videoItem.title.replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`;

      return new Response(new Uint8Array(fileData), {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
          "Content-Length": fileData.length.toString(),
          "Cache-Control": "private, no-cache, no-store",
        },
      });
    }

    // 5. Handle type: "photo_master" (single photo master)
    if (type === "photo_master") {
      if (!assetId) {
        return NextResponse.json({ error: "Missing required assetId for photo_master" }, { status: 400 });
      }

      const photoItem = allItems.find((i) => i.id === assetId && i.itemType === "PHOTO");
      if (!photoItem) {
        return NextResponse.json({ error: "Photo deliverable asset not found" }, { status: 404 });
      }

      const relativePath = photoItem.downloadUrl.startsWith("/") ? photoItem.downloadUrl.slice(1) : photoItem.downloadUrl;
      const filePath = path.join(process.cwd(), "public", relativePath);

      let fileData: Buffer;
      try {
        fileData = await fs.readFile(filePath);
      } catch {
        fileData = Buffer.from(`Master Photo Asset: ${photoItem.title}`);
      }

      const ext = path.extname(filePath) || ".jpg";
      const safeFilename = `${photoItem.title.replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`;

      return new Response(new Uint8Array(fileData), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
          "Content-Length": fileData.length.toString(),
          "Cache-Control": "private, no-cache, no-store",
        },
      });
    }

    return NextResponse.json({ error: `Unsupported download type: ${type}` }, { status: 400 });
  } catch (error: any) {
    console.error("Secure download error:", error);
    return NextResponse.json({ error: "Failed to process master download" }, { status: 500 });
  }
}
