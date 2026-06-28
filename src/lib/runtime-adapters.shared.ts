// Phase C — Portable runtime adapter catalog. Pure, client-safe metadata only.
export type RuntimeAdapterCategory = "auth" | "database" | "storage" | "functions" | "ai" | "payments" | "email" | "push";

export type RuntimeAdapterOption = {
  category: RuntimeAdapterCategory;
  provider: string;
  displayName: string;
  description: string;
  capabilities: string[];
  requiredSecretRefs: string[];
  edgeReady: boolean;
  nativeReady: boolean;
  selfHostReady: boolean;
  score: number;
  // Server functions require concrete serializable shapes; `any` avoids leaking
  // `unknown` through TanStack Start's serializability validator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configDefaults: Record<string, any>;
};

export const RUNTIME_ADAPTER_CATALOG: RuntimeAdapterOption[] = [
  {
    category: "auth",
    provider: "lovable-cloud-auth",
    displayName: "Lovable Cloud Auth",
    description: "Managed email, OAuth, passkey, MFA, session rotation, and row-policy identity for generated apps.",
    capabilities: ["email", "oauth", "passkeys", "mfa", "session-rotation", "rls-identity"],
    requiredSecretRefs: [],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 96,
    configDefaults: { session: "rotating", mfa: "optional", passkeys: true },
  },
  {
    category: "auth",
    provider: "firebase-auth",
    displayName: "Firebase Auth",
    description: "Mobile-first identity with strong SDK coverage and broad social-provider support.",
    capabilities: ["email", "oauth", "phone", "anonymous", "native-sdk"],
    requiredSecretRefs: ["FIREBASE_API_KEY", "FIREBASE_PROJECT_ID"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 88,
    configDefaults: { persistence: "indexeddb", emulator: false },
  },
  {
    category: "auth",
    provider: "auth0",
    displayName: "Auth0",
    description: "Enterprise tenant identity with organizations, SAML, OIDC, and policy-driven access.",
    capabilities: ["oidc", "saml", "organizations", "mfa", "enterprise-sso"],
    requiredSecretRefs: ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 86,
    configDefaults: { audience: "api", organizationRequired: false },
  },
  {
    category: "auth",
    provider: "keycloak",
    displayName: "Keycloak",
    description: "Self-hostable OIDC/SAML identity for teams that need full ownership of auth infrastructure.",
    capabilities: ["oidc", "saml", "mfa", "realm-roles", "self-host"],
    requiredSecretRefs: ["KEYCLOAK_ISSUER", "KEYCLOAK_CLIENT_ID", "KEYCLOAK_CLIENT_SECRET"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: true,
    score: 82,
    configDefaults: { realm: "foundry", pkce: true },
  },
  {
    category: "database",
    provider: "lovable-cloud-postgres",
    displayName: "Lovable Cloud Postgres",
    description: "Managed relational database with policies, realtime, storage integration, and project-scoped access controls.",
    capabilities: ["postgres", "rls", "realtime", "jsonb", "vector", "migrations"],
    requiredSecretRefs: [],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 97,
    configDefaults: { policyMode: "strict", migrationMode: "generated" },
  },
  {
    category: "database",
    provider: "neon-postgres",
    displayName: "Neon Postgres",
    description: "Serverless Postgres with branching, scale-to-zero, and web app friendly connection modes.",
    capabilities: ["postgres", "branching", "serverless", "migrations", "pooling"],
    requiredSecretRefs: ["DATABASE_URL"],
    edgeReady: true,
    nativeReady: false,
    selfHostReady: false,
    score: 91,
    configDefaults: { driver: "http", migrations: "drizzle" },
  },
  {
    category: "database",
    provider: "turso-sqlite",
    displayName: "Turso SQLite",
    description: "Globally replicated SQLite for low-latency apps, widgets, and offline-first products.",
    capabilities: ["sqlite", "replication", "edge", "offline-friendly"],
    requiredSecretRefs: ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 84,
    configDefaults: { sync: "regional", migrations: "libsql" },
  },
  {
    category: "database",
    provider: "self-host-postgres",
    displayName: "Self-hosted Postgres",
    description: "Portable Postgres target for Docker Compose, Kubernetes, bare metal, and private clouds.",
    capabilities: ["postgres", "self-host", "backups", "migrations", "extensions"],
    requiredSecretRefs: ["DATABASE_URL"],
    edgeReady: false,
    nativeReady: false,
    selfHostReady: true,
    score: 80,
    configDefaults: { pooling: "pgbouncer", backups: "daily" },
  },
  {
    category: "database",
    provider: "firestore",
    displayName: "Firestore",
    description: "Document database target for realtime mobile apps with flexible nested data.",
    capabilities: ["document", "realtime", "offline-cache", "native-sdk"],
    requiredSecretRefs: ["FIREBASE_API_KEY", "FIREBASE_PROJECT_ID"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 78,
    configDefaults: { rules: "generated", indexes: "generated" },
  },
  {
    category: "storage",
    provider: "lovable-cloud-storage",
    displayName: "Lovable Cloud Storage",
    description: "Managed private buckets, signed URLs, CDN delivery, image transforms, and policy-backed object access.",
    capabilities: ["private-buckets", "signed-urls", "cdn", "image-transforms", "rls-policies"],
    requiredSecretRefs: [],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 95,
    configDefaults: { bucketMode: "per-project", signedUrlTtl: 900, publicAssets: false },
  },
  {
    category: "storage",
    provider: "s3-compatible",
    displayName: "S3 Compatible",
    description: "Portable object storage for AWS S3, Cloudflare R2, MinIO, Wasabi, and any S3-compatible endpoint.",
    capabilities: ["s3-api", "multipart", "signed-urls", "lifecycle", "self-host"],
    requiredSecretRefs: ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: true,
    score: 91,
    configDefaults: { addressing: "path", multipartThresholdMb: 16, encryption: "provider-managed" },
  },
  {
    category: "storage",
    provider: "gcs-storage",
    displayName: "Google Cloud Storage",
    description: "Enterprise object storage with IAM, lifecycle policies, global CDN integration, and signed upload flows.",
    capabilities: ["iam", "signed-uploads", "cdn", "lifecycle", "audit-logs"],
    requiredSecretRefs: ["GCP_PROJECT_ID", "GCS_BUCKET", "GCP_SERVICE_ACCOUNT_JSON"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 84,
    configDefaults: { uploadMode: "signed-post", retention: "project-default" },
  },
  {
    category: "functions",
    provider: "cloudflare-workers",
    displayName: "Cloudflare Workers",
    description: "Global edge functions with fast cold starts, durable routing, queues, KV, R2 bindings, and preview deployments.",
    capabilities: ["edge", "queues", "scheduled", "kv", "r2-bindings", "web-standards"],
    requiredSecretRefs: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 94,
    configDefaults: { runtime: "workerd", compatibility: "nodejs_compat", region: "global" },
  },
  {
    category: "functions",
    provider: "vercel-functions",
    displayName: "Vercel Functions",
    description: "Serverless and edge function target for teams deploying web apps through Vercel projects.",
    capabilities: ["serverless", "edge", "cron", "preview-env", "observability"],
    requiredSecretRefs: ["VERCEL_TOKEN", "VERCEL_PROJECT_ID"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 88,
    configDefaults: { runtime: "edge-first", regions: ["iad1"] },
  },
  {
    category: "functions",
    provider: "node-express-self-host",
    displayName: "Node/Express Self-host",
    description: "Portable function runtime packaged as a Docker service for private cloud, Kubernetes, or bare metal hosting.",
    capabilities: ["docker", "kubernetes", "cron", "webhooks", "private-network"],
    requiredSecretRefs: ["RUNTIME_DATABASE_URL", "RUNTIME_JWT_SECRET"],
    edgeReady: false,
    nativeReady: true,
    selfHostReady: true,
    score: 81,
    configDefaults: { runtime: "node20", processManager: "pm2", healthPath: "/healthz" },
  },
  {
    category: "ai",
    provider: "lovable-ai-gateway",
    displayName: "Lovable AI Gateway",
    description: "Default multi-model AI gateway with secure server-side routing for chat, embeddings, images, speech, and moderation.",
    capabilities: ["chat", "embeddings", "images", "speech", "moderation", "cost-routing"],
    requiredSecretRefs: [],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 96,
    configDefaults: { routing: "cost-latency-balanced", moderation: "strict", piiRedaction: true },
  },
  {
    category: "ai",
    provider: "openai-compatible",
    displayName: "OpenAI Compatible",
    description: "Portable OpenAI-style API contract for OpenAI, Azure OpenAI, Together, Groq, Fireworks, or compatible gateways.",
    capabilities: ["chat", "embeddings", "json-mode", "tool-calling", "streaming"],
    requiredSecretRefs: ["OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_API_KEY"],
    edgeReady: true,
    nativeReady: true,
    selfHostReady: false,
    score: 89,
    configDefaults: { timeoutMs: 45_000, retries: 2, streaming: true },
  },
  {
    category: "ai",
    provider: "ollama-self-host",
    displayName: "Ollama / vLLM Self-host",
    description: "Private AI target for local GPUs, regulated workloads, air-gapped networks, and custom open-weight models.",
    capabilities: ["self-host", "private-models", "chat", "embeddings", "gpu-routing"],
    requiredSecretRefs: ["SELF_HOST_AI_BASE_URL", "SELF_HOST_AI_TOKEN"],
    edgeReady: false,
    nativeReady: true,
    selfHostReady: true,
    score: 83,
    configDefaults: { batching: true, fallbackProvider: "lovable-ai-gateway" },
  },
];

export function adapterFor(category: RuntimeAdapterCategory, provider: string): RuntimeAdapterOption | undefined {
  return RUNTIME_ADAPTER_CATALOG.find((adapter) => adapter.category === category && adapter.provider === provider);
}

export function recommendedAdapters(category: RuntimeAdapterCategory): RuntimeAdapterOption[] {
  return RUNTIME_ADAPTER_CATALOG
    .filter((adapter) => adapter.category === category)
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
}

export function integrationKindForCategory(category: RuntimeAdapterCategory): "auth" | "db" | "storage" | "functions" | "ai" | "payments" | "email" | "push" | "analytics" {
  if (category === "database") return "db";
  return category as Exclude<RuntimeAdapterCategory, "database">;
}