import { z } from "zod";
import { MY_STATES } from "@/lib/prints/states";

const ZoneSchema = z.object({
  name: z.string().trim().min(1, "Every shipping zone needs a name.").max(60),
  fee: z.coerce.number({ message: "Shipping fee must be more than 0." }).gt(0, "Shipping fee must be more than 0.").max(100000),
  states: z.array(z.string()).superRefine((states, ctx) => {
    for (const s of states) {
      if (!(MY_STATES as readonly string[]).includes(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${s} is not a Malaysian state.` });
      }
    }
  }),
});

export const SaveShippingZonesSchema = z
  .object({
    tenantId: z.string().min(1, "Tenant ID is required"),
    tenantSlug: z.string().min(1, "Tenant slug is required"),
    zones: z.array(ZoneSchema).max(20),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    for (const zone of val.zones) {
      for (const s of zone.states) {
        if (seen.has(s)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${s} is in two zones.` });
          return;
        }
        seen.add(s);
      }
    }
  });

export type SaveShippingZonesInput = z.input<typeof SaveShippingZonesSchema>;
