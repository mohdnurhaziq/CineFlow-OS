/**
 * Whether a person has taken up their account in a studio: they set a password for it, or it is
 * joined to their one login. A studio-made account nobody has taken up yet (a pending invite) is
 * neither. Plain module: safe in server and client code.
 */
export function hasSetUp(user: { passwordHash: string | null; loginId?: string | null }): boolean {
  return user.passwordHash != null || user.loginId != null;
}
