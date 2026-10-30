/**
 * CineFlow OS — Milestone 3 Module 7 Empirical Security & Adversarial Test Harness
 * 
 * Testing Mandates:
 * 1. Paywall Gating & Bypass Resistance (403 when unpaid, settlement atomicity, 200 when paid)
 * 2. Binary Stream & PKZIP Archive Integrity (0x50 0x4B 0x03 0x04 header, CRC32, unzip -t oracle)
 * 3. Multi-Tenant Scoping & Asset ID Tampering (cross-tenant rejection, 404/400 handling)
 * 4. Client Favorites & Retouch Feedback Stress (boundary limits, concurrency, injection robustness)
 */

import { db } from "@/lib/db";
import { GET as downloadHandler } from "@/app/api/download/route";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { toggleClientFavorite, submitRetouchNote } from "@/lib/actions/vault";
import { NextRequest } from "next/server";
import zlib from "node:zlib";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface AssertionRecord {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const records: AssertionRecord[] = [];
let passCount = 0;
let failCount = 0;

function assert(category: string, name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  [PASS] [${category}] ${name}`);
    passCount++;
    records.push({ category, name, passed: true, details });
  } else {
    console.error(`  [FAIL] [${category}] ${name}`);
    if (details) console.error(`    ↳ Details: ${details}`);
    failCount++;
    records.push({ category, name, passed: false, details });
  }
}

async function runSecuritySuite() {
  console.log("================================================================================");
  console.log("   CINEFLOW OS: MILESTONE 3 MODULE 7 EMPIRICAL SECURITY & ADVERSARIAL SUITE   ");
  console.log("   Target: Paywall Vault Gating, PKZIP Stream, Multi-Tenant & Feedback Stress  ");
  console.log("================================================================================\n");

  // Verify seed tenants
  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  if (!luminaTenant || !apexTenant) {
    throw new Error("Missing required seed tenants: lumina-cine or apex-media. Run prisma:seed.");
  }

  // Backup initial DB state for proj_lumina_01 and inv_lum_2 to restore on completion
  const initialProjectLumina = await db.project.findUnique({ where: { id: "proj_lumina_01" } });
  const initialInvoiceLumina = await db.milestoneInvoice.findUnique({ where: { id: "inv_lum_2" } });

  if (!initialProjectLumina || !initialInvoiceLumina) {
    throw new Error("Missing proj_lumina_01 or inv_lum_2. Check seed data.");
  }

  try {
    // ============================================================================
    // SUITE 1: Paywall Gating & Bypass Resistance
    // ============================================================================
    console.log(">>> SUITE 1: Paywall Gating & Bypass Resistance");

    // Ensure proj_lumina_01 is marked UNPAID
    await db.project.update({
      where: { id: "proj_lumina_01" },
      data: { isFinalBalancePaid: false },
    });
    await db.milestoneInvoice.update({
      where: { id: "inv_lum_2" },
      data: { status: "PENDING", verifiedBy: null, paidAt: null },
    });

    // 1.1 Unpaid project photo_zip download MUST return HTTP 403 Forbidden
    {
      const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip");
      const res = await downloadHandler(req);
      assert("Paywall Gating", "Unpaid project photo_zip returns HTTP 403", res.status === 403, `Got HTTP ${res.status}`);
      
      const body = await res.json();
      assert(
        "Paywall Gating",
        "403 body contains payment required error message and isFinalBalancePaid === false",
        body.isFinalBalancePaid === false && body.error?.includes("Payment Required"),
        `Got body: ${JSON.stringify(body)}`
      );
    }

    // 1.2 Unpaid project video_master download MUST return HTTP 403 Forbidden
    {
      const req = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_lumina_01&assetId=item_lum_video_1&type=video_master"
      );
      const res = await downloadHandler(req);
      assert("Paywall Gating", "Unpaid project video_master returns HTTP 403", res.status === 403, `Got HTTP ${res.status}`);
      const body = await res.json();
      assert(
        "Paywall Gating",
        "Video 403 body indicates payment required",
        body.isFinalBalancePaid === false,
        `Got body: ${JSON.stringify(body)}`
      );
    }

    // 1.3 Unpaid project photo_master download MUST return HTTP 403 Forbidden
    {
      const req = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_lumina_01&assetId=item_lum_photo_1&type=photo_master"
      );
      const res = await downloadHandler(req);
      assert("Paywall Gating", "Unpaid project photo_master returns HTTP 403", res.status === 403, `Got HTTP ${res.status}`);
    }

    // 1.4 Adversarial parameter spoofing on unpaid project MUST NOT bypass gating
    {
      const attackUrls = [
        "http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip&isFinalBalancePaid=true",
        "http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip&paid=true&admin=1",
        "http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip&bypass=true",
      ];
      for (const url of attackUrls) {
        const req = new NextRequest(url, {
          headers: {
            "x-admin-override": "true",
            "x-payment-verified": "true",
          },
        });
        const res = await downloadHandler(req);
        assert(
          "Paywall Bypass Resistance",
          `Spoofed request rejected with 403: ${url.split("?")[1]}`,
          res.status === 403,
          `Got HTTP ${res.status}`
        );
      }
    }

    // 1.5 Settle final balance via approvePaymentVerification
    {
      const settleRes = await approvePaymentVerification({
        invoiceId: "inv_lum_2",
        tenantId: luminaTenant.id,
        tenantSlug: luminaTenant.slug,
        staffName: "Lead Forensic Auditor",
        notes: "Approved final milestone bank wire verification",
      });

      assert("Payment Settlement", "approvePaymentVerification returned success: true", settleRes.success === true);
      assert("Payment Settlement", "approvePaymentVerification returned unlockedDownloads: true", settleRes.unlockedDownloads === true);

      // Verify DB state mutation
      const projectAfter = await db.project.findUnique({ where: { id: "proj_lumina_01" } });
      assert(
        "Payment Settlement",
        "Project.isFinalBalancePaid atomically updated to true in DB",
        projectAfter?.isFinalBalancePaid === true
      );

      const invoiceAfter = await db.milestoneInvoice.findUnique({ where: { id: "inv_lum_2" } });
      assert("Payment Settlement", "MilestoneInvoice.status is PAID in DB", invoiceAfter?.status === "PAID");
      assert("Payment Settlement", "MilestoneInvoice.verifiedBy recorded", invoiceAfter?.verifiedBy === "Lead Forensic Auditor");
      assert("Payment Settlement", "MilestoneInvoice.paidAt timestamp is populated", invoiceAfter?.paidAt !== null);
    }

    // 1.6 Re-request download after settlement MUST return HTTP 200 OK
    {
      const zipReq = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip");
      const zipRes = await downloadHandler(zipReq);
      assert("Paywall Unlock", "Photo ZIP download returns HTTP 200 after settlement", zipRes.status === 200, `Got HTTP ${zipRes.status}`);

      const videoReq = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_lumina_01&assetId=item_lum_video_1&type=video_master"
      );
      const videoRes = await downloadHandler(videoReq);
      assert("Paywall Unlock", "Video master download returns HTTP 200 after settlement", videoRes.status === 200, `Got HTTP ${videoRes.status}`);

      const photoReq = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_lumina_01&assetId=item_lum_photo_1&type=photo_master"
      );
      const photoRes = await downloadHandler(photoReq);
      assert("Paywall Unlock", "Single photo master download returns HTTP 200 after settlement", photoReq !== null && photoRes.status === 200, `Got HTTP ${photoRes.status}`);
    }

    // ============================================================================
    // SUITE 2: Binary Stream & PKZIP Archive Integrity
    // ============================================================================
    console.log("\n>>> SUITE 2: Binary Stream & PKZIP Archive Integrity");
    {
      const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip");
      const res = await downloadHandler(req);

      assert("PKZIP Stream", "HTTP 200 OK received for ZIP download", res.status === 200);
      assert("PKZIP Stream", "Content-Type is application/zip", res.headers.get("content-type") === "application/zip");
      const disposition = res.headers.get("content-disposition");
      assert(
        "PKZIP Stream",
        "Content-Disposition specifies attachment with valid ZIP filename",
        Boolean(disposition && disposition.includes("attachment") && disposition.endsWith('.zip"'))
      );

      const arrayBuffer = await res.arrayBuffer();
      const zipBuffer = Buffer.from(arrayBuffer);

      assert("PKZIP Stream", "ZIP archive has non-zero byte size", zipBuffer.length > 0, `Length: ${zipBuffer.length} bytes`);

      // 2.1 Magic Header: 0x50, 0x4B, 0x03, 0x04 ("PK\x03\x04")
      const magic0 = zipBuffer[0];
      const magic1 = zipBuffer[1];
      const magic2 = zipBuffer[2];
      const magic3 = zipBuffer[3];
      assert(
        "PKZIP Binary Structure",
        "PKZIP magic bytes 0x50, 0x4B, 0x03, 0x04 match specification",
        magic0 === 0x50 && magic1 === 0x4b && magic2 === 0x03 && magic3 === 0x04,
        `Got: 0x${magic0?.toString(16)}, 0x${magic1?.toString(16)}, 0x${magic2?.toString(16)}, 0x${magic3?.toString(16)}`
      );

      // 2.2 In-Memory Structural Parsing & CRC32 Verification
      let offset = 0;
      let fileCount = 0;
      const parsedFiles: { name: string; size: number; headerCrc: number; computedCrc: number }[] = [];

      while (offset < zipBuffer.length) {
        const sig = zipBuffer.readUInt32LE(offset);
        if (sig === 0x04034b50) {
          // Local File Header
          const versionNeeded = zipBuffer.readUInt16LE(offset + 4);
          const compMethod = zipBuffer.readUInt16LE(offset + 8);
          const headerCrc = zipBuffer.readUInt32LE(offset + 14);
          const compSize = zipBuffer.readUInt32LE(offset + 18);
          const uncompSize = zipBuffer.readUInt32LE(offset + 22);
          const nameLen = zipBuffer.readUInt16LE(offset + 26);
          const extraLen = zipBuffer.readUInt16LE(offset + 28);

          assert("PKZIP Binary Structure", `Local file #${fileCount + 1} version needed is 20 (2.0)`, versionNeeded === 20);
          assert("PKZIP Binary Structure", `Local file #${fileCount + 1} compression method is 0 (Store)`, compMethod === 0);
          assert("PKZIP Binary Structure", `Local file #${fileCount + 1} compressed size equals uncompressed size`, compSize === uncompSize);

          const nameStart = offset + 30;
          const fileName = zipBuffer.subarray(nameStart, nameStart + nameLen).toString("utf8");
          const dataStart = nameStart + nameLen + extraLen;
          const fileData = zipBuffer.subarray(dataStart, dataStart + compSize);

          const computedCrc = zlib.crc32(fileData);
          assert(
            "PKZIP CRC32 Integrity",
            `File '${fileName}' CRC-32 checksum matches header (${headerCrc} === ${computedCrc})`,
            headerCrc === computedCrc,
            `Header CRC: ${headerCrc}, Computed CRC: ${computedCrc}`
          );

          parsedFiles.push({ name: fileName, size: compSize, headerCrc, computedCrc });
          fileCount++;
          offset = dataStart + compSize;
        } else if (sig === 0x02014b50) {
          // Central Directory Header - stop local scanning
          break;
        } else {
          break;
        }
      }

      assert("PKZIP Binary Structure", "Extracted files count matches deliverable photo count (2 photos)", fileCount === 2);

      // Verify Central Directory records
      let cdCount = 0;
      let cdOffset = offset;
      while (cdOffset < zipBuffer.length) {
        const sig = zipBuffer.readUInt32LE(cdOffset);
        if (sig === 0x02014b50) {
          cdCount++;
          const nameLen = zipBuffer.readUInt16LE(cdOffset + 28);
          const extraLen = zipBuffer.readUInt16LE(cdOffset + 30);
          const commentLen = zipBuffer.readUInt16LE(cdOffset + 32);
          cdOffset += 46 + nameLen + extraLen + commentLen;
        } else if (sig === 0x06054b50) {
          // EOCD record
          const totalEntries = zipBuffer.readUInt16LE(cdOffset + 10);
          assert("PKZIP Binary Structure", "EOCD total entries matches local file headers", totalEntries === fileCount);
          break;
        } else {
          break;
        }
      }

      assert("PKZIP Binary Structure", "Central directory entry count matches local headers", cdCount === fileCount);

      // 2.3 External CLI Oracle Verification via `/usr/bin/unzip -t`
      const tmpZipPath = path.join(os.tmpdir(), `cineflow_challenger_${Date.now()}.zip`);
      const tmpExtractDir = path.join(os.tmpdir(), `cineflow_extract_${Date.now()}`);

      try {
        await fs.writeFile(tmpZipPath, zipBuffer);

        // Run unzip -t (test integrity)
        const { stdout: testOut } = await execAsync(`unzip -t "${tmpZipPath}"`);
        assert(
          "PKZIP External Oracle",
          "unzip -t reports 'No errors detected in compressed data'",
          testOut.includes("No errors detected in compressed data"),
          `unzip -t output: ${testOut.trim()}`
        );

        // Run unzip -l (list)
        const { stdout: listOut } = await execAsync(`unzip -l "${tmpZipPath}"`);
        assert(
          "PKZIP External Oracle",
          "unzip -l lists deliverable files with non-zero sizes",
          listOut.includes("Editorial_Stills") && listOut.includes("2 files"),
          `unzip -l output: ${listOut.trim()}`
        );

        // Extract to verify file contents
        await fs.mkdir(tmpExtractDir, { recursive: true });
        await execAsync(`unzip "${tmpZipPath}" -d "${tmpExtractDir}"`);

        const extractedFiles = await fs.readdir(tmpExtractDir);
        assert(
          "PKZIP Extraction Verification",
          "Extracted files count matches expected (2 files)",
          extractedFiles.length === 2
        );

        for (const file of extractedFiles) {
          const stats = await fs.stat(path.join(tmpExtractDir, file));
          assert("PKZIP Extraction Verification", `Extracted file '${file}' has non-zero size`, stats.size > 0);
        }
      } finally {
        await fs.rm(tmpZipPath, { force: true });
        await fs.rm(tmpExtractDir, { recursive: true, force: true });
      }

      // 2.4 Zip Slip & Path Traversal Resistance Challenge
      // If a title contains traversal sequences, does the route sanitize it?
      {
        // Find existing deliverable
        const deliv = await db.clientDeliverable.findFirst({ where: { projectId: "proj_lumina_01" } });
        if (deliv) {
          const maliciousItem = await db.deliverableItem.create({
            data: {
              deliverableId: deliv.id,
              itemType: "PHOTO",
              title: "../../../etc/passwd_exploit",
              previewUrl: "/mock/preview.jpg",
              downloadUrl: "/mock/master.jpg",
            },
          });

          const zipReq = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip");
          const zipRes = await downloadHandler(zipReq);
          const zipBuf = Buffer.from(await zipRes.arrayBuffer());

          // Parse filenames from the ZIP binary headers
          let maliciousHeaderOffset = 0;
          const entryFilenames: string[] = [];
          while (maliciousHeaderOffset < zipBuf.length) {
            const sig = zipBuf.readUInt32LE(maliciousHeaderOffset);
            if (sig === 0x04034b50) {
              const compSize = zipBuf.readUInt32LE(maliciousHeaderOffset + 18);
              const nameLen = zipBuf.readUInt16LE(maliciousHeaderOffset + 26);
              const extraLen = zipBuf.readUInt16LE(maliciousHeaderOffset + 28);
              const nameStart = maliciousHeaderOffset + 30;
              const fName = zipBuf.subarray(nameStart, nameStart + nameLen).toString("utf8");
              entryFilenames.push(fName);
              maliciousHeaderOffset = nameStart + nameLen + extraLen + compSize;
            } else {
              break;
            }
          }

          const hasPathTraversal = entryFilenames.some((name) => name.includes("..") || name.startsWith("/") || name.includes("\\"));
          assert(
            "Zip Slip Resistance",
            "Malicious deliverable title with '../' is sanitized; entry filenames do NOT contain traversal characters",
            !hasPathTraversal,
            `Archive entry filenames: ${entryFilenames.join(", ")}`
          );

          // Verify with unzip that extraction remains securely confined
          const tmpMaliciousZip = path.join(os.tmpdir(), `malicious_${Date.now()}.zip`);
          const tmpMaliciousExtract = path.join(os.tmpdir(), `malicious_extract_${Date.now()}`);
          try {
            await fs.writeFile(tmpMaliciousZip, zipBuf);
            await fs.mkdir(tmpMaliciousExtract, { recursive: true });
            await execAsync(`unzip "${tmpMaliciousZip}" -d "${tmpMaliciousExtract}"`);
            const extracted = await fs.readdir(tmpMaliciousExtract);
            const allFilesConfined = extracted.every((f) => !f.includes("..") && !f.includes("/"));
            assert(
              "Zip Slip Resistance",
              "External unzip extraction stays securely confined within target directory",
              allFilesConfined
            );
          } finally {
            await fs.rm(tmpMaliciousZip, { force: true });
            await fs.rm(tmpMaliciousExtract, { recursive: true, force: true });
          }

          // Clean up malicious item
          await db.deliverableItem.delete({ where: { id: maliciousItem.id } });
        }
      }
    }

    // ============================================================================
    // SUITE 3: Multi-Tenant Scoping & Asset ID Tampering
    // ============================================================================
    console.log("\n>>> SUITE 3: Multi-Tenant Scoping & Asset ID Tampering");
    {
      // 3.1 Cross-Tenant Photo Master Tampering:
      // proj_lumina_01 (Tenant: lumina-cine) requesting item_apx_photo_1 (Tenant: apex-media)
      const crossPhotoReq = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_lumina_01&assetId=item_apx_photo_1&type=photo_master"
      );
      const crossPhotoRes = await downloadHandler(crossPhotoReq);
      assert(
        "Multi-Tenant Isolation",
        "Cross-tenant photo master request rejected with HTTP 404",
        crossPhotoRes.status === 404,
        `Got HTTP ${crossPhotoRes.status}`
      );
      const crossPhotoBody = await crossPhotoRes.json();
      assert(
        "Multi-Tenant Isolation",
        "Error message specifies asset not found in project",
        crossPhotoBody.error?.includes("Photo deliverable asset not found")
      );

      // 3.2 Cross-Tenant Video Master Tampering:
      // proj_apex_01 (Tenant: apex-media) requesting item_lum_video_1 (Tenant: lumina-cine)
      const crossVideoReq = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_apex_01&assetId=item_lum_video_1&type=video_master"
      );
      const crossVideoRes = await downloadHandler(crossVideoReq);
      assert(
        "Multi-Tenant Isolation",
        "Cross-tenant video master request rejected with HTTP 404",
        crossVideoRes.status === 404,
        `Got HTTP ${crossVideoRes.status}`
      );

      // 3.3 Cross-Tenant Invoice Approval Attack:
      // Tenant Lumina attempts to approve Apex's final balance invoice inv_apx_2
      const crossApproveRes = await approvePaymentVerification({
        invoiceId: "inv_apx_2",
        tenantId: luminaTenant.id,
        tenantSlug: luminaTenant.slug,
        staffName: "Malicious Lumina Staff",
      });
      assert(
        "Multi-Tenant Shield",
        "Cross-tenant invoice approval rejected with INVOICE_NOT_FOUND",
        crossApproveRes.success === false && crossApproveRes.error === "INVOICE_NOT_FOUND",
        `Got response: ${JSON.stringify(crossApproveRes)}`
      );

      // 3.4 Non-Existent Project ID
      const ghostProjectReq = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_ghost_99999&type=photo_zip"
      );
      const ghostProjectRes = await downloadHandler(ghostProjectReq);
      assert("Edge-Case Robustness", "Non-existent projectId returns HTTP 404", ghostProjectRes.status === 404);

      // 3.5 Non-Existent Asset ID
      const ghostAssetReq = new NextRequest(
        "http://localhost:3000/api/download?projectId=proj_lumina_01&assetId=item_ghost_99999&type=photo_master"
      );
      const ghostAssetRes = await downloadHandler(ghostAssetReq);
      assert("Edge-Case Robustness", "Non-existent assetId returns HTTP 404", ghostAssetRes.status === 404);

      // 3.6 Missing or Invalid Query Parameters
      const badParams = [
        { url: "http://localhost:3000/api/download", name: "Missing all params -> 400" },
        { url: "http://localhost:3000/api/download?projectId=proj_lumina_01", name: "Missing type -> 400" },
        { url: "http://localhost:3000/api/download?type=photo_zip", name: "Missing projectId -> 400" },
        { url: "http://localhost:3000/api/download?projectId=proj_lumina_01&type=unsupported_payload", name: "Unsupported type -> 400" },
        { url: "http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_master", name: "photo_master missing assetId -> 400" },
      ];
      for (const bp of badParams) {
        const req = new NextRequest(bp.url);
        const res = await downloadHandler(req);
        assert("Input Validation", bp.name, res.status === 400, `Got HTTP ${res.status}`);
      }

      // 3.7 Empty Deliverables Edge Case
      const emptyProject = await db.project.create({
        data: {
          tenantId: luminaTenant.id,
          projectNumber: "PJ-TEST-EMPTY-" + Date.now(),
          title: "Empty Project Without Deliverables",
          clientId: initialProjectLumina.clientId,
          studioLeadId: initialProjectLumina.studioLeadId,
          discipline: "PHOTOGRAPHY",
          budget: 1000,
          isFinalBalancePaid: true,
        },
      });

      const emptyReq = new NextRequest(`http://localhost:3000/api/download?projectId=${emptyProject.id}&type=photo_zip`);
      const emptyRes = await downloadHandler(emptyReq);
      assert(
        "Edge-Case Robustness",
        "Project with no photo deliverables returns HTTP 404 with clean message",
        emptyRes.status === 404,
        `Got HTTP ${emptyRes.status}`
      );
      await db.project.delete({ where: { id: emptyProject.id } });
    }

    // ============================================================================
    // SUITE 4: Client Favorites & Retouch Feedback Stress Testing
    // ============================================================================
    console.log("\n>>> SUITE 4: Client Favorites & Retouch Feedback Stress Testing");
    {
      const photoItem = await db.deliverableItem.findFirst({ where: { itemType: "PHOTO" } });
      if (!photoItem) throw new Error("No photo deliverable found for feedback tests");

      // 4.1 Boundary Testing: Empty string
      const emptyRes = await submitRetouchNote({ itemId: photoItem.id, note: "" });
      assert("Retouch Feedback", "Empty note string saves successfully (clears note to null)", emptyRes.success === true);
      const itemEmpty = await db.deliverableItem.findUnique({ where: { id: photoItem.id } });
      assert("Retouch Feedback", "Empty note is null in DB", itemEmpty?.clientNotes === null);

      // 4.2 Boundary Testing: Exactly 1000 characters
      const note1000 = "A".repeat(1000);
      const res1000 = await submitRetouchNote({ itemId: photoItem.id, note: note1000 });
      assert("Retouch Feedback", "Note of exactly 1000 characters succeeds", res1000.success === true);
      const item1000 = await db.deliverableItem.findUnique({ where: { id: photoItem.id } });
      assert("Retouch Feedback", "DB stored all 1000 characters", item1000?.clientNotes?.length === 1000);

      // 4.3 Boundary Testing: 1001 characters (overflow by 1)
      const note1001 = "B".repeat(1001);
      const res1001 = await submitRetouchNote({ itemId: photoItem.id, note: note1001 });
      assert(
        "Retouch Feedback",
        "Note of 1001 characters rejected by Zod schema",
        res1001.success === false,
        `Expected failure, got: ${JSON.stringify(res1001)}`
      );

      // 4.4 Boundary Testing: Massive payload (10,000 characters)
      const note10k = "C".repeat(10000);
      const res10k = await submitRetouchNote({ itemId: photoItem.id, note: note10k });
      assert("Retouch Feedback", "Massive 10k character payload rejected", res10k.success === false);

      // 4.5 Content Robustness: XSS, SQLi, Emojis, Multiline
      const attackPayloads = [
        { name: "XSS Script Tag", note: "<script>alert('xss')</script><img src=x onerror=alert(1)>" },
        { name: "SQL Injection Fragment", note: "'; DROP TABLE DeliverableItem; --" },
        { name: "Unicode Emojis & Linebreaks", note: "Cinematic Grade 🎬📸\n\rLift highlights by +5% & warm shadows ✨" },
      ];

      for (const p of attackPayloads) {
        const res = await submitRetouchNote({ itemId: photoItem.id, note: p.note });
        assert("Feedback Robustness", `Payload '${p.name}' accepted safely`, res.success === true);
        const saved = await db.deliverableItem.findUnique({ where: { id: photoItem.id } });
        assert("Feedback Robustness", `DB holds unmodified text for '${p.name}'`, saved?.clientNotes === p.note);
      }

      // 4.6 Concurrency Stress Test: 30 Simultaneous Rapid Toggles
      console.log("  ... Launching 30 simultaneous concurrent favorite toggles ...");
      const togglePromises: Promise<any>[] = [];
      for (let i = 0; i < 30; i++) {
        const isFav = i % 2 === 0;
        togglePromises.push(toggleClientFavorite({ itemId: photoItem.id, isFav }));
      }

      const results = await Promise.all(togglePromises);
      const allSucceeded = results.every((r) => r.success === true);
      assert(
        "Concurrency Stress",
        "All 30 concurrent toggleClientFavorite calls resolved without deadlocks or crashes",
        allSucceeded,
        `Failures detected: ${results.filter((r) => !r.success).length}`
      );

      const finalItem = await db.deliverableItem.findUnique({ where: { id: photoItem.id } });
      assert("Concurrency Stress", "Final item row remains intact and valid in database", Boolean(finalItem));

      // 4.7 Non-Existent Item ID
      const ghostFavRes = await toggleClientFavorite({ itemId: "ghost_item_99999", isFav: true });
      assert("Error Handling", "toggleClientFavorite on non-existent item returns success: false", ghostFavRes.success === false);

      const ghostNoteRes = await submitRetouchNote({ itemId: "ghost_item_99999", note: "Some note" });
      assert("Error Handling", "submitRetouchNote on non-existent item returns success: false", ghostNoteRes.success === false);
    }
  } finally {
    // Restore baseline DB state
    await db.project.update({
      where: { id: "proj_lumina_01" },
      data: { isFinalBalancePaid: initialProjectLumina.isFinalBalancePaid },
    });
    await db.milestoneInvoice.update({
      where: { id: "inv_lum_2" },
      data: {
        status: initialInvoiceLumina.status,
        verifiedBy: initialInvoiceLumina.verifiedBy,
        paidAt: initialInvoiceLumina.paidAt,
      },
    });
  }

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`   CHALLENGE VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("================================================================================");

  if (failCount > 0) {
    console.error(`\n>>> ADVERSARIAL VERDICT: REQUEST_CHANGES (${failCount} failures detected)`);
    process.exit(1);
  } else {
    console.log(`\n>>> ADVERSARIAL VERDICT: APPROVE (All ${passCount} security & integrity assertions passed)`);
    process.exit(0);
  }
}

runSecuritySuite()
  .catch((err) => {
    console.error("FATAL ERROR IN SECURITY SUITE:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
