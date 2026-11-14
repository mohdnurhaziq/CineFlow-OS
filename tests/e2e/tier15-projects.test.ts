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
  notifyClientPhotosReady,
  updateProjectStatus,
} from "@/lib/actions/admin-projects";
import { getNotificationHistory } from "@/lib/notifications";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import {
  createShotItem,
  updateShotItem,
  deleteShotItem,
  toggleShotCompletion,
} from "@/lib/actions/logistics";
import { acceptProposalAsClient } from "./proposal-helpers";
import {
  createEquipmentReservation,
  quarantineGearItem,
  releaseGearFromMaintenance,
  logPreShootInspection,
  logPostShootInspection,
} from "@/lib/actions/gear";
import { toggleClientFavorite, submitRetouchNote } from "@/lib/actions/vault";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { promoteBookingToProjectAction } from "@/lib/actions/admin-bookings";
import { nextInvoiceNumber } from "@/lib/bookings/billing";
import { POST as uploadDeliverables } from "@/app/api/deliverables/route";
import { GET as downloadHandler } from "@/app/api/download/route";
import { masterFilePath } from "@/lib/deliverables/storage";
import { DEFAULT_CONTRACT_TERMS } from "@/lib/projects/constants";
import path from "node:path";
import { expectSuccess } from "./result-helpers";
import type { SessionUser } from "@/lib/auth/token";

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
    const byCrew = await withSession(crew, () => createProposal(input));
    harness.assertEqual(byCrew.success, false, "Crew can't send proposals");
    const res = await withSession(owner, () => createProposal(input));
    harness.assert(res.success === true, "Owner creates it", JSON.stringify(res));
    expectSuccess(res, "res");
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
    const res = await acceptProposalAsClient({
      proposalId,
      tenantSlug: "lumina-cine",
      signatureDataUrl: `data:image/png;base64,${"A".repeat(80)}`,
      signerName: "Proposal Client",
      selectedAddOnIds: [],
      consentAccepted: true,
    });
    harness.assert(res.success === true, "Signed", JSON.stringify(res));
    expectSuccess(res, "res");
    projectId = res.projectId;
    const project = await db.project.findUnique({ where: { id: projectId } });
    harness.assertEqual(project?.budget, 2000, "Budget = base price with no extras");
    const retainer = await db.milestoneInvoice.findFirst({ where: { projectId, milestoneType: "RETAINER_50" } });
    harness.assertEqual(retainer?.amount, 800, "Retainer = 40% deposit");
  });

  await harness.test("T15-PROJ-01: stage changes and call sheets", async () => {
    const stage = await withSession(crew, () => updateProjectStatus({ tenantId: lumina.id, projectId, status: "PRODUCTION" }));
    harness.assert(stage.success === true, "Crew moves the stage");
    harness.assertEqual((await db.project.findUnique({ where: { id: projectId } }))?.status, "PRODUCTION", "Stage saved");

    const sheet = await withSession(crew, () =>
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
    expectSuccess(sheet, "sheet");
    const stored = await db.callSheet.findUnique({ where: { id: sheet.callSheetId } });
    harness.assertEqual(JSON.parse(stored!.crewJson!)[0].name, "Aina", "Crew list stored");
    const outsider = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: { not: lumina.id } } });
    const cross = await withSession({ ...as(outsider!), tenantSlug: "apex-media" }, () => deleteCallSheet({ tenantId: outsider!.tenantId!, callSheetId: sheet.callSheetId }));
    harness.assertEqual(cross.success, false, "Another studio can't delete it");
    const del = await withSession(crew, () => deleteCallSheet({ tenantId: lumina.id, callSheetId: sheet.callSheetId }));
    harness.assert(del.success === true, "Deleted by its studio");
  });

  await harness.test("T15-SHOTS-01: visual shot list planning, execution, and multi-tenant isolation", async () => {
    const outsider = await db.user.findFirst({ where: { role: "STUDIO_OWNER", tenantId: { not: lumina.id } } });
    const outsiderUser = { ...as(outsider!), tenantSlug: "apex-media" };

    // 1. Cross-tenant attempt is rejected
    const crossCreate = await withSession(outsiderUser, () =>
      createShotItem({
        projectId,
        tenantSlug: "apex-media",
        sceneNumber: "1",
        shotNumber: "1",
        framing: "Wide (WS)",
        cameraLens: "24-70mm f/2.8",
        lightingSetup: "Golden Hour",
        description: "Intruder shot",
      })
    );
    harness.assertEqual(crossCreate.success, false, "Outside studio cannot create shots on Lumina project");

    // 2. Lumina crew creates Shot 1
    const s1Res = await withSession(crew, () =>
      createShotItem({
        projectId,
        tenantSlug: "lumina-cine",
        sceneNumber: "1",
        shotNumber: "1",
        framing: "Wide (WS)",
        cameraLens: "24-70mm f/2.8",
        lightingSetup: "Natural Golden Hour",
        description: "Wide establishing shot of bride entering garden",
      })
    );
    harness.assert(s1Res.success === true, "Crew creates Shot 1", JSON.stringify(s1Res));
    expectSuccess(s1Res, "s1Res");
    harness.assertEqual(s1Res.shot?.framing, "Wide (WS)", "Shot 1 framing is Wide");
    harness.assertEqual(s1Res.shot?.status, "PENDING", "Shot 1 starts as PENDING");

    // 3. Crew creates Shot 2
    const s2Res = await withSession(crew, () =>
      createShotItem({
        projectId,
        tenantSlug: "lumina-cine",
        sceneNumber: "1",
        shotNumber: "2",
        framing: "Close-Up (CU)",
        cameraLens: "85mm f/1.4 Portrait",
        lightingSetup: "Key Light + Softbox",
        description: "Close-up reaction shot on groom's smile",
      })
    );
    harness.assert(s2Res.success === true, "Crew creates Shot 2");
    expectSuccess(s2Res, "s2Res");

    // 4. Update Shot 2 specs
    const updateRes = await withSession(crew, () =>
      updateShotItem({
        shotId: s2Res.shot.id,
        tenantSlug: "lumina-cine",
        cameraLens: "50mm f/1.2 Prime",
        lightingSetup: "Softbox + Rim light",
      })
    );
    harness.assert(updateRes.success === true, "Shot 2 specs updated");
    harness.assertEqual(updateRes.shot?.cameraLens, "50mm f/1.2 Prime", "Lens updated");

    // 5. Toggle Shot status & verify progress metrics
    // Mark Shot 1 IN_PROGRESS (Rolling)
    const toggle1 = await withSession(crew, () =>
      toggleShotCompletion({
        shotId: s1Res.shot.id,
        status: "IN_PROGRESS",
        tenantSlug: "lumina-cine",
      })
    );
    harness.assert(toggle1.success === true, "Shot 1 rolled to IN_PROGRESS");
    harness.assertEqual(toggle1.inProgressShots, 1, "1 shot in progress");
    harness.assertEqual(toggle1.percentage, 0, "0% completed while in progress");

    // Mark Shot 1 COMPLETED (Done)
    const toggle2 = await withSession(crew, () =>
      toggleShotCompletion({
        shotId: s1Res.shot.id,
        status: "COMPLETED",
        tenantSlug: "lumina-cine",
      })
    );
    harness.assert(toggle2.success === true, "Shot 1 marked COMPLETED");
    harness.assertEqual(toggle2.completedShots, 1, "1 shot completed");
    harness.assertEqual(toggle2.percentage, 50, "50% progress calculated");

    // 6. Cross-tenant delete is rejected
    const crossDelete = await withSession(outsiderUser, () =>
      deleteShotItem({
        shotId: s2Res.shot.id,
        tenantSlug: "apex-media",
      })
    );
    harness.assertEqual(crossDelete.success, false, "Outside studio cannot delete Lumina shot");

    // 7. Delete Shot 2
    const delRes = await withSession(crew, () =>
      deleteShotItem({
        shotId: s2Res.shot.id,
        tenantSlug: "lumina-cine",
      })
    );
    harness.assert(delRes.success === true, "Shot 2 deleted");

    const remainingShots = await db.shotItem.findMany({ where: { projectId } });
    harness.assertEqual(remainingShots.length, 1, "Exactly 1 shot remains");
    harness.assertEqual(remainingShots[0]?.id, s1Res.shot.id, "Shot 1 is the remaining shot");

    // Clean up Shot 1
    await db.shotItem.deleteMany({ where: { projectId } });
  });

  await harness.test("T15-GEAR-01: gear is reserved for a project and can be released before check-out", async () => {
    const item = await db.inventoryItem.create({
      data: { tenantId: lumina.id, name: "T15 Light", sku: `T15-${run}`, category: "Lighting", discipline: "UNIVERSAL", status: "AVAILABLE" },
    });
    try {
      const res = await withSession(crew, () =>
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
      expectSuccess(res, "res");
      const released = await withSession(crew, () => cancelEquipmentReservation({ tenantId: lumina.id, reservationId: res.reservation.id }));
      harness.assert(released.success === true, "Released", JSON.stringify(released));
      harness.assertEqual(await db.equipmentReservation.count({ where: { itemId: item.id } }), 0, "Reservation gone");
    } finally {
      await db.equipmentReservation.deleteMany({ where: { itemId: item.id } });
      await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => null);
    }
  });

  await harness.test("T15-GEAR-02: gear maintenance quarantine, return to fleet, and pre/post inspection logs", async () => {
    const asset = await db.inventoryItem.create({
      data: {
        tenantId: lumina.id,
        name: "Cinema Prime 50mm",
        sku: `CP50-${run}`,
        category: "Lenses",
        discipline: "UNIVERSAL",
        condition: "EXCELLENT",
        status: "AVAILABLE",
      },
    });

    try {
      // 1. Quarantine asset for maintenance
      const qRes = await withSession(crew, () =>
        quarantineGearItem({
          itemId: asset.id,
          tenantId: lumina.id,
          tenantSlug: "lumina-cine",
          condition: "MAINTENANCE_NEEDED",
          reason: "Focus ring stiff",
        })
      );
      harness.assert(qRes.success === true, "Item quarantined");
      harness.assertEqual(qRes.item?.status, "MAINTENANCE", "Status is MAINTENANCE");
      harness.assertEqual(qRes.item?.condition, "MAINTENANCE_NEEDED", "Condition is MAINTENANCE_NEEDED");

      // 2. Return asset to active fleet
      const rRes = await withSession(crew, () =>
        releaseGearFromMaintenance({
          itemId: asset.id,
          tenantId: lumina.id,
          tenantSlug: "lumina-cine",
          condition: "EXCELLENT",
        })
      );
      harness.assert(rRes.success === true, "Item returned to fleet");
      harness.assertEqual(rRes.item?.status, "AVAILABLE", "Status back to AVAILABLE");
      harness.assertEqual(rRes.item?.condition, "EXCELLENT", "Condition EXCELLENT");

      // 3. Create shoot reservation starting right now
      const now = new Date();
      const resData = await db.equipmentReservation.create({
        data: {
          projectId,
          itemId: asset.id,
          startDate: new Date(now.getTime() - 3600000), // 1 hour ago (within window)
          endDate: new Date(now.getTime() + 86400000),  // tomorrow
          status: "RESERVED",
        },
      });

      // 4. Pre-shoot checkout inspection
      const preRes = await withSession(crew, () =>
        logPreShootInspection({
          tenantId: lumina.id,
          tenantSlug: "lumina-cine",
          reservationId: resData.id,
          condition: "EXCELLENT",
          notes: "Sensor clean and batteries full",
          sensorVerified: true,
          mediaFormatted: true,
          batteriesCharged: true,
        })
      );
      harness.assert(preRes.success === true, "Pre-shoot inspection completed");

      const checkedOutItem = await db.inventoryItem.findUnique({ where: { id: asset.id } });
      harness.assertEqual(checkedOutItem?.status, "ON_SHOOT", "Asset marked ON_SHOOT");
      const checkedOutRes = await db.equipmentReservation.findUnique({ where: { id: resData.id } });
      harness.assertEqual(checkedOutRes?.status, "CHECKED_OUT", "Reservation marked CHECKED_OUT");

      // 5. Post-shoot check-in with damage flag
      const postRes = await withSession(crew, () =>
        logPostShootInspection({
          tenantId: lumina.id,
          tenantSlug: "lumina-cine",
          reservationId: resData.id,
          condition: "DAMAGED",
          damageFlag: true,
          notes: "Front element scratched during outdoor shoot",
        })
      );
      harness.assert(postRes.success === true, "Post-shoot inspection completed");
      harness.assertEqual(postRes.nextItemStatus, "MAINTENANCE", "Damaged gear routed to MAINTENANCE");

      const returnedItem = await db.inventoryItem.findUnique({ where: { id: asset.id } });
      harness.assertEqual(returnedItem?.status, "MAINTENANCE", "Item in MAINTENANCE");
      harness.assertEqual(returnedItem?.condition, "DAMAGED", "Item condition DAMAGED");

      const log = await db.inspectionLog.findUnique({ where: { reservationId: resData.id } });
      harness.assert(!!log?.checkinCondition?.includes("DAMAGED"), "Log contains damage info");
    } finally {
      await db.inspectionLog.deleteMany({ where: { reservation: { itemId: asset.id } } });
      await db.equipmentReservation.deleteMany({ where: { itemId: asset.id } });
      await db.inventoryItem.delete({ where: { id: asset.id } }).catch(() => null);
    }
  });

  await harness.test("T15-FILES-01: photos upload as private masters with public watermarked previews; downloads wait for payment", async () => {
    const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("gallery", "Final selects");
    form.append("files", new File([new Uint8Array(png)], "hero_shot.png", { type: "image/png" }));
    form.append("files", new File(["not an image"], "notes.png", { type: "image/png" }));
    const send = (user: SessionUser | null) =>
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

    // Client proofing: favorite and retouch note
    const favRes = await toggleClientFavorite({ itemId: item!.id, isFav: true });
    harness.assert(favRes.success === true, "Client favorited photo");
    harness.assertEqual(favRes.isClientFav, true, "isClientFav is true");

    const noteRes = await submitRetouchNote({
      itemId: item!.id,
      note: "Please warm skin tones by +5% and soften background glare",
    });
    harness.assert(noteRes.success === true, "Retouch note saved");
    harness.assert(noteRes.clientNotes?.includes("warm skin tones") === true, "Note content saved");

    // Batch ZIP downloads (Favorites vs All)
    const favZip = await downloadHandler(new NextRequest(`http://localhost:3000/api/download?projectId=${projectId}&type=photo_zip&favoritesOnly=true`));
    harness.assertEqual(favZip.status, 200, "Favorites ZIP download 200 OK");
    harness.assertEqual(favZip.headers.get("Content-Type"), "application/zip", "ZIP content type returned");
    harness.assert(!!favZip.headers.get("Content-Disposition")?.includes("Favorites"), "Favorites in zip filename");

    const allZip = await downloadHandler(new NextRequest(`http://localhost:3000/api/download?projectId=${projectId}&type=photo_zip`));
    harness.assertEqual(allZip.status, 200, "All Masters ZIP download 200 OK");
    harness.assert(!!allZip.headers.get("Content-Disposition")?.includes("Master_Deliverables.zip"), "Master_Deliverables in zip filename");

    const del = await withSession(crew, () => deleteDeliverableItem({ tenantId: lumina.id, itemId: item!.id }));
    harness.assert(del.success === true, "File removed");
    harness.assert(!(await fs.stat(masterPath).catch(() => null)), "Master file deleted from storage");
  });

  await harness.test("T15-FILES-02: the studio tells the client their photos are ready, once the upload is done", async () => {
    await db.project.update({ where: { id: projectId }, data: { isFinalBalancePaid: false, status: "POST_PRODUCTION" } });
    const notify = (user: SessionUser | null) =>
      withSession(user, () => notifyClientPhotosReady({ tenantId: lumina.id, projectId }));

    const empty = await notify(crew);
    harness.assert(!empty.success, "Nothing to send while the project has no files");

    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 90, b: 160 } } }).png().toBuffer();
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("files", new File([new Uint8Array(png)], "first_look.png", { type: "image/png" }));
    const up = await withSession(crew, () => uploadDeliverables(new NextRequest("http://localhost:3000/api/deliverables", { method: "POST", body: form })));
    harness.assertEqual(up.status, 200, "Photo uploaded");
    const item = await db.deliverableItem.findFirst({ where: { deliverable: { projectId } } });
    createdFiles.push(masterFilePath(item!.downloadUrl), path.join(process.cwd(), "public", item!.previewUrl));
    harness.assert(
      !getNotificationHistory(20).some((n) => n.event === "PHOTOS_READY" && n.recipientEmail === clientEmail),
      "Uploading alone doesn't message the client"
    );

    const anon = await notify(null);
    harness.assert(!anon.success, "Signed-out visitors can't send it");

    const unpaid = await notify(crew);
    expectSuccess(unpaid, "Crew sends 'photos ready'");
    harness.assertEqual(unpaid.photoCount, 1, "Counts the photos in the vault");
    const sentUnpaid = getNotificationHistory(20).filter((n) => n.event === "PHOTOS_READY" && n.recipientEmail === clientEmail).at(-1);
    harness.assert(!!sentUnpaid, "The client is messaged");
    harness.assert(!!sentUnpaid?.emailText.includes(`/lumina-cine/vault/${projectId}`), "The message links to the vault");
    harness.assert(!!sentUnpaid?.emailText.toLowerCase().includes("balance"), "Unpaid: the message says full-resolution files unlock with the balance");
    const project = await db.project.findUnique({ where: { id: projectId } });
    harness.assertEqual(project?.status, "IN_REVIEW", "The project moves to client review");

    await db.project.update({ where: { id: projectId }, data: { isFinalBalancePaid: true } });
    const paid = await notify(crew);
    expectSuccess(paid, "Sent again after the balance is paid");
    const sentPaid = getNotificationHistory(20).filter((n) => n.event === "PHOTOS_READY" && n.recipientEmail === clientEmail).at(-1);
    harness.assert(!!sentPaid?.emailText.toLowerCase().includes("download"), "Paid: the message says the files can be downloaded");
    harness.assert(!sentPaid?.emailText.toLowerCase().includes("balance"), "Paid: no mention of a balance");
    const delivered = await db.project.findUnique({ where: { id: projectId } });
    harness.assertEqual(delivered?.status, "DELIVERED", "Paid and sent: the project is delivered");

    const otherTenant = await db.tenant.findFirst({ where: { NOT: { id: lumina.id } } });
    if (otherTenant) {
      const outsider = await db.user.create({
        data: { tenantId: otherTenant.id, email: `t15-outsider-${run}@example.test`, name: "Outsider", role: "STUDIO_OWNER" },
      });
      const cross = await withSession({ ...as(outsider), tenantSlug: otherTenant.slug }, () =>
        notifyClientPhotosReady({ tenantId: otherTenant.id, projectId })
      );
      harness.assert(!cross.success, "Another studio can't message this studio's client");
    }

    await withSession(crew, () => deleteDeliverableItem({ tenantId: lumina.id, itemId: item!.id }));
  });

  await harness.test("T15-FILES-03: a studio can release full-resolution photos before the balance is paid", async () => {
    await db.project.update({ where: { id: projectId }, data: { isFinalBalancePaid: false } });
    const projectRow = await db.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
    const clientRow = await db.user.findUnique({ where: { id: projectRow!.clientId } });
    const client = as(clientRow!);

    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 30, g: 160, b: 90 } } }).png().toBuffer();
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("files", new File([new Uint8Array(png)], "final_frame.png", { type: "image/png" }));
    await withSession(crew, () => uploadDeliverables(new NextRequest("http://localhost:3000/api/deliverables", { method: "POST", body: form })));
    const item = await db.deliverableItem.findFirst({ where: { deliverable: { projectId } } });
    harness.assert(!!item?.viewUrl?.startsWith("private:"), "A clean viewing copy is stored privately");
    createdFiles.push(masterFilePath(item!.downloadUrl), masterFilePath(item!.viewUrl!), path.join(process.cwd(), "public", item!.previewUrl));
    const view = await sharp(masterFilePath(item!.viewUrl!)).metadata();
    harness.assert((view.width ?? 0) <= 1600, `The viewing copy is web-sized (${view.width}px wide)`);

    const get = (type: string) =>
      withSession(client, () =>
        downloadHandler(new NextRequest(`http://localhost:3000/api/download?projectId=${projectId}&type=${type}&assetId=${item!.id}`))
      );

    // Default: watermarked until paid.
    harness.assertEqual((await get("photo_master")).status, 403, "Default setting: the original stays locked until paid");
    harness.assertEqual((await get("photo_view")).status, 403, "Default setting: the clean copy stays locked too");

    // The owner switches the studio to "full resolution right away".
    const settings = {
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      name: lumina.name,
      newSlug: lumina.slug,
      discipline: lumina.discipline as "PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID",
      brandColor: lumina.brandColor ?? "#f59e0b",
      currency: lumina.currency as "USD" | "MYR" | "SGD" | "EUR" | "GBP",
      customDomain: lumina.customDomain,
      tagline: lumina.tagline,
      bio: lumina.bio,
      logoUrl: lumina.logoUrl,
      qrCodeUrl: lumina.qrCodeUrl,
      bankDetails: lumina.bankDetails,
    };
    const crewTry = await withSession(crew, () => updateStudioSettings({ ...settings, releaseFilesBeforePayment: true }));
    harness.assert(!crewTry.success, "Crew can't change the delivery setting");
    try {
      const saved = await withSession(owner, () => updateStudioSettings({ ...settings, releaseFilesBeforePayment: true }));
      harness.assert(saved.success === true, "The owner turns on 'full resolution right away'");

      const master = await get("photo_master");
      harness.assertEqual(master.status, 200, "Unpaid, released: the original downloads");
      harness.assertEqual(Buffer.from(await master.arrayBuffer()).length, png.length, "The original file, full size");
      const shown = await get("photo_view");
      harness.assertEqual(shown.status, 200, "Unpaid, released: the clean copy shows in the vault");
      harness.assertEqual(shown.headers.get("Content-Type"), "image/jpeg", "Served as an image");
      const anon = await withSession(null, () =>
        downloadHandler(new NextRequest(`http://localhost:3000/api/download?projectId=${projectId}&type=photo_view&assetId=${item!.id}`))
      );
      harness.assertEqual(anon.status, 401, "Still only for the signed-in client or staff");

      const sent = await withSession(crew, () => notifyClientPhotosReady({ tenantId: lumina.id, projectId }));
      expectSuccess(sent, "Photos-ready sent");
      const msg = getNotificationHistory(20).filter((n) => n.event === "PHOTOS_READY" && n.recipientEmail === clientEmail).at(-1);
      harness.assert(!!msg?.emailText.includes("download the full-resolution files now"), "The message says they can download now");
      harness.assert(!msg?.emailText.includes("watermarked"), "No mention of watermarked previews");

      // Untouched when a save leaves the field out.
      await withSession(owner, () => updateStudioSettings(settings));
      const still = await db.tenant.findUnique({ where: { id: lumina.id } });
      harness.assertEqual(still?.releaseFilesBeforePayment, true, "Saving other settings keeps the delivery choice");
    } finally {
      await db.tenant.update({ where: { id: lumina.id }, data: { releaseFilesBeforePayment: false } });
    }
    harness.assertEqual((await get("photo_master")).status, 403, "Switched back: locked again until paid");

    await withSession(crew, () => deleteDeliverableItem({ tenantId: lumina.id, itemId: item!.id }));
    harness.assert(!(await fs.stat(masterFilePath(item!.viewUrl!)).catch(() => null)), "Removing the photo deletes its viewing copy too");
  });

  await harness.test("T15-BOOKING-PROJ-01: Category-based auto-provisioning of Projects from Bookings", async () => {
    // 1. Wedding booking: Category with autoCreateProject = true (or wedding keyword)
    const weddingSlot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "weddings",
        date: new Date("2026-12-15T00:00:00.000Z"),
        startTime: "07:00 AM",
        endTime: "03:00 PM",
        status: "HELD",
      },
    });

    const weddingClient = await db.user.create({
      data: {
        tenantId: lumina.id,
        name: "Wedding Client Test",
        email: `t15-wed-${run}@example.test`,
        phone: "01122334455",
        role: "CLIENT",
      },
    });

    const weddingBooking = await db.clientBooking.create({
      data: {
        tenantId: lumina.id,
        trackingCode: `BK-WED-${run.toUpperCase()}`,
        category: "weddings",
        clientName: weddingClient.name,
        clientEmail: weddingClient.email,
        clientPhone: "01122334455",
        discipline: "HYBRID",
        serviceTier: "Cinematic Wedding",
        targetDate: "2026-12-15",
        status: "PENDING",
        slotId: weddingSlot.id,
        userId: weddingClient.id,
        depositAmount: 500,
        sessionPrice: 2500,
      },
    });

    const weddingDepositInvoice = await db.milestoneInvoice.create({
      data: {
        tenantId: lumina.id,
        invoiceNumber: await db.$transaction((tx) => nextInvoiceNumber(tx, lumina.id)),
        clientId: weddingClient.id,
        bookingId: weddingBooking.id,
        milestoneType: "BOOKING_DEPOSIT",
        amount: 500,
        status: "PENDING_VERIFICATION",
        paymentMethod: "QR_CODE",
        dueDate: new Date(Date.now() + 86400000),
      },
    });

    // Approve the wedding deposit invoice
    const approveRes = await withSession(owner, () =>
      approvePaymentVerification({
        invoiceId: weddingDepositInvoice.id,
        tenantId: lumina.id,
        tenantSlug: lumina.slug,
      })
    );
    harness.assert(approveRes.success === true, "Wedding deposit approved");

    // Verify auto-provisioned Project exists
    const weddingProject = await db.project.findFirst({
      where: { bookingId: weddingBooking.id },
      include: { callSheets: true, invoices: true },
    });
    harness.assert(weddingProject !== null, "Wedding booking automatically provisioned a Project");
    harness.assertEqual(weddingProject?.status, "PRE_PRODUCTION", "Project status is PRE_PRODUCTION");
    harness.assertEqual(weddingProject?.budget, 2500, "Project budget matches sessionPrice");
    harness.assert((weddingProject?.callSheets.length ?? 0) > 0, "Initial call sheet generated for shoot day");
    harness.assertEqual(weddingProject?.callSheets[0]?.generalCallTime, "07:00 AM", "Call time matches slot start time");

    // 2. Convocation booking: Category without autoCreateProject (remains Booking only)
    const convoSlot = await db.bookingSlot.create({
      data: {
        tenantId: lumina.id,
        category: "convocation",
        date: new Date("2026-12-20T00:00:00.000Z"),
        startTime: "10:00 AM",
        endTime: "10:30 AM",
        status: "HELD",
      },
    });

    const convoClient = await db.user.create({
      data: {
        tenantId: lumina.id,
        name: "Convo Student Test",
        email: `t15-convo-${run}@example.test`,
        phone: "01988776655",
        role: "CLIENT",
      },
    });

    const convoBooking = await db.clientBooking.create({
      data: {
        tenantId: lumina.id,
        trackingCode: `BK-CNV-${run.toUpperCase()}`,
        category: "convocation",
        clientName: convoClient.name,
        clientEmail: convoClient.email,
        clientPhone: "01988776655",
        discipline: "PHOTOGRAPHY",
        serviceTier: "Bronze Convo",
        targetDate: "2026-12-20",
        status: "PENDING",
        slotId: convoSlot.id,
        userId: convoClient.id,
        depositAmount: 50,
        sessionPrice: 150,
      },
    });

    const convoDepositInvoice = await db.milestoneInvoice.create({
      data: {
        tenantId: lumina.id,
        invoiceNumber: await db.$transaction((tx) => nextInvoiceNumber(tx, lumina.id)),
        clientId: convoClient.id,
        bookingId: convoBooking.id,
        milestoneType: "BOOKING_DEPOSIT",
        amount: 50,
        status: "PENDING_VERIFICATION",
        paymentMethod: "QR_CODE",
        dueDate: new Date(Date.now() + 86400000),
      },
    });

    const approveConvoRes = await withSession(owner, () =>
      approvePaymentVerification({
        invoiceId: convoDepositInvoice.id,
        tenantId: lumina.id,
        tenantSlug: lumina.slug,
      })
    );
    harness.assert(approveConvoRes.success === true, "Convo deposit approved");

    // Convo should NOT auto-create a project
    const convoProject = await db.project.findFirst({
      where: { bookingId: convoBooking.id },
    });
    harness.assert(convoProject === null, "Convocation booking stays clean in Bookings without creating a Project");

    // 3. Manual promotion: promote convo booking to Project
    const promoteRes = await withSession(owner, () =>
      promoteBookingToProjectAction({
        tenantId: lumina.id,
        tenantSlug: lumina.slug,
        bookingId: convoBooking.id,
      })
    );
    harness.assert(promoteRes.success === true, "Owner manually promoted convo booking to Project");

    const manuallyPromotedProject = await db.project.findFirst({
      where: { bookingId: convoBooking.id },
    });
    harness.assert(manuallyPromotedProject !== null, "Manually promoted project exists");

    // Cleanup
    await db.callSheet.deleteMany({ where: { projectId: weddingProject!.id } });
    await db.project.delete({ where: { id: weddingProject!.id } });
    await db.project.delete({ where: { id: manuallyPromotedProject!.id } });
    await db.milestoneInvoice.deleteMany({ where: { bookingId: { in: [weddingBooking.id, convoBooking.id] } } });
    await db.clientBooking.deleteMany({ where: { id: { in: [weddingBooking.id, convoBooking.id] } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: [weddingSlot.id, convoSlot.id] } } });
    await db.user.deleteMany({ where: { id: { in: [weddingClient.id, convoClient.id] } } });
  });
}
