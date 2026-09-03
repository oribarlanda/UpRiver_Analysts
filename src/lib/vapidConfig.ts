export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function decodedBase64UrlLength(value: string): number | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  try {
    return Buffer.from(value, "base64url").length;
  } catch {
    return null;
  }
}

export function getVapidConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): VapidConfig {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";

  if (decodedBase64UrlLength(publicKey) !== 65) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing or invalid.");
  }

  if (decodedBase64UrlLength(privateKey) !== 32) {
    throw new Error("VAPID_PRIVATE_KEY is missing or invalid.");
  }

  if (!/^(mailto:[^@\s]+@[^@\s]+|https:\/\/[^\s]+)$/i.test(subject)) {
    throw new Error("VAPID_SUBJECT must be a mailto address or HTTPS URL.");
  }

  return { publicKey, privateKey, subject };
}
