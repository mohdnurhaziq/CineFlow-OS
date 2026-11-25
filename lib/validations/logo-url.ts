/**
 * A studio logo is always a file uploaded to this app, never a link to another site: a pasted link
 * can break, change, or point at something that tracks the studio's visitors. Uploads are saved as
 * /uploads/<folder>/<name>, so that is the only shape accepted.
 */
export function isOwnLogoPath(url: string, folders: readonly string[] = ["logos", "branding"]): boolean {
  const match = /^\/uploads\/([a-z]+)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(url);
  return !!match && folders.includes(match[1]!) && !match[2]!.includes("..");
}

export const LOGO_URL_MESSAGE = "Upload your logo as an image file.";
