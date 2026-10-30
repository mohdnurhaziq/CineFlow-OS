import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters long").default("cineflow_super_secure_random_session_secret_32_chars_min"),
  NEXT_PUBLIC_APP_DOMAIN: z.string().default("cineflow.app"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.format());
    throw new Error("Invalid environment configuration.");
  }
  return parsed.data;
}

export const env = validateEnv();
