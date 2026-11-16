import { z } from "zod";

const Ids = {
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
};

const AreaLevel = z.enum(["NONE", "OWN", "VIEW", "MANAGE"]);

// Stored access is re-read through parseAccess, so unknown keys and invalid levels are harmless.
const AccessInput = z.object({
  areas: z.record(z.string(), AreaLevel),
  ticks: z.record(z.string(), z.boolean()),
});

const RoleName = z.string().trim().min(1, "Give the role a name.").max(40, "A role name can be up to 40 characters.");

export const CreateTeamRoleSchema = z.object({ ...Ids, name: RoleName, access: AccessInput });
export const UpdateTeamRoleSchema = z.object({ ...Ids, roleId: z.string().min(1), name: RoleName, access: AccessInput });
export const DeleteTeamRoleSchema = z.object({ ...Ids, roleId: z.string().min(1) });

export type CreateTeamRoleInput = z.input<typeof CreateTeamRoleSchema>;
export type UpdateTeamRoleInput = z.input<typeof UpdateTeamRoleSchema>;
export type DeleteTeamRoleInput = z.input<typeof DeleteTeamRoleSchema>;
