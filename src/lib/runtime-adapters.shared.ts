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
  configDefaults: Record<string, unknown>;
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
];

export function adapterFor(category: RuntimeAdapterCategory, provider: string): RuntimeAdapterOption | undefined {
  return RUNTIME_ADAPTER_CATALOG.find((adapter) => adapter.category === category && adapter.provider === provider);
}

export function recommendedAdapters(category: RuntimeAdapterCategory): RuntimeAdapterOption[] {
  return RUNTIME_ADAPTER_CATALOG
    .filter((adapter) => adapter.category === category)
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
}

export function integrationKindForCategory(category: RuntimeAdapterCategory): "auth" | "db" | "storage" | "ai" | "payments" | "email" | "push" | "analytics" {
  if (category === "database") return "db";
  if (category === "functions") return "analytics";
  return category as Exclude<RuntimeAdapterCategory, "database" | "functions">;
}