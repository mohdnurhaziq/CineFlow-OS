import { z } from "zod";
import { MY_STATES } from "@/lib/prints/states";

const CartItemSchema = z
  .object({
    kind: z.enum(["INCLUDED", "PAID"]),
    bookingIncludedPrintId: z.string().min(1).optional(),
    deliverableItemId: z.string().min(1, "Choose a photo for every print."),
    orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
    printSizeId: z.string().min(1, "Choose a size for every print."),
    frameDesignId: z.string().min(1, "Choose a frame for every print."),
    matBoardType: z.enum(["NONE", "WHITE_2INCH", "OFFWHITE_2INCH"]),
  })
  .refine((i) => i.kind !== "INCLUDED" || !!i.bookingIncludedPrintId, {
    message: "An included print must say which included print it uses.",
  });

const AddressSchema = z.object({
  recipientName: z.string().trim().min(2, "Enter the recipient's name.").max(100),
  recipientPhone: z.string().trim().min(6, "Enter a phone number for the courier.").max(30),
  line1: z.string().trim().min(3, "Enter the delivery address.").max(200),
  line2: z.string().trim().max(200).optional(),
  postcode: z.string().trim().regex(/^\d{5}$/, "Postcode must be 5 digits."),
  city: z.string().trim().min(2, "Enter the city.").max(100),
  state: z.enum(MY_STATES, { message: "Choose a Malaysian state." }),
});

export const PlaceOrderSchema = z
  .object({
    tenantId: z.string().min(1, "Tenant ID is required"),
    tenantSlug: z.string().min(1, "Tenant slug is required"),
    projectId: z.string().min(1, "Project is required"),
    items: z.array(CartItemSchema).min(1, "Add at least one print.").max(20, "An order can have at most 20 prints."),
    fulfilment: z.enum(["PICKUP", "SHIP"]),
    address: AddressSchema.optional(),
    saveAddress: z.boolean().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.fulfilment !== "SHIP" || !!v.address, {
    message: "Enter a delivery address, or choose pickup.",
    path: ["address"],
  });

export type CartItemInput = z.input<typeof CartItemSchema>;
export type PlaceOrderInput = z.input<typeof PlaceOrderSchema>;
export type PlaceOrderValues = z.output<typeof PlaceOrderSchema>;
