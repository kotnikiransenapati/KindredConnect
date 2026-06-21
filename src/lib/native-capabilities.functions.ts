// P22 — Native capabilities matrix for iOS + Android.
// Per-project registry of permissions/features. Generates Info.plist and AndroidManifest fragments
// from the enabled rows. Built-in catalog enforces correct iOS usage keys + Android permission names.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type CapabilityDef = {
  key: string;
  label: string;
  category: "media" | "location" | "identity" | "connectivity" | "system" | "commerce";
  defaultRisk: "low" | "medium" | "high";
  defaultUsage: string;
  ios?: { usageKey: string };          // e.g. NSCameraUsageDescription
  android?: { permissions: string[] }; // e.g. ["android.permission.CAMERA"]
};

export const CAPABILITY_CATALOG: CapabilityDef[] = [
  { key: "camera", label: "Camera", category: "media", defaultRisk: "medium",
    defaultUsage: "We use the camera so you can capture photos and videos in the app.",
    ios: { usageKey: "NSCameraUsageDescription" },
    android: { permissions: ["android.permission.CAMERA"] } },
  { key: "microphone", label: "Microphone", category: "media", defaultRisk: "medium",
    defaultUsage: "We use the microphone to record audio for voice features.",
    ios: { usageKey: "NSMicrophoneUsageDescription" },
    android: { permissions: ["android.permission.RECORD_AUDIO"] } },
  { key: "photos", label: "Photo library", category: "media", defaultRisk: "medium",
    defaultUsage: "Allow access to your photo library to upload images.",
    ios: { usageKey: "NSPhotoLibraryUsageDescription" },
    android: { permissions: ["android.permission.READ_MEDIA_IMAGES"] } },
  { key: "location_when_in_use", label: "Location (in use)", category: "location", defaultRisk: "high",
    defaultUsage: "We use your location to show nearby places while you use the app.",
    ios: { usageKey: "NSLocationWhenInUseUsageDescription" },
    android: { permissions: ["android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"] } },
  { key: "location_always", label: "Location (always)", category: "location", defaultRisk: "high",
    defaultUsage: "We use your location in the background for live tracking features.",
    ios: { usageKey: "NSLocationAlwaysAndWhenInUseUsageDescription" },
    android: { permissions: ["android.permission.ACCESS_BACKGROUND_LOCATION"] } },
  { key: "contacts", label: "Contacts", category: "identity", defaultRisk: "high",
    defaultUsage: "Access contacts to help you invite friends.",
    ios: { usageKey: "NSContactsUsageDescription" },
    android: { permissions: ["android.permission.READ_CONTACTS"] } },
  { key: "calendar", label: "Calendar", category: "identity", defaultRisk: "medium",
    defaultUsage: "Add and read calendar events on your behalf.",
    ios: { usageKey: "NSCalendarsUsageDescription" },
    android: { permissions: ["android.permission.READ_CALENDAR", "android.permission.WRITE_CALENDAR"] } },
  { key: "biometrics", label: "Face ID / Biometrics", category: "identity", defaultRisk: "medium",
    defaultUsage: "Use Face ID / fingerprint to sign in securely.",
    ios: { usageKey: "NSFaceIDUsageDescription" },
    android: { permissions: ["android.permission.USE_BIOMETRIC"] } },
  { key: "push", label: "Push notifications", category: "system", defaultRisk: "low",
    defaultUsage: "Notify you about important updates.",
    android: { permissions: ["android.permission.POST_NOTIFICATIONS"] } },
  { key: "bluetooth", label: "Bluetooth", category: "connectivity", defaultRisk: "medium",
    defaultUsage: "Connect to nearby Bluetooth accessories.",
    ios: { usageKey: "NSBluetoothAlwaysUsageDescription" },
    android: { permissions: ["android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN"] } },
  { key: "nfc", label: "NFC", category: "connectivity", defaultRisk: "medium",
    defaultUsage: "Scan NFC tags.",
    ios: { usageKey: "NFCReaderUsageDescription" },
    android: { permissions: ["android.permission.NFC"] } },
  { key: "motion", label: "Motion & fitness", category: "system", defaultRisk: "low",
    defaultUsage: "Use motion data for step counting and fitness features.",
    ios: { usageKey: "NSMotionUsageDescription" },
    android: { permissions: ["android.permission.ACTIVITY_RECOGNITION"] } },
  { key: "healthkit", label: "Health data", category: "identity", defaultRisk: "high",
    defaultUsage: "Read health metrics like steps and heart rate.",
    ios: { usageKey: "NSHealthShareUsageDescription" } },
  { key: "background_fetch", label: "Background fetch", category: "system", defaultRisk: "low",
    defaultUsage: "Refresh content in the background.",
    android: { permissions: ["android.permission.WAKE_LOCK"] } },
  { key: "in_app_purchase", label: "In-app purchase", category: "commerce", defaultRisk: "low",
    defaultUsage: "Process in-app purchases.",
    android: { permissions: ["com.android.vending.BILLING"] } },
  { key: "share", label: "Share / files", category: "media", defaultRisk: "low",
    defaultUsage: "Share content with other apps.",
    android: { permissions: ["android.permission.READ_EXTERNAL_STORAGE"] } },
];

const CapKeyZ = z.enum(CAPABILITY_CATALOG.map((c) => c.key) as [string, ...string[]]);
const PlatformZ = z.enum(["ios", "android", "both"]);
const RiskZ = z.enum(["low", "medium", "high"]);

export const listCapabilityCatalog = createServerFn({ method: "GET" })
  .handler(async () => ({ catalog: CAPABILITY_CATALOG }));

export const listCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("native_capabilities")
      .select("id, capability_key, platform, enabled, usage_description, justification, risk, config, updated_at")
      .eq("project_id", data.projectId)
      .order("capability_key", { ascending: true });
    if (error) throw error;
    return { capabilities: rows ?? [] };
  });

export const upsertCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      projectId: z.string().uuid(),
      capabilityKey: CapKeyZ,
      platform: PlatformZ,
      enabled: z.boolean(),
      usageDescription: z.string().min(0).max(400),
      justification: z.string().max(1000).optional(),
      risk: RiskZ.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const def = CAPABILITY_CATALOG.find((c) => c.key === data.capabilityKey)!;
    // High-risk + iOS requires a usage description (App Store rejection otherwise).
    if (data.enabled && (def.defaultRisk === "high" || data.platform !== "android") && def.ios) {
      if (!data.usageDescription || data.usageDescription.trim().length < 10) {
        throw new Error(`A user-facing description (>= 10 chars) is required for "${def.label}" on iOS.`);
      }
    }
    const row = {
      project_id: data.projectId,
      capability_key: data.capabilityKey,
      platform: data.platform,
      enabled: data.enabled,
      usage_description: data.usageDescription ?? "",
      justification: data.justification ?? null,
      risk: data.risk ?? def.defaultRisk,
    };
    if (data.id) {
      const { error } = await context.supabase.from("native_capabilities").update(row).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("native_capabilities")
      .upsert(row, { onConflict: "project_id,capability_key,platform" })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id };
  });

export const deleteCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("native_capabilities").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!),
  );
}

export const generateManifests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("native_capabilities")
      .select("capability_key, platform, enabled, usage_description, risk")
      .eq("project_id", data.projectId)
      .eq("enabled", true);
    if (error) throw error;

    const iosLines: string[] = [];
    const androidPerms = new Set<string>();
    let highRiskCount = 0;

    for (const r of rows ?? []) {
      const def = CAPABILITY_CATALOG.find((c) => c.key === r.capability_key);
      if (!def) continue;
      if (r.risk === "high") highRiskCount++;

      if ((r.platform === "ios" || r.platform === "both") && def.ios) {
        iosLines.push(
          `  <key>${def.ios.usageKey}</key>\n  <string>${escapeXml(r.usage_description || def.defaultUsage)}</string>`,
        );
      }
      if ((r.platform === "android" || r.platform === "both") && def.android) {
        for (const p of def.android.permissions) androidPerms.add(p);
      }
    }

    const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${iosLines.join("\n") || "  <!-- no iOS capabilities enabled -->"}
</dict>
</plist>`;

    const androidManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${[...androidPerms].sort().map((p) => `  <uses-permission android:name="${p}" />`).join("\n") || "  <!-- no Android permissions enabled -->"}
</manifest>`;

    return {
      infoPlist,
      androidManifest,
      summary: {
        iosKeys: iosLines.length,
        androidPermissions: androidPerms.size,
        highRiskCount,
      },
    };
  });
