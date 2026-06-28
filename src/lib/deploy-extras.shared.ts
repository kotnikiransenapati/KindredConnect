// Phase E2/E3/E4 — pure helpers for credential validation, self-host bundle
// synthesis and multi-region canary plan construction. Imported by both the
// server-function module and (for types) the UI panel.
import type { BuildTarget } from "./target-builds.shared";
import { findDeployAdapter, type DeployPlan, type DeployPlanStep, type DeployProvider } from "./deploy-adapters.shared";

export type CredentialValidation = {
  provider: DeployProvider;
  required: string[];
  present: string[];
  missing: string[];
  ready: boolean;
};

export function validateCredentialSet(provider: DeployProvider, secretNames: string[]): CredentialValidation {
  const adapter = findDeployAdapter(provider);
  if (!adapter) throw new Error(`Unknown deploy provider: ${provider}`);
  const required = adapter.credentialKeys;
  const have = new Set(secretNames);
  const present = required.filter((k) => have.has(k));
  const missing = required.filter((k) => !have.has(k));
  return { provider, required, present, missing, ready: missing.length === 0 };
}

export type SelfHostBundle = {
  provider: DeployProvider;
  target: BuildTarget;
  summary: { fileCount: number; bytes: number; formats: string[] };
  files: Record<string, string>;
};

export function synthesizeSelfHostBundle(input: {
  provider: DeployProvider;
  target: BuildTarget;
  projectSlug: string;
  domain?: string;
  irHash: string;
}): SelfHostBundle {
  const slug = input.projectSlug.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "foundry-app";
  const domain = input.domain || `${slug}.example.com`;
  const tag = (input.irHash || "latest").slice(0, 12);

  const dockerfile = [
    "FROM oven/bun:1.1 AS build",
    "WORKDIR /app",
    "COPY package.json bun.lockb* ./",
    "RUN bun install --frozen-lockfile",
    "COPY . .",
    "RUN bun run build",
    "",
    "FROM oven/bun:1.1-slim",
    "WORKDIR /app",
    "ENV NODE_ENV=production",
    "COPY --from=build /app/dist ./dist",
    "COPY --from=build /app/package.json ./",
    "EXPOSE 3000",
    'CMD ["bun", "run", "start"]',
  ].join("\n");

  const compose = `version: "3.9"
services:
  app:
    image: ${slug}:${tag}
    build: .
    restart: always
    environment:
      DATABASE_URL: postgres://app:app@db:5432/app
      REDIS_URL: redis://cache:6379
      STORAGE_ENDPOINT: http://storage:9000
      STORAGE_KEY: minio
      STORAGE_SECRET: \${MINIO_SECRET:-minio12345}
    ports: ["3000:3000"]
    depends_on: [db, cache, storage]
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    volumes: ["db-data:/var/lib/postgresql/data"]
  cache:
    image: redis:7-alpine
    restart: always
    volumes: ["cache-data:/data"]
  storage:
    image: minio/minio:latest
    restart: always
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: \${MINIO_SECRET:-minio12345}
    volumes: ["storage-data:/data"]
    ports: ["9001:9001"]
  proxy:
    image: caddy:2-alpine
    restart: always
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
    depends_on: [app]
volumes:
  db-data: {}
  cache-data: {}
  storage-data: {}
  caddy-data: {}
`;

  const caddyfile = `${domain} {
  encode zstd gzip
  reverse_proxy app:3000
}
`;

  const helmValues = `image:
  repository: ${slug}
  tag: ${tag}
replicas: 3
service:
  type: ClusterIP
  port: 3000
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: ${domain}
      paths: ["/"]
resources:
  requests: { cpu: 100m, memory: 256Mi }
  limits: { cpu: 1000m, memory: 1024Mi }
postgresql:
  enabled: true
  auth: { username: app, password: app, database: app }
redis: { enabled: true }
minio: { enabled: true }
`;

  const helmDeployment = `apiVersion: apps/v1
kind: Deployment
metadata: { name: ${slug} }
spec:
  replicas: {{ .Values.replicas }}
  selector: { matchLabels: { app: ${slug} } }
  template:
    metadata: { labels: { app: ${slug} } }
    spec:
      containers:
        - name: app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports: [{ containerPort: 3000 }]
          envFrom: [{ secretRef: { name: ${slug}-env } }]
          resources: {{- toYaml .Values.resources | nindent 12 }}
          readinessProbe: { httpGet: { path: /healthz, port: 3000 }, initialDelaySeconds: 5 }
          livenessProbe:  { httpGet: { path: /healthz, port: 3000 }, initialDelaySeconds: 20 }
`;

  const terraform = `terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

variable "region" { default = "us-east-1" }
provider "aws" { region = var.region }

resource "aws_ecs_cluster" "this" { name = "${slug}" }

resource "aws_ecs_task_definition" "app" {
  family                   = "${slug}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  container_definitions = jsonencode([{
    name      = "app",
    image     = "${slug}:${tag}",
    essential = true,
    portMappings = [{ containerPort = 3000 }],
  }])
}

output "cluster" { value = aws_ecs_cluster.this.name }
`;

  const readme = `# ${slug} — self-host bundle

Built from Foundry IR hash \`${input.irHash || "(unset)"}\` for target **${input.target}**
via provider **${input.provider}**.

## Quick start (Docker Compose)
\`\`\`bash
docker compose up -d --build
\`\`\`
Then point ${domain} at this host.

## Kubernetes (Helm)
\`\`\`bash
helm upgrade --install ${slug} ./chart -f values.yaml
\`\`\`

## AWS (Terraform)
\`\`\`bash
terraform init && terraform apply
\`\`\`

All adapters in \`@app/runtime\` are wired to the bundled Postgres/Redis/MinIO
services so the same generated app code runs unchanged.
`;

  const files: Record<string, string> = {
    "README.md": readme,
    "Dockerfile": dockerfile,
    "docker-compose.yml": compose,
    "Caddyfile": caddyfile,
    "chart/values.yaml": helmValues,
    "chart/templates/deployment.yaml": helmDeployment,
    "terraform/main.tf": terraform,
    ".env.example": `DATABASE_URL=postgres://app:app@db:5432/app\nREDIS_URL=redis://cache:6379\nSTORAGE_ENDPOINT=http://storage:9000\nSTORAGE_KEY=minio\nSTORAGE_SECRET=change-me\n`,
  };

  const bytes = Object.values(files).reduce((s, v) => s + v.length, 0);
  return {
    provider: input.provider,
    target: input.target,
    summary: { fileCount: Object.keys(files).length, bytes, formats: ["docker-compose", "helm", "terraform", "caddy"] },
    files,
  };
}

export type CanaryStage = { percent: number; holdSeconds: number; region?: string };

export function synthesizeCanaryPlan(input: {
  provider: DeployProvider;
  target: BuildTarget;
  environment: string;
  irHash: string;
  regions: string[];
  stages: CanaryStage[];
}): DeployPlan {
  const adapter = findDeployAdapter(input.provider);
  if (!adapter) throw new Error(`Unknown deploy provider: ${input.provider}`);
  if (!adapter.supportedTargets.includes(input.target)) {
    throw new Error(`Provider ${input.provider} does not support target ${input.target}`);
  }
  const warnings: string[] = [];
  if (!adapter.capabilities.canary) warnings.push(`Provider ${input.provider} does not support canary — stages will execute as immutable swaps.`);
  if (!adapter.capabilities.multiRegion && input.regions.length > 1) warnings.push(`Provider ${input.provider} is single-region — only the first region will be used.`);
  if (!input.stages.length) warnings.push("No canary stages supplied — defaulting to single 100% promotion.");

  const regions = adapter.capabilities.multiRegion ? input.regions : input.regions.slice(0, 1);
  const stages = input.stages.length ? input.stages : [{ percent: 100, holdSeconds: 0 }];
  const steps: DeployPlanStep[] = [
    { key: "validate", name: "Validate credentials & quota", description: `Check ${adapter.credentialKeys.length} credential(s) and target=${input.target}`, estimatedSeconds: 6, reversible: true },
    { key: "build", name: "Build artifact", description: `Compile target=${input.target} from IR ${input.irHash.slice(0, 12) || "(unset)"}`, estimatedSeconds: 90, reversible: true },
  ];
  for (const region of regions.length ? regions : [""]) {
    steps.push({ key: `upload-${region || "default"}`, name: `Upload to ${region || adapter.displayName}`, description: `Stage artifact in ${region || "default region"}`, estimatedSeconds: 30, reversible: true });
  }
  for (const [idx, stage] of stages.entries()) {
    steps.push({
      key: `canary-${idx + 1}`,
      name: `Canary stage ${idx + 1} · ${stage.percent}%`,
      description: `Shift ${stage.percent}% traffic${stage.region ? ` in ${stage.region}` : ""}, hold ${stage.holdSeconds}s, watch SLOs`,
      estimatedSeconds: 30 + stage.holdSeconds,
      reversible: true,
    });
  }
  steps.push({ key: "promote", name: "Promote globally", description: "Mark new revision active across all regions", estimatedSeconds: 10, reversible: true });
  steps.push({ key: "verify", name: "Verify SLOs", description: "Run smoke checks and emit deploy events", estimatedSeconds: 30, reversible: false });

  const estimatedDurationSeconds = steps.reduce((s, x) => s + x.estimatedSeconds, 0);
  const traffic = stages[stages.length - 1]?.percent ?? 100;
  const estimatedCostCents = Math.round((adapter.estimatedCostPerMillionCents * traffic * Math.max(1, regions.length)) / 100);

  return {
    provider: input.provider,
    target: input.target,
    environment: input.environment,
    irHash: input.irHash,
    steps,
    estimatedDurationSeconds,
    estimatedCostCents,
    warnings,
    rollbackStrategy: adapter.capabilities.canary ? "blue-green" : adapter.capabilities.selfHost ? "manual" : "immutable-swap",
    generatedAt: new Date().toISOString(),
  };
}
