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

const MemberName = z.string().trim().min(1, "Enter their name.").max(80, "A name can be up to 80 characters.");
const MemberEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254, "That email address is too long.");
const MemberIds = { ...Ids, userId: z.string().min(1) };

export const InviteTeamMemberSchema = z.object({
  ...Ids,
  name: MemberName,
  email: MemberEmail,
  roleId: z.string().min(1, "Pick a role."),
  extraAccess: AccessInput.nullish(),
});
export const UpdateTeamMemberSchema = z.object({
  ...MemberIds,
  name: MemberName,
  roleId: z.string().min(1, "Pick a role."),
  extraAccess: AccessInput.nullish(),
});
export const TeamMemberRefSchema = z.object(MemberIds);

export type CreateTeamRoleInput = z.input<typeof CreateTeamRoleSchema>;
export type UpdateTeamRoleInput = z.input<typeof UpdateTeamRoleSchema>;
export type DeleteTeamRoleInput = z.input<typeof DeleteTeamRoleSchema>;
export type InviteTeamMemberInput = z.input<typeof InviteTeamMemberSchema>;
export type UpdateTeamMemberInput = z.input<typeof UpdateTeamMemberSchema>;
export type TeamMemberRefInput = z.input<typeof TeamMemberRefSchema>;
