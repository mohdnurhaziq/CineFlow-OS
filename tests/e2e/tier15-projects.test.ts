/**
 * Tier 15: proposals created by the studio, and running the project they become.
 * - Owner creates a proposal (new client created, numbered, add-ons offered); crew can't.
 * - The client signs it: a project and the retainer invoice appear.
 * - Stage changes, call sheets, gear reservations.
 * - Deliverables: masters stored privately, watermarked previews public, download paywalled.
 */
import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import {
  cancelEquipmentReservation,
  createCallSheet,
  createProposal,
  deleteCallSheet,
  deleteDeliverableItem,
  updateProjectStatus,
} from "@/lib/actions/admin-projects";
import { acceptProposal } from "@/lib/actions/proposals";
import { createEquipmentReservation } from "@/lib/actions/gear";
import { POST as uploadDeliverables } from "@/app/api/deliverables/route";
import { GET as downloadHandler } from "@/app/api/download/route";
import { masterFilePath } from "@/lib/deliverables/storage";
import { DEFAULT_CONTRACT_TERMS } from "@/lib/projects/constants";
import path from "node:path";

export async function runTier15ProjectTests(harness: TestHarness) {
  harness.setSuite("Tier 15", "Proposals, Projects & Deliverables");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!ownerRow) throw new Error("Seed Lumina owner is required");
  const as = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    tenantSlug: "lumina-cine",
  });
  const owner = as(ownerRow);
  const run = Date.now().toString(36);
  const crew = as(await db.user.create({ data: { tenantId: lumina.id, email: `t15-crew-${run}@example.test`, name: "T15 Crew", role: "CREW" } }));
  const clientEmail = `t15-client-${run}@example.test`;
  const createdFiles: string[] = [];

  harness.registerTeardown(async () => {
    for (const f of createdFiles) await fs.unlink(f).catch(() => null);
    const projects = await db.project.findMany({ where: { client: { email: clientEmail } }, select: { id: true } });
    await db.milestoneInvoice.deleteMany({ where: { client: { email: clientEmail } } });
    await db.project.deleteMany({ where: { id: { in: projects.map((p) => p.id) } } });
    await db.proposal.deleteMany({ where: { client: { email: clientEmail } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t15-" } } });
  });

  const template = await db.proposalAddOnTemplate.findFirst({ where: { tenantId: lumina.id, isActive: true } });
  const input = {
    tenantId: lumina.id,
    tenantSlug: "lumina-cine",
    newClient: { name: "Proposal Client", email: clientEmail, phone: "0123456789" },
    title: "Autumn lookbook",
    category: "commercial",
    discipline: "PHOTOGRAPHY" as const,
    basePrice: 2000,
    depositPercentage: 40,
    contractTerms: DEFAULT_CONTRACT_TERMS,
    addOnTemplateIds: template ? [template.id] : [],
    notifyClient: false,
  };

  let proposalId = "";
  await harness.test("T15-PROP-01: the owner creates a numbered proposal for a new client; crew can't", async () => {
    const byCrew: any = await withSession(crew, () => createProposal(input));
    harness.assertEqual(byCrew.success, false, "Crew can't send proposals");
    const res: any = await withSession(owner, () => createProposal(input));
    harness.assert(res.success === true, "Owner creates it", JSON.stringify(res));
    proposalId = res.proposalId;
    harness.assert(/^PR-\d{4}-\d{3,}$/.test(res.proposalNumber), `Numbered (${res.proposalNumber})`);
    harness.assertEqual(res.shareUrl, `/lumina-cine/proposals/${res.proposalId}`, "Share link to the signing page");
    const p = await db.proposal.findUnique({ where: { id: res.proposalId }, include: { addOns: true, client: true } });
    harness.assertEqual(p?.status, "SENT", "Sent to the client");
    harness.assertEqual(p?.client.email, clientEmail, "New client account created");
    harness.assertEqual(p?.addOns.length, template ? 1 : 0, "Chosen add-ons offered");
    harness.assertEqual(p?.depositPercentage, 40, "Deposit percentage kept");
  });

  let projectId = "";
  await harness.test("T15-PROP-02: when the client signs, the project and its retainer invoice appear", async () => {
    const res: any = await acceptProposal({
      proposalId,
      tenantSlug: "lumina-cine",
      signatureDataUrl: `data:image/png;base64,${"A".repeat(80)}`,
      signerName: "Proposal Client",
      selectedAddOnIds: [],
      consentAccepted: true,
    });
    harness.assert(res.success === true, "Signed", JSON.stringify(res));
    projectId = res.projectId;
    const project = await db.project.findUnique({ where: { id: projectId } });
    harness.assertEqual(project?.budget, 2000, "Budget = base price with no extras");
    const retainer = await db.milestoneInvoice.findFirst({ where: { projectId, milestoneType: "RETAINER_50" } });
    harness.assertEqual(retainer?.amount, 800, "Retainer = 40% deposit");
  });

  await harness.test("T15-PROJ-01: stage changes and call sheets", async () => {
    const stage: any = await withSession(crew, () => updateProjectStatus({ tenantId: lumina.id, projectId, status: "PRODUCTION" }));
    harness.assert(stage.success === true, "Crew moves the stage");
    harness.assertEqual((await db.project.findUnique({ where: { id: projectId } }))?.status, "PRODUCTION", "Stage saved");

    const sheet: any = await withSession(crew, () =>
      createCallSheet({
        tenantId: lumina.id,
        projectId,
        title: "Day 1: Studio",
        shootDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        generalCallTime: "07:00 AM",
        locationName: "Main studio",
        locationAddress: "12 Jalan Studio, Kuala Lumpur",
        crew: [{ name: "Aina", role: "Photographer", callTime: "07:00 AM", phone: "" }],
      })
    );
    harness.assert(sheet.success === true, "Call sheet created", JSON.stringify(sheet));
    const stored = await db.callSheet.findUnique({ where: { id: sheet.callSheetId } });
    harness.assertEqual(JSON.parse(stored!.crewJson!)[0].name, "Aina", "Crew list stored");
    const outsider = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: { not: lumina.id } } });
    const cross: any = await withSession({ ...as(outsider!), tenantSlug: "apex-media" }, () => deleteCallSheet({ tenantId: outsider!.tenantId!, callSheetId: sheet.callSheetId }));
    harness.assertEqual(cross.success, false, "Another studio can't delete it");
    const del: any = await withSession(crew, () => deleteCallSheet({ tenantId: lumina.id, callSheetId: sheet.callSheetId }));
    harness.assert(del.success === true, "Deleted by its studio");
  });

  await harness.test("T15-GEAR-01: gear is reserved for a project and can be released before check-out", async () => {
    const item = await db.inventoryItem.create({
      data: { tenantId: lumina.id, name: "T15 Light", sku: `T15-${run}`, category: "Lighting", discipline: "UNIVERSAL", status: "AVAILABLE" },
    });
    try {
      const res: any = await withSession(crew, () =>
        createEquipmentReservation({
          tenantId: lumina.id,
          tenantSlug: "lumina-cine",
          projectId,
          itemId: item.id,
          startDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
          endDate: new Date(Date.now() + 11 * 86_400_000).toISOString(),
        })
      );
      harness.assert(res.success === true, "Reserved", JSON.stringify(res));
      const released: any = await withSession(crew, () => cancelEquipmentReservation({ tenantId: lumina.id, reservationId: res.reservation.id }));
      harness.assert(released.success === true, "Released", JSON.stringify(released));
      harness.assertEqual(await db.equipmentReservation.count({ where: { itemId: item.id } }), 0, "Reservation gone");
    } finally {
      await db.equipmentReservation.deleteMany({ where: { itemId: item.id } });
      await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => null);
    }
  });

  await harness.test("T15-FILES-01: photos upload as private masters with public watermarked previews; downloads wait for payment", async () => {
    const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("gallery", "Final selects");
    form.append("files", new File([new Uint8Array(png)], "hero_shot.png", { type: "image/png" }));
    form.append("files", new File(["not an image"], "notes.png", { type: "image/png" }));
    const send = (user: any) =>
      withSession(user, () => uploadDeliverables(new NextRequest("http://localhost:3000/api/deliverables", { method: "POST", body: form })));

    const anon = await send(null);
    harness.assertEqual(anon.status, 401, "Anonymous upload refused");
    const res = await send(crew);
    const body = await res.json();
    harness.assertEqual(res.status, 200, "Uploaded");
    harness.assertEqual(body.created, 1, "The real image was added");
    harness.assertEqual(body.skipped.length, 1, "The fake image was skipped");

    const item = await db.deliverableItem.findFirst({ where: { deliverable: { projectId } } });
    harness.assert(!!item?.downloadUrl.startsWith("private:"), "Master stored privately");
    harness.assert(!!item?.previewUrl.startsWith("/uploads/deliverables/previews/"), "Preview served publicly");
    const masterPath = masterFilePath(item!.downloadUrl);
    const previewPath = path.join(process.cwd(), "public", item!.previewUrl);
    createdFiles.push(masterPath, previewPath);
    harness.assert(!masterPath.includes(`${path.sep}public${path.sep}`), "Master is outside /public");
    const preview = await sharp(previewPath).metadata();
    harness.assert((preview.width ?? 0) <= 1600, `Preview downsized (${preview.width}px wide)`);
    harness.assertEqual(item?.resolution, "2400 × 1600", "Original resolution recorded");

    const locked = await downloadHandler(new NextRequest(`http://localhost:3000/api/download?projectId=${projectId}&type=photo_master&assetId=${item!.id}`));
    harness.assertEqual(locked.status, 403, "Master locked until the balance is paid");
    await db.project.update({ where: { id: projectId }, data: { isFinalBalancePaid: true } });
    const open = await downloadHandler(new NextRequest(`http://localhost:3000/api/download?projectId=${projectId}&type=photo_master&assetId=${item!.id}`));
    harness.assertEqual(open.status, 200, "Master downloads once paid");
    harness.assertEqual(Buffer.from(await open.arrayBuffer()).length, png.length, "The original file, full size");

    const del: any = await withSession(crew, () => deleteDeliverableItem({ tenantId: lumina.id, itemId: item!.id }));
    harness.assert(del.success === true, "File removed");
    harness.assert(!(await fs.stat(masterPath).catch(() => null)), "Master file deleted from storage");
  });
}
