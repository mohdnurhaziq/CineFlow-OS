# CineFlow OS — Server Actions & API Specification

**Document Version**: 1.0.0  
**Pattern**: Next.js 15 Server Actions (`"use server"`) with Zod Input Validation  

---

## 1. Authentication & Session Actions (`src/server/actions/auth.ts`)

### `registerClient(formData: z.infer<typeof RegisterClientSchema>)`
- **Purpose**: Ultra-lean 3-field registration for new clients on the public website.
- **Input**:
  - `name`: string (min 2)
  - `email`: string (valid email)
  - `phone`: string (min 7)
  - `password`: string (min 6)
  - `tenantId`: string
- **Output**: `{ success: boolean, userId: string, redirectUrl: string }`
- **Errors**: `EMAIL_ALREADY_EXISTS`, `INVALID_INPUT`

### `quickCreateClient(formData: z.infer<typeof QuickClientSchema>)`
- **Purpose**: Studio admin creates a client with 3 fields; system generates an email invite token.
- **Input**:
  - `tenantId`: string
  - `name`: string
  - `email`: string
  - `phone`: string
- **Output**: `{ success: boolean, userId: string, inviteUrl: string, token: string }`

### `setupPasswordWithInvite(formData: z.infer<typeof SetupPasswordSchema>)`
- **Purpose**: First-time password creation by a quick-added client via magic link.
- **Input**:
  - `token`: string
  - `password`: string (min 6)
- **Output**: `{ success: boolean, redirectUrl: string }`

---

## 2. Cinema-Style Booking Actions (`src/server/actions/booking.ts`)

### `holdBookingSlot(slotId: string, sessionId: string)`
- **Purpose**: Atomically places a 10-minute hold lock on an available time slot.
- **Input**:
  - `slotId`: string
  - `sessionId`: string (client browser session identifier)
- **Operation**:
  ```typescript
  // Atomic conditional update
  const held = await prisma.bookingSlot.updateMany({
    where: {
      id: slotId,
      OR: [
        { status: "AVAILABLE" },
        { status: "HELD", heldUntil: { lt: new Date() } }
      ]
    },
    data: {
      status: "HELD",
      heldUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      heldBySessionId: sessionId
    }
  });
  ```
- **Output**: `{ success: boolean, heldUntil: string }`
- **Errors**: `SLOT_ALREADY_HELD_OR_BOOKED`

### `releaseBookingSlot(slotId: string, sessionId: string)`
- **Purpose**: Releases a held slot early if the user cancels or navigates away.
- **Input**: `slotId: string`, `sessionId: string`
- **Output**: `{ success: boolean }`

### `confirmBookingWithDeposit(data: z.infer<typeof ConfirmBookingSchema>)`
- **Purpose**: Completes checkout, converts slot to `BOOKED` (or `PENDING_VERIFICATION` if QR/Cash), creates booking record and deposit invoice.
- **Input**:
  - `tenantId`: string
  - `slotId`: string
  - `clientName`: string
  - `clientEmail`: string
  - `clientPhone`: string
  - `serviceTier`: string
  - `category`: string
  - `paymentMethod`: `"CARD"` | `"QR_CODE"` | `"CASH"`
  - `paymentReference`: string?
  - `depositAmount`: number
- **Output**: `{ success: boolean, bookingId: string, trackingCode: string, invoiceId: string }`

---

## 3. Milestone Billing & Payment Verification Actions (`src/server/actions/payments.ts`)

### `submitQRPaymentProof(invoiceId: string, referenceCode: string, proofUrl?: string)`
- **Purpose**: Client submits bank transaction reference code after scanning the studio QR code.
- **Input**: `invoiceId: string`, `referenceCode: string`, `proofUrl?: string`
- **Output**: `{ success: boolean, status: "PENDING_VERIFICATION" }`

### `verifyManualPayment(invoiceId: string, staffName: string, method: "QR_CODE" | "CASH" | "BANK_TRANSFER", notes?: string)`
- **Purpose**: Studio staff verifies that QR funds or cash in hand were received.
- **Input**:
  - `invoiceId`: string
  - `staffName`: string
  - `method`: `"QR_CODE"` | `"CASH"` | `"BANK_TRANSFER"`
  - `notes`: string?
- **Operations**:
  1. Sets `MilestoneInvoice` status to `PAID`.
  2. If linked to `BookingSlot`, sets slot status to `BOOKED`.
  3. If linked to `Project` final balance, sets `Project.isFinalBalancePaid = true`, instantly unlocking the deliverables paywall.
- **Output**: `{ success: boolean, invoiceNumber: string, unlockedDownloads: boolean }`

---

## 4. Interactive Proposal Actions (`src/server/actions/proposals.ts`)

### `toggleProposalAddOn(proposalId: string, addOnId: string, isSelected: boolean)`
- **Purpose**: Toggles optional add-ons on the proposal and recalculates totals and contract clauses live.
- **Input**: `proposalId: string`, `addOnId: string`, `isSelected: boolean`
- **Output**:
  ```typescript
  {
    success: boolean,
    totalPrice: number,
    depositAmount: number,
    finalBalanceAmount: number,
    contractTerms: string
  }
  ```

### `signAndAcceptProposal(proposalId: string, signatureDataUrl: string)`
- **Purpose**: Client signs proposal digitally, initializes the live project, and triggers the 50% Retainer Milestone Invoice.
- **Input**: `proposalId: string`, `signatureDataUrl: string`
- **Output**: `{ success: boolean, projectId: string, retainerInvoiceId: string }`

---

## 5. Pre-Production & On-Set Logistics Actions (`src/server/actions/logistics.ts`)

### `calculateGoldenHour(latitude: number, longitude: number, date: string)`
- **Purpose**: Calculates precise solar timings for natural light photography & cinematography.
- **Output**:
  ```typescript
  {
    sunrise: string,           // e.g. "06:48 AM"
    sunset: string,            // e.g. "07:14 PM"
    goldenHourMorning: string, // e.g. "06:48 AM - 07:35 AM"
    goldenHourEvening: string  // e.g. "06:25 PM - 07:14 PM"
  }
  ```

### `generateWhatsAppCallSheetDispatch(callSheetId: string)`
- **Purpose**: Generates pre-formatted `wa.me/?text=...` link for 1-click broadcast to crew and cast.
- **Output**: `{ success: boolean, whatsappUrl: string, messagePreview: string }`

### `toggleShotCompletion(shotId: string, status: "PENDING" | "IN_PROGRESS" | "COMPLETED")`
- **Purpose**: On-set mobile check-off action for camera operators and DPs.
- **Output**: `{ success: boolean, completedShots: number, totalShots: number, percentage: number }`

### `submitDigitalRelease(data: z.infer<typeof DigitalReleaseSchema>)`
- **Purpose**: Captures touchscreen signatures from models, actors, or property owners on set.
- **Input**:
  - `projectId`: string
  - `releaseType`: `"TALENT"` | `"LOCATION"`
  - `signerName`: string
  - `signerEmail`: string
  - `signerPhone`: string?
  - `signatureDataUrl`: string
  - `termsContent`: string
- **Output**: `{ success: boolean, releaseId: string }`

---

## 6. Deliverables Vault & Print Visualizer Actions (`src/server/actions/deliverables.ts`)

### `toggleClientFavorite(itemId: string, isFav: boolean)`
- **Purpose**: Client hearts a photo select in their private gallery.
- **Output**: `{ success: boolean, isClientFav: boolean }`

### `submitRetouchNote(itemId: string, note: string)`
- **Purpose**: Client adds retouching or revision feedback to a photo or video cut.
- **Output**: `{ success: boolean }`

### `orderFramedPrint(data: z.infer<typeof FramedPrintOrderSchema>)`
- **Purpose**: Converts visualized framed photo into a print order with an add-on milestone invoice.
- **Input**:
  - `tenantId`: string
  - `projectId`: string
  - `itemId`: string
  - `frameDesignId`: string
  - `printSizeCode`: string
  - `totalPrice`: number
- **Output**: `{ success: boolean, invoiceId: string }`

---

## 7. Dynamic Settings CRUD Actions (`src/server/actions/settings.ts`)

Full CRUD actions for:
- `createServicePackage`, `updateServicePackage`, `deleteServicePackage`
- `createCampaignCategory`, `updateCampaignCategory`, `deleteCampaignCategory`
- `createBookingSlotsBatch`, `deleteBookingSlot`, `blockDateRange`
- `createFrameDesign`, `updateFrameDesign`, `deleteFrameDesign`
- `createPrintSize`, `updatePrintSize`, `deletePrintSize`
- `createProposalAddOnTemplate`, `updateProposalAddOnTemplate`, `deleteProposalAddOnTemplate`
- `createInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`
- `createKitBundle`, `updateKitBundle`, `deleteKitBundle`
- `updateStudioSettings` (logo, custom domain, QR code image, bank details, brand color)
