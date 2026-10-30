import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { setupPlaceholderAssets } from "./setup-assets";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting CineFlow OS demonstration database seed...");

  // 1. Ensure local uploads directory tree and placeholder mock assets exist
  await setupPlaceholderAssets();
  console.log("✓ Local uploads directory tree and placeholder assets initialized");

  const passwordHash = bcrypt.hashSync("password123", 10);

  // 2. Clear existing records in clean reverse DAG order for idempotent re-runs
  await prisma.inspectionLog.deleteMany({});
  await prisma.equipmentReservation.deleteMany({});
  await prisma.kitBundleItem.deleteMany({});
  await prisma.kitBundle.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.deliverableItem.deleteMany({});
  await prisma.clientDeliverable.deleteMany({});
  await prisma.digitalRelease.deleteMany({});
  await prisma.shotItem.deleteMany({});
  await prisma.callSheet.deleteMany({});
  await prisma.milestoneInvoice.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.proposalAddOn.deleteMany({});
  await prisma.proposal.deleteMany({});
  await prisma.clientBooking.deleteMany({});
  await prisma.bookingSlot.deleteMany({});
  await prisma.showcaseItem.deleteMany({});
  await prisma.servicePackage.deleteMany({});
  await prisma.proposalAddOnTemplate.deleteMany({});
  await prisma.frameDesign.deleteMany({});
  await prisma.printSize.deleteMany({});
  await prisma.campaignCategory.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});

  // ============================================================================
  // 1. GLOBAL SUPER ADMIN
  // ============================================================================
  const superAdmin = await prisma.user.create({
    data: {
      id: "usr_superadmin",
      name: "CineFlow Super Admin",
      email: "superadmin@cineflow.app",
      phone: "+1 (555) 000-0001",
      role: "SUPER_ADMIN",
      passwordHash,
    },
  });
  console.log("✓ Super Admin created (superadmin@cineflow.app)");

  // ============================================================================
  // 2. TENANTS
  // ============================================================================
  // Tenant 1: Lumina CineWorks (USD, Hybrid Cinema Studio)
  const luminaTenant = await prisma.tenant.create({
    data: {
      id: "ten_lumina",
      name: "Lumina CineWorks",
      slug: "lumina-cine",
      customDomain: "studio.luminacine.com",
      discipline: "HYBRID",
      tagline: "Cinematic Narrative & High-End Visual Storytelling",
      bio: "Boutique cinematography and high-fashion editorial studio specializing in commercial brand campaigns, narrative wedding films, and documentary features.",
      logoUrl: "/uploads/logos/lumina-logo.svg",
      brandColor: "#f59e0b",
      currency: "USD",
      qrCodeUrl: "/uploads/qrcodes/lumina_qr.png",
      bankDetails: "JPMorgan Chase / Lumina CineWorks LLC / Routing: 021000021 / Account: 8492019482",
      subscriptionTier: "PRO",
      subscriptionStatus: "ACTIVE",
    },
  });

  // Tenant 2: Apex Photo & Motion (MYR, Portrait & Heritage Studio)
  const apexTenant = await prisma.tenant.create({
    data: {
      id: "ten_apex",
      name: "Apex Photo & Motion",
      slug: "apex-media",
      customDomain: "studio.apexfilms.com",
      discipline: "PHOTOGRAPHY",
      tagline: "Preserving Life’s Defining Milestones",
      bio: "Premier convocation, family heirloom, and commercial portrait studio in Kuala Lumpur. Capturing timeless milestones with medium-format precision.",
      logoUrl: "/uploads/logos/apex-logo.svg",
      brandColor: "#06b6d4",
      currency: "MYR",
      qrCodeUrl: "/uploads/qrcodes/apex_duitnow_qr.png",
      bankDetails: "CIMB Bank Berhad / Apex Media Sdn Bhd / Account: 8009-3211-9014",
      subscriptionTier: "STUDIO_UNLIMITED",
      subscriptionStatus: "ACTIVE",
    },
  });
  console.log("✓ Tenants Lumina CineWorks and Apex Photo & Motion created");

  // ============================================================================
  // 3. USERS (STUDIO TEAMS & CLIENTS)
  // ============================================================================
  // Lumina Users
  const luminaOwner = await prisma.user.create({
    data: {
      id: "usr_lumina_owner",
      tenantId: luminaTenant.id,
      name: "Alex Vance",
      email: "alex@luminacine.com",
      phone: "+1 (555) 234-5678",
      role: "STUDIO_OWNER",
      passwordHash,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        id: "usr_lumina_dp",
        tenantId: luminaTenant.id,
        name: "Marcus Vance",
        email: "marcus@luminacine.com",
        phone: "+1 (555) 234-5679",
        role: "VIDEOGRAPHER",
        passwordHash,
      },
      {
        id: "usr_lumina_photo",
        tenantId: luminaTenant.id,
        name: "Sarah Tan",
        email: "sarah@luminacine.com",
        phone: "+1 (555) 234-5680",
        role: "PHOTOGRAPHER",
        passwordHash,
      },
      {
        id: "usr_lumina_crew",
        tenantId: luminaTenant.id,
        name: "Liam Ross",
        email: "liam@luminacine.com",
        phone: "+1 (555) 234-5681",
        role: "CREW",
        passwordHash,
      },
    ],
  });

  const luminaClient1 = await prisma.user.create({
    data: {
      id: "usr_lumina_cl1",
      tenantId: luminaTenant.id,
      name: "Elena Rostova",
      email: "elena@luxurybrand.com",
      phone: "+1 (555) 876-5432",
      role: "CLIENT",
      passwordHash,
    },
  });

  const luminaClient2 = await prisma.user.create({
    data: {
      id: "usr_lumina_cl2",
      tenantId: luminaTenant.id,
      name: "Julian Sterling",
      email: "julian@sterlingholdings.com",
      phone: "+1 (555) 987-6543",
      role: "CLIENT",
      passwordHash,
    },
  });

  // Apex Users
  const apexOwner = await prisma.user.create({
    data: {
      id: "usr_apex_owner",
      tenantId: apexTenant.id,
      name: "David Chong",
      email: "david@apexmedia.com",
      phone: "+60 12-345 6789",
      role: "STUDIO_OWNER",
      passwordHash,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        id: "usr_apex_photo",
        tenantId: apexTenant.id,
        name: "Aisyah Rahman",
        email: "aisyah@apexmedia.com",
        phone: "+60 13-456 7890",
        role: "PHOTOGRAPHER",
        passwordHash,
      },
      {
        id: "usr_apex_crew",
        tenantId: apexTenant.id,
        name: "Kevin Lim",
        email: "kevin@apexmedia.com",
        phone: "+60 17-890 1234",
        role: "CREW",
        passwordHash,
      },
    ],
  });

  const apexClient1 = await prisma.user.create({
    data: {
      id: "usr_apex_cl1",
      tenantId: apexTenant.id,
      name: "Farah Nadiah",
      email: "farah@graduate.utm.my",
      phone: "+60 19-876 5432",
      role: "CLIENT",
      passwordHash,
    },
  });

  const apexClient2 = await prisma.user.create({
    data: {
      id: "usr_apex_cl2",
      tenantId: apexTenant.id,
      name: "Dato' Kamarudin",
      email: "kamarudin@familygroup.my",
      phone: "+60 12-998 8776",
      role: "CLIENT",
      passwordHash,
    },
  });
  console.log("✓ Studio staff and clients seeded for both studios");

  // ============================================================================
  // 4. CAMPAIGN CATEGORIES
  // ============================================================================
  await prisma.campaignCategory.createMany({
    data: [
      // Lumina
      { id: "cat_lumina_comm", tenantId: luminaTenant.id, name: "Commercial Campaigns", slug: "commercial", badgeIcon: "🎬", sortOrder: 1, isActive: true },
      { id: "cat_lumina_wed", tenantId: luminaTenant.id, name: "Weddings & Features", slug: "weddings", badgeIcon: "💍", sortOrder: 2, isActive: true },
      { id: "cat_lumina_port", tenantId: luminaTenant.id, name: "Studio Portraits", slug: "studio-portrait", badgeIcon: "📸", sortOrder: 3, isActive: true },
      // Apex
      { id: "cat_apex_convo", tenantId: apexTenant.id, name: "Convocation Specials", slug: "convocation", badgeIcon: "🎓", sortOrder: 1, isActive: true },
      { id: "cat_apex_raya", tenantId: apexTenant.id, name: "Hari Raya Festive Specials", slug: "hari-raya", badgeIcon: "🌙", sortOrder: 2, isActive: true },
      { id: "cat_apex_port", tenantId: apexTenant.id, name: "Studio Portraiture", slug: "studio-portrait", badgeIcon: "📸", sortOrder: 3, isActive: true },
      { id: "cat_apex_comm", tenantId: apexTenant.id, name: "Commercial Branding", slug: "commercial", badgeIcon: "🎬", sortOrder: 4, isActive: true },
    ],
  });

  // ============================================================================
  // 5. SERVICE PACKAGES
  // ============================================================================
  const pkgLuminaComm = await prisma.servicePackage.create({
    data: {
      id: "pkg_lumina_comm",
      tenantId: luminaTenant.id,
      category: "commercial",
      name: "Cinematic Brand Hero Campaign",
      discipline: "HYBRID",
      price: 6500.0,
      depositPrice: 3250.0,
      description: "Full dual-camera 4K commercial production with ARRI/Sony cinema rigs, professional lighting, sound design, and color grading.",
      deliverables: "60-second Brand Master (4K ProRes), 30-second Cutdown, 4x 9:16 Social Reels, 20 Hero Retouched Stills.",
      turnaround: "14 Business Days",
      isFeatured: true,
    },
  });

  const pkgLuminaWed = await prisma.servicePackage.create({
    data: {
      id: "pkg_lumina_wed",
      tenantId: luminaTenant.id,
      category: "weddings",
      name: "Heirloom Cinematic Wedding Feature",
      discipline: "VIDEOGRAPHY",
      price: 3800.0,
      depositPrice: 1900.0,
      description: "Comprehensive wedding day narrative documentation with two cinematographers and drone aerial capture.",
      deliverables: "10-minute Documentary Highlight Film (4K), Full Ceremony & Speeches Multi-Cam Cut, 60s Teaser.",
      turnaround: "21 Business Days",
      isFeatured: true,
    },
  });

  await prisma.servicePackage.create({
    data: {
      id: "pkg_lumina_exec",
      tenantId: luminaTenant.id,
      category: "studio-portrait",
      name: "Executive Editorial & Brand Stills",
      discipline: "PHOTOGRAPHY",
      price: 1200.0,
      depositPrice: 600.0,
      description: "Half-day in-studio and location portraiture for founders, executive teams, and editorial publications.",
      deliverables: "15 Master Retouched High-Res Images, Online Proofing Gallery, Commercial License.",
      turnaround: "5 Business Days",
      isFeatured: false,
    },
  });

  const pkgApexConvo = await prisma.servicePackage.create({
    data: {
      id: "pkg_apex_convo",
      tenantId: apexTenant.id,
      category: "convocation",
      name: "Convocation Studio Deluxe",
      discipline: "PHOTOGRAPHY",
      price: 450.0,
      depositPrice: 150.0,
      description: "45-minute studio portrait session including graduation gown styling, family group shots, and instant proofs.",
      deliverables: "15 Master Retouched High-Res Stills, 1x Framed 12R Archival Print, Digital Download Vault.",
      turnaround: "3 Business Days",
      isFeatured: true,
    },
  });

  const pkgApexRaya = await prisma.servicePackage.create({
    data: {
      id: "pkg_apex_raya",
      tenantId: apexTenant.id,
      category: "hari-raya",
      name: "Hari Raya Family Heirloom Session",
      discipline: "PHOTOGRAPHY",
      price: 850.0,
      depositPrice: 300.0,
      description: "90-minute festive heritage session for multi-generational families (up to 12 pax) with traditional setups.",
      deliverables: "35 Master Retouched High-Res Stills, 1x Framed 16R Heirloom Wall Art, All Soft Copies via Vault.",
      turnaround: "5 Business Days",
      isFeatured: true,
    },
  });

  await prisma.servicePackage.create({
    data: {
      id: "pkg_apex_corp",
      tenantId: apexTenant.id,
      category: "studio-portrait",
      name: "Corporate Executive Pro Headshots",
      discipline: "PHOTOGRAPHY",
      price: 300.0,
      depositPrice: 100.0,
      description: "Express 30-minute studio portraiture for LinkedIn, company annual reports, and press kits.",
      deliverables: "5 Retouched Hero Stills, Multiple Color Backgrounds, 24-Hour Expedited Delivery.",
      turnaround: "24 Hours Expedited",
      isFeatured: false,
    },
  });

  // ============================================================================
  // 6. PROPOSAL ADD-ON TEMPLATES
  // ============================================================================
  await prisma.proposalAddOnTemplate.createMany({
    data: [
      // Lumina
      { tenantId: luminaTenant.id, name: "Drone 4K Aerial Coverage", description: "FAA Part 107 licensed drone aerial footage", price: 450.0, unit: "fixed", isDefault: false, isActive: true },
      { tenantId: luminaTenant.id, name: "RAW Footage SSD Master Drive", description: "Encrypted 2TB NVMe drive with all unedited camera originals", price: 350.0, unit: "fixed", isDefault: false, isActive: true },
      { tenantId: luminaTenant.id, name: "Second Camera Operator", description: "Dedicated B-Cam cinematographer for full day", price: 800.0, unit: "per_day", isDefault: false, isActive: true },
      { tenantId: luminaTenant.id, name: "48-Hour Rush Delivery", description: "Expedited edit and master color delivery", price: 500.0, unit: "fixed", isDefault: false, isActive: true },
      { tenantId: luminaTenant.id, name: "Social Media Vertical Cuts (9:16)", description: "3x dedicated high-energy vertical cuts for TikTok/Reels", price: 400.0, unit: "fixed", isDefault: false, isActive: true },
      // Apex
      { tenantId: apexTenant.id, name: "Additional Attire Change", description: "Includes extra 15 mins shooting & 5 retouch stills", price: 80.0, unit: "fixed", isDefault: false, isActive: true },
      { tenantId: apexTenant.id, name: "Framed 16R Wall Art Upgrade", description: "Upgrade standard print to luxury 16R solid wood frame", price: 180.0, unit: "fixed", isDefault: false, isActive: true },
      { tenantId: apexTenant.id, name: "Instant Same-Day Express Retouch", description: "Select top 5 photos for same-day digital dispatch", price: 150.0, unit: "fixed", isDefault: false, isActive: true },
      { tenantId: apexTenant.id, name: "Full Soft Copies Pendrive (USB-C)", description: "Archival metallic thumb drive containing all uncompressed originals", price: 120.0, unit: "fixed", isDefault: false, isActive: true },
    ],
  });

  // ============================================================================
  // 7. FRAME DESIGNS & PRINT SIZES (WALL ART VISUALIZER)
  // ============================================================================
  await prisma.frameDesign.createMany({
    data: [
      // Lumina
      { id: "frm_lum_black", tenantId: luminaTenant.id, name: "Matte Black Minimalist", material: "Solid Wood", moldingWidth: 1.25, frameColor: "#18181b", previewAsset: "/uploads/frames/matte-black.png", priceOffset: 0.0, isAvailable: true },
      { id: "frm_lum_walnut", tenantId: luminaTenant.id, name: "Warm Walnut Shadowbox", material: "Hardwood", moldingWidth: 1.75, frameColor: "#4a2e1b", previewAsset: "/uploads/frames/warm-walnut.png", priceOffset: 45.0, isAvailable: true },
      { id: "frm_lum_gold", tenantId: luminaTenant.id, name: "Champagne Gold Leaf", material: "Wood/Gilt", moldingWidth: 2.0, frameColor: "#c5a059", previewAsset: "/uploads/frames/champagne-gold.png", priceOffset: 75.0, isAvailable: true },
      // Apex
      { id: "frm_apx_black", tenantId: apexTenant.id, name: "Contemporary Matte Black", material: "Aluminum", moldingWidth: 1.0, frameColor: "#0f172a", previewAsset: "/uploads/frames/apex-black.png", priceOffset: 0.0, isAvailable: true },
      { id: "frm_apx_gold", tenantId: apexTenant.id, name: "Ornate Royal Gold", material: "Carved Wood", moldingWidth: 2.25, frameColor: "#d4af37", previewAsset: "/uploads/frames/apex-gold.png", priceOffset: 60.0, isAvailable: true },
      { id: "frm_apx_teak", tenantId: apexTenant.id, name: "Malaysian Teak Natural", material: "Solid Teak", moldingWidth: 1.5, frameColor: "#78350f", previewAsset: "/uploads/frames/apex-teak.png", priceOffset: 40.0, isAvailable: true },
    ],
  });

  await prisma.printSize.createMany({
    data: [
      // Lumina (USD)
      { id: "psz_lum_8r", tenantId: luminaTenant.id, code: "8R", name: "8R (8 x 10 in)", widthInches: 8.0, heightInches: 10.0, basePrice: 45.0 },
      { id: "psz_lum_12r", tenantId: luminaTenant.id, code: "12R", name: "12R (12 x 18 in)", widthInches: 12.0, heightInches: 18.0, basePrice: 85.0 },
      { id: "psz_lum_16r", tenantId: luminaTenant.id, code: "16R", name: "16R (16 x 24 in)", widthInches: 16.0, heightInches: 24.0, basePrice: 140.0 },
      { id: "psz_lum_20r", tenantId: luminaTenant.id, code: "20R", name: "20R (20 x 30 in)", widthInches: 20.0, heightInches: 30.0, basePrice: 220.0 },
      // Apex (MYR)
      { id: "psz_apx_8r", tenantId: apexTenant.id, code: "8R", name: "8R (8 x 10 in)", widthInches: 8.0, heightInches: 10.0, basePrice: 65.0 },
      { id: "psz_apx_12r", tenantId: apexTenant.id, code: "12R", name: "12R (12 x 18 in)", widthInches: 12.0, heightInches: 18.0, basePrice: 130.0 },
      { id: "psz_apx_16r", tenantId: apexTenant.id, code: "16R", name: "16R (16 x 24 in)", widthInches: 16.0, heightInches: 210.0, basePrice: 210.0 },
      { id: "psz_apx_20r", tenantId: apexTenant.id, code: "20R", name: "20R (20 x 30 in)", widthInches: 20.0, heightInches: 30.0, basePrice: 350.0 },
    ],
  });

  // ============================================================================
  // 8. INVENTORY ITEMS, KIT BUNDLES & KIT BUNDLE ITEMS (BOM)
  // ============================================================================
  const invArri = await prisma.inventoryItem.create({
    data: {
      id: "inv_arri",
      tenantId: luminaTenant.id,
      name: "ARRI Alexa Mini LF Cinema Body",
      sku: "CAM-ARRI-01",
      serialNumber: "ALF-29401",
      discipline: "VIDEOGRAPHY",
      category: "Cameras",
      condition: "EXCELLENT",
      status: "ON_SHOOT",
      dailyRate: 1200.0,
      location: "Vault A1",
    },
  });

  await prisma.inventoryItem.createMany({
    data: [
      { id: "inv_fx6", tenantId: luminaTenant.id, name: "Sony FX6 Full-Frame Cinema Camera", sku: "CAM-FX6-01", serialNumber: "FX6-88192", discipline: "VIDEOGRAPHY", category: "Cameras", condition: "EXCELLENT", status: "AVAILABLE", dailyRate: 350.0, location: "Shelf B2" },
      { id: "inv_a7r5", tenantId: luminaTenant.id, name: "Sony Alpha A7R V (61MP Stills)", sku: "CAM-A7R5-01", serialNumber: "A75-10294", discipline: "PHOTOGRAPHY", category: "Cameras", condition: "EXCELLENT", status: "ON_SHOOT", dailyRate: 180.0, location: "Shelf B3" },
      { id: "inv_gm2470", tenantId: luminaTenant.id, name: "Sony FE 24-70mm f/2.8 GM II", sku: "LNS-2470-01", serialNumber: "GM2-40192", discipline: "UNIVERSAL", category: "Lenses", condition: "EXCELLENT", status: "ON_SHOOT", dailyRate: 65.0, location: "Lens Cabinet 1" },
      { id: "inv_gm50", tenantId: luminaTenant.id, name: "Sony FE 50mm f/1.2 GM", sku: "LNS-5012-01", serialNumber: "GM5-88201", discipline: "UNIVERSAL", category: "Lenses", condition: "EXCELLENT", status: "ON_SHOOT", dailyRate: 55.0, location: "Lens Cabinet 1" },
      { id: "inv_aput", tenantId: luminaTenant.id, name: "Aputure LS 600d Pro Daylight LED", sku: "LGT-600D-01", serialNumber: "APU-99201", discipline: "UNIVERSAL", category: "Lighting", condition: "GOOD", status: "ON_SHOOT", dailyRate: 120.0, location: "Grip Stage" },
      { id: "inv_ronin", tenantId: luminaTenant.id, name: "DJI Ronin 4D 4-Axis Cinema Rig", sku: "GIM-RON4D-01", serialNumber: "R4D-19402", discipline: "VIDEOGRAPHY", category: "Support", condition: "GOOD", status: "AVAILABLE", dailyRate: 400.0, location: "Shelf C1" },
      { id: "inv_mavic", tenantId: luminaTenant.id, name: "DJI Mavic 3 Cine 5.1K Drone", sku: "DRN-MAV3-01", serialNumber: "M3C-77192", discipline: "VIDEOGRAPHY", category: "Drones", condition: "EXCELLENT", status: "ON_SHOOT", dailyRate: 250.0, location: "Drone Case D1" },
    ],
  });

  // Apex Inventory
  const invHass = await prisma.inventoryItem.create({
    data: {
      id: "inv_hass",
      tenantId: apexTenant.id,
      name: "Hasselblad X2D 100C Medium Format",
      sku: "CAM-HASS-01",
      serialNumber: "X2D-55192",
      discipline: "PHOTOGRAPHY",
      category: "Cameras",
      condition: "EXCELLENT",
      status: "AVAILABLE",
      dailyRate: 450.0,
      location: "Studio Safe 1",
    },
  });

  const invXcd55 = await prisma.inventoryItem.create({
    data: {
      id: "inv_xcd55",
      tenantId: apexTenant.id,
      name: "Hasselblad XCD 55mm f/2.5 V",
      sku: "LNS-XCD55-01",
      serialNumber: "XCD-11920",
      discipline: "PHOTOGRAPHY",
      category: "Lenses",
      condition: "EXCELLENT",
      status: "AVAILABLE",
      dailyRate: 90.0,
      location: "Studio Safe 1",
    },
  });

  const invElin = await prisma.inventoryItem.create({
    data: {
      id: "inv_elin",
      tenantId: apexTenant.id,
      name: "Elinchrom ELC 500 Studio Strobes",
      sku: "LGT-ELIN-01",
      serialNumber: "ELC-33829",
      discipline: "PHOTOGRAPHY",
      category: "Lighting",
      condition: "GOOD",
      status: "AVAILABLE",
      dailyRate: 140.0,
      location: "Bay 2 Strobe Rack",
    },
  });

  // Kit Bundles (BOM)
  const kitLuminaAcam = await prisma.kitBundle.create({
    data: {
      id: "kit_lum_acam",
      tenantId: luminaTenant.id,
      name: "Cinema A-Cam Package (ARRI LF)",
      description: "Primary A-Cam cinema package for commercial shoots.",
      discipline: "VIDEOGRAPHY",
      dailyRate: 1500.0,
    },
  });

  await prisma.kitBundleItem.createMany({
    data: [
      { bundleId: kitLuminaAcam.id, itemId: invArri.id, quantity: 1 },
      { bundleId: kitLuminaAcam.id, itemId: "inv_gm2470", quantity: 1 },
      { bundleId: kitLuminaAcam.id, itemId: "inv_ronin", quantity: 1 },
    ],
  });

  const kitApexPortrait = await prisma.kitBundle.create({
    data: {
      id: "kit_apx_portrait",
      tenantId: apexTenant.id,
      name: "Master Medium Format Portrait Rig",
      description: "100MP medium-format studio kit for convocation & heirloom family portraiture.",
      discipline: "PHOTOGRAPHY",
      dailyRate: 600.0,
    },
  });

  await prisma.kitBundleItem.createMany({
    data: [
      { bundleId: kitApexPortrait.id, itemId: invHass.id, quantity: 1 },
      { bundleId: kitApexPortrait.id, itemId: invXcd55.id, quantity: 1 },
      { bundleId: kitApexPortrait.id, itemId: invElin.id, quantity: 1 },
    ],
  });

  // ============================================================================
  // 9. SHOWCASE ITEMS (PORTFOLIO CMS)
  // ============================================================================
  await prisma.showcaseItem.createMany({
    data: [
      // Lumina
      {
        id: "show_lum_1",
        tenantId: luminaTenant.id,
        category: "commercial",
        title: "Aurora Haute Couture — Fall Narrative",
        clientName: "Aurora Apparel",
        discipline: "HYBRID",
        coverImageUrl: "/uploads/showcase/lumina_showcase_01.jpg",
        galleryImages: JSON.stringify(["/uploads/showcase/lumina_01_a.jpg", "/uploads/showcase/lumina_01_b.jpg"]),
        servicePackageId: pkgLuminaComm.id,
        isFeatured: true,
        sortOrder: 1,
      },
      {
        id: "show_lum_2",
        tenantId: luminaTenant.id,
        category: "weddings",
        title: "Lake Como Villa Heirloom Cinema Film",
        clientName: "Julian & Clara",
        discipline: "VIDEOGRAPHY",
        coverImageUrl: "/uploads/showcase/lumina_showcase_02.jpg",
        videoEmbedUrl: "https://player.vimeo.com/video/sample1",
        servicePackageId: pkgLuminaWed.id,
        isFeatured: true,
        sortOrder: 2,
      },
      // Apex
      {
        id: "show_apx_1",
        tenantId: apexTenant.id,
        category: "convocation",
        title: "Universiti Malaya Class of 2025 Portraits",
        clientName: "Dr. Hazim & Faculty",
        discipline: "PHOTOGRAPHY",
        coverImageUrl: "/uploads/showcase/apex_convo_showcase.jpg",
        galleryImages: JSON.stringify(["/uploads/showcase/apex_convo_01.jpg", "/uploads/showcase/apex_convo_02.jpg"]),
        servicePackageId: pkgApexConvo.id,
        isFeatured: true,
        sortOrder: 1,
      },
      {
        id: "show_apx_2",
        tenantId: apexTenant.id,
        category: "hari-raya",
        title: "The Syed Family Syawal Homecoming",
        clientName: "The Syed Family",
        discipline: "PHOTOGRAPHY",
        coverImageUrl: "/uploads/showcase/apex_raya_showcase.jpg",
        servicePackageId: pkgApexRaya.id,
        isFeatured: true,
        sortOrder: 2,
      },
    ],
  });

  // ============================================================================
  // 10. BOOKING SLOTS & CLIENT BOOKINGS
  // ============================================================================
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const dayAfter = new Date(Date.now() + 48 * 3600 * 1000);
  const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  // Lumina Slots
  await prisma.bookingSlot.create({
    data: {
      id: "slt_lum_1",
      tenantId: luminaTenant.id,
      category: "commercial",
      date: tomorrow,
      startTime: "10:00 AM",
      endTime: "12:00 PM",
      status: "AVAILABLE",
      price: 1200.0,
      depositRequired: 600.0,
    },
  });

  // HELD slot to test 10-minute slot countdown timer!
  await prisma.bookingSlot.create({
    data: {
      id: "slt_lum_2",
      tenantId: luminaTenant.id,
      category: "commercial",
      date: tomorrow,
      startTime: "02:00 PM",
      endTime: "04:00 PM",
      status: "HELD",
      heldUntil: new Date(Date.now() + 8 * 60 * 1000), // 8 mins left
      heldBySessionId: "sess_client_demo_hold",
      price: 1200.0,
      depositRequired: 600.0,
    },
  });

  const sltLum3 = await prisma.bookingSlot.create({
    data: {
      id: "slt_lum_3",
      tenantId: luminaTenant.id,
      category: "studio-portrait",
      date: dayAfter,
      startTime: "10:00 AM",
      endTime: "12:00 PM",
      status: "PENDING_VERIFICATION",
      price: 1200.0,
      depositRequired: 600.0,
    },
  });

  const sltLum4 = await prisma.bookingSlot.create({
    data: {
      id: "slt_lum_4",
      tenantId: luminaTenant.id,
      category: "commercial",
      date: nextWeek,
      startTime: "09:00 AM",
      endTime: "05:00 PM",
      status: "BOOKED",
      price: 6500.0,
      depositRequired: 3250.0,
    },
  });

  await prisma.bookingSlot.create({
    data: {
      id: "slt_lum_5",
      tenantId: luminaTenant.id,
      category: "commercial",
      campaignTitle: "Studio Lens Calibration & Maintenance",
      date: nextWeek,
      startTime: "08:00 AM",
      endTime: "06:00 PM",
      status: "BLOCKED",
      price: 0.0,
      depositRequired: 0.0,
    },
  });

  // Apex Slots
  await prisma.bookingSlot.create({
    data: {
      id: "slt_apx_1",
      tenantId: apexTenant.id,
      category: "convocation",
      date: tomorrow,
      startTime: "10:00 AM",
      endTime: "10:45 AM",
      status: "AVAILABLE",
      price: 450.0,
      depositRequired: 150.0,
    },
  });

  await prisma.bookingSlot.create({
    data: {
      id: "slt_apx_2",
      tenantId: apexTenant.id,
      category: "convocation",
      date: tomorrow,
      startTime: "11:00 AM",
      endTime: "11:45 AM",
      status: "AVAILABLE",
      price: 450.0,
      depositRequired: 150.0,
    },
  });

  await prisma.bookingSlot.create({
    data: {
      id: "slt_apx_3",
      tenantId: apexTenant.id,
      category: "convocation",
      date: tomorrow,
      startTime: "02:00 PM",
      endTime: "02:45 PM",
      status: "HELD",
      heldUntil: new Date(Date.now() + 4 * 60 * 1000), // 4 mins left
      heldBySessionId: "sess_apex_convo_hold",
      price: 450.0,
      depositRequired: 150.0,
    },
  });

  const sltApx4 = await prisma.bookingSlot.create({
    data: {
      id: "slt_apx_4",
      tenantId: apexTenant.id,
      category: "hari-raya",
      date: dayAfter,
      startTime: "11:00 AM",
      endTime: "12:30 PM",
      status: "PENDING_VERIFICATION",
      price: 850.0,
      depositRequired: 300.0,
    },
  });

  const sltApx5 = await prisma.bookingSlot.create({
    data: {
      id: "slt_apx_5",
      tenantId: apexTenant.id,
      category: "convocation",
      date: nextWeek,
      startTime: "02:00 PM",
      endTime: "03:30 PM",
      status: "BOOKED",
      price: 450.0,
      depositRequired: 150.0,
    },
  });

  // Client Bookings
  await prisma.clientBooking.createMany({
    data: [
      {
        id: "cb_lum_1",
        tenantId: luminaTenant.id,
        trackingCode: "BK-LUMINA-781",
        category: "commercial",
        clientName: "Elena Rostova",
        clientEmail: "elena@luxurybrand.com",
        clientPhone: "+1 (555) 876-5432",
        discipline: "HYBRID",
        serviceTier: "Cinematic Brand Hero Campaign",
        status: "CONFIRMED",
        depositPaid: true,
        depositAmount: 3250.0,
        paymentMethod: "CARD",
        slotId: sltLum4.id,
        userId: luminaClient1.id,
      },
      {
        id: "cb_lum_2",
        tenantId: luminaTenant.id,
        trackingCode: "BK-LUMINA-782",
        category: "studio-portrait",
        clientName: "Julian Sterling",
        clientEmail: "julian@sterlingholdings.com",
        clientPhone: "+1 (555) 987-6543",
        discipline: "PHOTOGRAPHY",
        serviceTier: "Executive Editorial & Brand Stills",
        status: "PENDING",
        depositPaid: false,
        depositAmount: 600.0,
        paymentMethod: "QR_CODE",
        slotId: sltLum3.id,
        userId: luminaClient2.id,
      },
      {
        id: "cb_apx_1",
        tenantId: apexTenant.id,
        trackingCode: "BK-APEX-901",
        category: "hari-raya",
        clientName: "Dato' Kamarudin",
        clientEmail: "kamarudin@familygroup.my",
        clientPhone: "+60 12-998 8776",
        discipline: "PHOTOGRAPHY",
        serviceTier: "Hari Raya Family Heirloom Session",
        status: "PENDING",
        depositPaid: false,
        depositAmount: 300.0,
        paymentMethod: "QR_CODE",
        slotId: sltApx4.id,
        userId: apexClient2.id,
      },
      {
        id: "cb_apx_2",
        tenantId: apexTenant.id,
        trackingCode: "BK-APEX-902",
        category: "convocation",
        clientName: "Farah Nadiah",
        clientEmail: "farah@graduate.utm.my",
        clientPhone: "+60 19-876 5432",
        discipline: "PHOTOGRAPHY",
        serviceTier: "Convocation Studio Deluxe",
        status: "CONFIRMED",
        depositPaid: true,
        depositAmount: 150.0,
        paymentMethod: "CARD",
        slotId: sltApx5.id,
        userId: apexClient1.id,
      },
    ],
  });

  // ============================================================================
  // 11. PROPOSALS & PROPOSAL ADD-ONS
  // ============================================================================
  const proposalLumina = await prisma.proposal.create({
    data: {
      id: "prop_lumina_01",
      tenantId: luminaTenant.id,
      proposalNumber: "PR-2026-081",
      clientId: luminaClient1.id,
      studioId: luminaOwner.id,
      title: "Aurora Luxury Apparel — Fall Campaign Commercial Production",
      category: "commercial",
      discipline: "HYBRID",
      basePrice: 6500.0,
      totalPrice: 7300.0,
      depositPercentage: 50.0,
      depositAmount: 3650.0,
      finalBalanceAmount: 3650.0,
      status: "ACCEPTED",
      contractTerms: "Includes full dual-camera 4K commercial production, drone aerial permissions, color grading, sound design, and master delivery. Client agrees that master 4K ProRes and RAW assets remain gated behind the final 50% milestone settlement.",
      clientSignature: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cGF0aCBkPSJNMTAgODAgQyA0MCAxMCwgNjUgMTAsIDk1IDgwIiBzdHJva2U9ImJsYWNrIiBmaWxsPSJ0cmFuc3BhcmVudCIvPjwvc3ZnPg==",
      signedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    },
  });

  await prisma.proposalAddOn.createMany({
    data: [
      { proposalId: proposalLumina.id, name: "Drone 4K Aerial Coverage", description: "FAA Part 107 licensed drone aerial footage", price: 450.0, unit: "fixed", quantity: 1, isSelected: true },
      { proposalId: proposalLumina.id, name: "RAW Footage SSD Master Drive", description: "Encrypted 2TB NVMe drive with all unedited camera originals", price: 350.0, unit: "fixed", quantity: 1, isSelected: true },
      { proposalId: proposalLumina.id, name: "Second Camera Operator", description: "Dedicated B-Cam cinematographer for full day", price: 800.0, unit: "per_day", quantity: 1, isSelected: false },
    ],
  });

  const proposalLumina2 = await prisma.proposal.create({
    data: {
      id: "prop_lumina_02",
      tenantId: luminaTenant.id,
      proposalNumber: "PR-2026-085",
      clientId: luminaClient2.id,
      studioId: luminaOwner.id,
      title: "Sterling Autumn Commercial & Brand Editorial",
      category: "commercial",
      discipline: "HYBRID",
      basePrice: 5200.0,
      totalPrice: 5200.0,
      depositPercentage: 50.0,
      depositAmount: 2600.0,
      finalBalanceAmount: 2600.0,
      status: "SENT",
      contractTerms: "Complete studio editorial session with commercial licensing. Full 4K dual camera setup with sound and color grade. 50% deposit locks shoot dates.",
    },
  });

  await prisma.proposalAddOn.createMany({
    data: [
      { proposalId: proposalLumina2.id, name: "Drone 4K Aerial Coverage", description: "FAA Part 107 licensed drone aerial footage", price: 450.0, unit: "fixed", quantity: 1, isSelected: false },
      { proposalId: proposalLumina2.id, name: "RAW Footage SSD Master Drive", description: "Encrypted 2TB NVMe drive with all unedited camera originals", price: 350.0, unit: "fixed", quantity: 1, isSelected: false },
      { proposalId: proposalLumina2.id, name: "Second Camera Operator", description: "Dedicated B-Cam cinematographer for full day", price: 800.0, unit: "per_day", quantity: 1, isSelected: false },
      { proposalId: proposalLumina2.id, name: "48-Hour Rush Delivery", description: "Expedited edit and master color delivery", price: 500.0, unit: "fixed", quantity: 1, isSelected: false },
    ],
  });

  const proposalApex = await prisma.proposal.create({
    data: {
      id: "prop_apex_01",
      tenantId: apexTenant.id,
      proposalNumber: "PR-2026-092",
      clientId: apexClient1.id,
      studioId: apexOwner.id,
      title: "UTM Graduate Faculty Convocation Commemorative Package",
      category: "convocation",
      discipline: "PHOTOGRAPHY",
      basePrice: 450.0,
      totalPrice: 630.0,
      depositPercentage: 50.0,
      depositAmount: 315.0,
      finalBalanceAmount: 315.0,
      status: "ACCEPTED",
      contractTerms: "Includes 45-minute studio portrait session, gown rental, family portraits, and 16R framed print.",
      clientSignature: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cGF0aCBkPSJNMTAgOTAgQyAzMCAzMCwgNzAgMzAsIDkwIDkwIiBzdHJva2U9ImJsYWNrIiBmaWxsPSJ0cmFuc3BhcmVudCIvPjwvc3ZnPg==",
      signedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
    },
  });

  await prisma.proposalAddOn.create({
    data: {
      proposalId: proposalApex.id,
      name: "Framed 16R Wall Art Upgrade",
      description: "Upgrade standard print to luxury 16R solid wood frame",
      price: 180.0,
      unit: "fixed",
      quantity: 1,
      isSelected: true,
    },
  });

  // ============================================================================
  // 12. PROJECTS
  // ============================================================================
  // Project 1: Lumina CineWorks (Paywall Active!)
  const projectLumina = await prisma.project.create({
    data: {
      id: "proj_lumina_01",
      tenantId: luminaTenant.id,
      projectNumber: "PJ-2026-001",
      title: "Aurora Luxury Apparel Fall Campaign",
      category: "commercial",
      clientId: luminaClient1.id,
      studioLeadId: luminaOwner.id,
      discipline: "HYBRID",
      proposalId: proposalLumina.id,
      status: "PRODUCTION",
      budget: 7300.0,
      isFinalBalancePaid: false, // CRITICAL: PAYWALL ACTIVE
    },
  });

  // Project 2: Apex Photo & Motion (Paywall Cleared / Masters Unlocked!)
  const projectApex = await prisma.project.create({
    data: {
      id: "proj_apex_01",
      tenantId: apexTenant.id,
      projectNumber: "PJ-2026-044",
      title: "Farah Nadiah UTM Convocation Commemorative",
      category: "convocation",
      clientId: apexClient1.id,
      studioLeadId: apexOwner.id,
      discipline: "PHOTOGRAPHY",
      proposalId: proposalApex.id,
      status: "DELIVERED",
      budget: 630.0,
      isFinalBalancePaid: true, // CRITICAL: PAYWALL SETTLED / MASTERS UNLOCKED
    },
  });

  // ============================================================================
  // 13. CALL SHEETS, SHOT ITEMS & DIGITAL RELEASES
  // ============================================================================
  await prisma.callSheet.create({
    data: {
      id: "cs_lumina_01",
      projectId: projectLumina.id,
      title: "Day 1: Principal Photography & Fashion Narrative",
      shootDate: new Date("2026-11-15T00:00:00Z"),
      generalCallTime: "06:30 AM",
      locationName: "The Glasshouse Studios, Pavilion 4",
      locationAddress: "124 Innovation Way, Brooklyn, NY 11201",
      locationPinUrl: "https://maps.google.com/?q=40.7001,-73.9850",
      parkingNotes: "Loading dock accessible via Pearl St. Display official CineFlow crew dashboard passes.",
      hospitalName: "New York-Presbyterian Brooklyn Methodist Hospital",
      hospitalAddress: "506 6th St, Brooklyn, NY 11215",
      weatherSummary: "Clear skies, light morning mist, 21°C",
      temperature: "21°C / 70°F",
      sunriseTime: "06:42 AM",
      sunsetTime: "07:15 PM",
      goldenHourMorning: "06:42 AM - 07:30 AM",
      goldenHourEvening: "06:30 PM - 07:15 PM",
      crewJson: JSON.stringify([
        { name: "Alex Vance", role: "Director / Studio Lead", callTime: "06:15 AM", phone: "+1 555-234-5678" },
        { name: "Marcus Vance", role: "Director of Photography", callTime: "06:30 AM", phone: "+1 555-234-5679" },
        { name: "Sarah Tan", role: "Lead Stills Photographer", callTime: "07:00 AM", phone: "+1 555-234-5680" },
        { name: "Liam Ross", role: "Key Grip / Gaffer", callTime: "06:00 AM", phone: "+1 555-234-5681" },
        { name: "Sophia Bennett", role: "Lead Talent / Model", callTime: "07:30 AM", phone: "+1 555-443-2211" },
        { name: "Elena Rostova", role: "Client Representative", callTime: "08:30 AM", phone: "+1 555-876-5432" },
      ]),
    },
  });

  await prisma.shotItem.createMany({
    data: [
      { id: "shot_lum_1", projectId: projectLumina.id, sceneNumber: "SCENE 1", shotNumber: "SHOT 1A", framing: "Wide Establishing", cameraLens: "Sony FE 24-70mm f/2.8 GM II @ 24mm", lightingSetup: "Natural dawn sunlight through arched floor-to-ceiling glass, 8x8 unbleached muslin bounce", description: "Talent enters empty industrial hall; slow motion silhouette against rising sun.", status: "COMPLETED", sortOrder: 1 },
      { id: "shot_lum_2", projectId: projectLumina.id, sceneNumber: "SCENE 1", shotNumber: "SHOT 1B", framing: "Medium Close-up", cameraLens: "Sony FE 50mm f/1.2 GM", lightingSetup: "Key Aputure 600d with Light Dome 150 at 45°, Nanlite Pavotube rim light", description: "Talent profile glance toward camera; wind machine gentle fabric flutter.", status: "IN_PROGRESS", sortOrder: 2 },
      { id: "shot_lum_3", projectId: projectLumina.id, sceneNumber: "SCENE 2", shotNumber: "SHOT 2A", framing: "Macro Detail", cameraLens: "Sony FE 90mm f/2.8 Macro G OSS", lightingSetup: "Profoto B10X Plus with optical snoot highlighting fabric weave", description: "Extreme close-up of handmade cashmere stitching and engraved brass hardware.", status: "PENDING", sortOrder: 3 },
      { id: "shot_lum_4", projectId: projectLumina.id, sceneNumber: "SCENE 3", shotNumber: "SHOT 3A", framing: "Aerial High Angle", cameraLens: "DJI Mavic 3 Cine Hasselblad 24mm", lightingSetup: "Golden hour sunset backlit", description: "Overhead 4K 60fps tracking shot of talent walking across terrace promenade.", status: "PENDING", sortOrder: 4 },
    ],
  });

  await prisma.digitalRelease.createMany({
    data: [
      {
        id: "rel_lum_talent",
        projectId: projectLumina.id,
        releaseType: "TALENT",
        signerName: "Sophia Bennett",
        signerEmail: "sophia@modelmgmt.com",
        signerPhone: "+1 (555) 443-2211",
        signerRole: "Principal Commercial Model",
        termsContent: "I hereby grant Lumina CineWorks and Aurora Luxury Apparel the irrevocable, worldwide right to record, reproduce, and broadcast my likeness, voice, and performance in connection with the Fall Campaign Commercial Production across all digital and print media in perpetuity.",
        signatureDataUrl: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cGF0aCBkPSJNMTAgOTAgQyA0MCAxMCwgNjAgOTAsIDkwIDEwIiBzdHJva2U9ImJsYWNrIiBmaWxsPSJ0cmFuc3BhcmVudCIvPjwvc3ZnPg==",
      },
      {
        id: "rel_lum_location",
        projectId: projectLumina.id,
        releaseType: "LOCATION",
        signerName: "Arthur Pendelton",
        signerEmail: "management@glasshousestudios.com",
        signerRole: "Property Manager",
        termsContent: "Property location release granting filming and photographic rights at 124 Innovation Way for commercial media production.",
        signatureDataUrl: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cGF0aCBkPSJNMTAgNTAgQyAzMCA5MCwgNzAgMTAsIDkwIDUwIiBzdHJva2U9ImJsYWNrIiBmaWxsPSJ0cmFuc3BhcmVudCIvPjwvc3ZnPg==",
      },
    ],
  });

  // ============================================================================
  // 14. EQUIPMENT RESERVATIONS & INSPECTION LOGS
  // ============================================================================
  const resLuminaArri = await prisma.equipmentReservation.create({
    data: {
      id: "res_lumina_arri",
      projectId: projectLumina.id,
      itemId: invArri.id,
      startDate: new Date("2026-11-14T00:00:00Z"),
      endDate: new Date("2026-11-16T00:00:00Z"),
      status: "CHECKED_OUT",
    },
  });

  await prisma.inspectionLog.create({
    data: {
      id: "insp_lum_01",
      reservationId: resLuminaArri.id,
      inspectorName: "Liam Ross (Key Tech)",
      checkoutCondition: "Sensor inspected under 10x LED loupe, pristine. Firmware v7.3 installed. PL-mount shims checked. Codex 1TB cards formatted.",
      notes: "Dispatched in Pelican 1510 with 3x Anton Bauer Dionic batteries.",
    },
  });

  const resApexHass = await prisma.equipmentReservation.create({
    data: {
      id: "res_apex_hass",
      projectId: projectApex.id,
      itemId: invHass.id,
      startDate: new Date("2026-10-20T00:00:00Z"),
      endDate: new Date("2026-10-21T00:00:00Z"),
      status: "RETURNED",
    },
  });

  await prisma.inspectionLog.create({
    data: {
      id: "insp_apx_01",
      reservationId: resApexHass.id,
      inspectorName: "Kevin Lim",
      checkoutCondition: "Battery 100%, 1TB internal SSD clean.",
      checkinCondition: "Returned in pristine condition, zero scuffs, sensor pristine.",
      notes: "Returned to Studio Safe 1.",
    },
  });

  // ============================================================================
  // 15. MILESTONE INVOICES
  // ============================================================================
  await prisma.milestoneInvoice.createMany({
    data: [
      // Lumina
      {
        id: "inv_lum_1",
        tenantId: luminaTenant.id,
        invoiceNumber: "INV-2026-001",
        proposalId: proposalLumina.id,
        projectId: projectLumina.id,
        clientId: luminaClient1.id,
        milestoneType: "RETAINER_50",
        amount: 3650.0,
        status: "PAID",
        paymentMethod: "CARD",
        verifiedBy: "System Auto",
        dueDate: new Date(Date.now() - 3 * 24 * 3600 * 1000),
        paidAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      },
      {
        id: "inv_lum_2",
        tenantId: luminaTenant.id,
        invoiceNumber: "INV-2026-002",
        proposalId: proposalLumina.id,
        projectId: projectLumina.id,
        clientId: luminaClient1.id,
        milestoneType: "FINAL_BALANCE_50",
        amount: 3650.0,
        status: "PENDING", // UNPAID -> GATES PAYWALL
        dueDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
      {
        id: "inv_lum_3",
        tenantId: luminaTenant.id,
        invoiceNumber: "INV-2026-003",
        clientId: luminaClient2.id,
        milestoneType: "BOOKING_DEPOSIT",
        amount: 600.0,
        status: "PENDING_VERIFICATION", // In manual verification console
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/receipt_sample_qr.jpg",
        paymentReference: "CHASE-TRX-8829104",
        dueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000),
      },
      {
        id: "inv_lum_4",
        tenantId: luminaTenant.id,
        invoiceNumber: "INV-2026-004",
        projectId: projectLumina.id,
        clientId: luminaClient1.id,
        milestoneType: "PRINT_FRAME_ORDER",
        amount: 185.0,
        status: "PAID",
        paymentMethod: "CASH",
        verifiedBy: "Sarah Tan",
        dueDate: new Date(Date.now() - 1 * 24 * 3600 * 1000),
        paidAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
      },
      // Apex
      {
        id: "inv_apx_1",
        tenantId: apexTenant.id,
        invoiceNumber: "INV-2026-081",
        proposalId: proposalApex.id,
        projectId: projectApex.id,
        clientId: apexClient1.id,
        milestoneType: "RETAINER_50",
        amount: 315.0,
        status: "PAID",
        paymentMethod: "CARD",
        verifiedBy: "System Auto",
        dueDate: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        paidAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      },
      {
        id: "inv_apx_2",
        tenantId: apexTenant.id,
        invoiceNumber: "INV-2026-082",
        proposalId: proposalApex.id,
        projectId: projectApex.id,
        clientId: apexClient1.id,
        milestoneType: "FINAL_BALANCE_50",
        amount: 315.0,
        status: "PAID", // PAID -> UNLOCKS VAULT MASTERS
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/duitnow_receipt_farah.jpg",
        paymentReference: "DUITNOW-MYR-99201",
        verifiedBy: "David Chong",
        dueDate: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        paidAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      },
      {
        id: "inv_apx_3",
        tenantId: apexTenant.id,
        invoiceNumber: "INV-2026-083",
        clientId: apexClient2.id,
        milestoneType: "BOOKING_DEPOSIT",
        amount: 300.0,
        status: "PENDING_VERIFICATION", // In manual verification console
        paymentMethod: "QR_CODE",
        paymentProofUrl: "/uploads/receipts/duitnow_slip_kamarudin.jpg",
        paymentReference: "CIMB-KL-33019",
        dueDate: new Date(Date.now() + 1 * 24 * 3600 * 1000),
      },
    ],
  });

  // ============================================================================
  // 16. CLIENT DELIVERABLES & DELIVERABLE ITEMS (VAULT)
  // ============================================================================
  const delivLumina = await prisma.clientDeliverable.create({
    data: {
      id: "deliv_lumina_01",
      projectId: projectLumina.id,
      title: "Aurora Fall Campaign Master Vault",
      discipline: "HYBRID",
      versionTag: "v1.0",
      status: "READY",
    },
  });

  await prisma.deliverableItem.createMany({
    data: [
      {
        id: "item_lum_photo_1",
        deliverableId: delivLumina.id,
        itemType: "PHOTO",
        title: "Editorial Stills 01 — Arched Windows",
        previewUrl: "/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg",
        downloadUrl: "/uploads/deliverables/masters/aurora_hero_01_master.jpg",
        thumbnailUrl: "/uploads/deliverables/thumbnails/aurora_hero_01_thumb.jpg",
        resolution: "9504x6336 (61MP)",
        fileSize: "38.4 MB",
        isClientFav: true,
        clientNotes: "Stunning light! Please slightly soften the hair flare.",
      },
      {
        id: "item_lum_photo_2",
        deliverableId: delivLumina.id,
        itemType: "PHOTO",
        title: "Editorial Stills 02 — Portrait Profile",
        previewUrl: "/uploads/deliverables/previews/aurora_hero_02_watermarked.jpg",
        downloadUrl: "/uploads/deliverables/masters/aurora_hero_02_master.jpg",
        thumbnailUrl: "/uploads/deliverables/thumbnails/aurora_hero_02_thumb.jpg",
        resolution: "9504x6336 (61MP)",
        fileSize: "41.2 MB",
        isClientFav: true,
      },
      {
        id: "item_lum_video_1",
        deliverableId: delivLumina.id,
        itemType: "VIDEO",
        title: "60-Second Master Brand Commercial (Director Cut)",
        previewUrl: "/uploads/deliverables/previews/aurora_60s_stream_proxy.mp4",
        downloadUrl: "/uploads/deliverables/masters/aurora_60s_prores422hq_master.mov",
        thumbnailUrl: "/uploads/deliverables/thumbnails/aurora_video_thumb.jpg",
        resolution: "4K DCI (4096x2160)",
        duration: "01:00",
        fileSize: "4.8 GB",
        isClientFav: false,
        clientNotes: "Color grade on the fabric highlights looks magnificent.",
      },
    ],
  });

  const delivApex = await prisma.clientDeliverable.create({
    data: {
      id: "deliv_apex_01",
      projectId: projectApex.id,
      title: "Farah Nadiah UTM Convocation Commemorative Vault",
      discipline: "PHOTOGRAPHY",
      versionTag: "v1.0",
      status: "READY",
    },
  });

  await prisma.deliverableItem.createMany({
    data: [
      {
        id: "item_apx_photo_1",
        deliverableId: delivApex.id,
        itemType: "PHOTO",
        title: "Convocation Hero Academic Robes",
        previewUrl: "/uploads/deliverables/previews/farah_convo_01_preview.jpg",
        downloadUrl: "/uploads/deliverables/masters/farah_convo_01_master.jpg",
        thumbnailUrl: "/uploads/deliverables/thumbnails/farah_convo_01_thumb.jpg",
        resolution: "8192x5464",
        fileSize: "26.5 MB",
        isClientFav: true,
        clientNotes: "Ordered 1x 12R Teak frame from this one!",
      },
      {
        id: "item_apx_photo_2",
        deliverableId: delivApex.id,
        itemType: "PHOTO",
        title: "Multi-Generation Family Portrait",
        previewUrl: "/uploads/deliverables/previews/farah_family_02_preview.jpg",
        downloadUrl: "/uploads/deliverables/masters/farah_family_02_master.jpg",
        thumbnailUrl: "/uploads/deliverables/thumbnails/farah_family_02_thumb.jpg",
        resolution: "8192x5464",
        fileSize: "28.9 MB",
        isClientFav: true,
      },
    ],
  });

  console.log("✓ All 24 models successfully populated across both studios!");
  console.log("🎉 Seeding complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
