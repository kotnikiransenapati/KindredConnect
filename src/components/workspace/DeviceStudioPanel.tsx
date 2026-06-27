import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Monitor, Plus, Smartphone, Tablet, Trash2, Laptop } from "lucide-react";
import {
  listPreviewDevices,
  addPreviewDevice,
  updatePreviewDevice,
  deletePreviewDevice,
} from "@/lib/preview-devices.functions";

type Device = NonNullable<Awaited<ReturnType<typeof listPreviewDevices>>["devices"]>[number];

function DeviceMesh({ device, selected, onSelect }: { device: Device; selected: boolean; onSelect: () => void }) {
  // 3D device frame: cuboid body + inset screen plane with HTML iframe layer
  const w = Math.max(1.2, Number(device.viewport_w) / 300);
  const h = Math.max(1.2, Number(device.viewport_h) / 300);
  const depth = 0.18;
  return (
    <group
      position={[Number(device.position_x), Number(device.position_y) + h / 2 + 0.1, Number(device.position_z)]}
      rotation={[0, Number(device.rotation_y), 0]}
      scale={Number(device.scale)}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <mesh castShadow>
        <boxGeometry args={[w + 0.15, h + 0.25, depth]} />
        <meshStandardMaterial color={selected ? "#6366f1" : "#1f2937"} metalness={0.6} roughness={0.3} emissive={selected ? "#312e81" : "#000000"} emissiveIntensity={selected ? 0.4 : 0} />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.001]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color="#0b1020" emissive="#0b1020" emissiveIntensity={0.4} />
      </mesh>
      <Html
        transform
        distanceFactor={1.4}
        position={[0, 0, depth / 2 + 0.01]}
        style={{ width: `${device.viewport_w}px`, height: `${device.viewport_h}px`, pointerEvents: selected ? "auto" : "none" }}
      >
        {device.preview_url ? (
          <iframe
            src={device.preview_url}
            title={device.label}
            style={{ width: "100%", height: "100%", border: 0, background: "white", borderRadius: 8 }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", background: "#0b1020", borderRadius: 8, fontSize: 24 }}>
            No URL — edit device to set preview
          </div>
        )}
      </Html>
      <Html position={[0, -h / 2 - 0.3, 0]} center>
        <div style={{ color: "#e2e8f0", fontSize: 11, background: "rgba(15,23,42,0.7)", padding: "3px 8px", borderRadius: 12, backdropFilter: "blur(8px)", whiteSpace: "nowrap" }}>
          {device.label} · {device.viewport_w}×{device.viewport_h}
        </div>
      </Html>
    </group>
  );
}

export function DeviceStudioPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchDevices = useServerFn(listPreviewDevices);
  const addFn = useServerFn(addPreviewDevice);
  const updFn = useServerFn(updatePreviewDevice);
  const delFn = useServerFn(deletePreviewDevice);

  const q = useQuery({
    queryKey: ["preview-devices", projectId],
    queryFn: () => fetchDevices({ data: { projectId } }),
  });
  const devices = useMemo(() => q.data?.devices ?? [], [q.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = devices.find((d) => d.id === selectedId) ?? null;

  const [kind, setKind] = useState<"phone" | "phone_android" | "tablet" | "laptop" | "desktop">("phone");
  const [url, setUrl] = useState("");

  const add = useMutation({
    mutationFn: () => addFn({ data: { projectId, kind, previewUrl: url || undefined } }),
    onSuccess: () => { setUrl(""); toast.success("Device added"); qc.invalidateQueries({ queryKey: ["preview-devices", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const upd = useMutation({
    mutationFn: (vars: { id: string; patch: Record<string, unknown> }) =>
      updFn({ data: { projectId, id: vars.id, patch: vars.patch as never } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["preview-devices", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { projectId, id } }),
    onSuccess: () => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["preview-devices", projectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const Icon = kind === "phone" || kind === "phone_android" ? Smartphone : kind === "tablet" ? Tablet : kind === "laptop" ? Laptop : Monitor;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Monitor className="h-4 w-4" /> 3D Device Studio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">iPhone</SelectItem>
              <SelectItem value="phone_android">Pixel</SelectItem>
              <SelectItem value="tablet">iPad</SelectItem>
              <SelectItem value="laptop">Laptop</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-8 max-w-[280px]" placeholder="https://preview-url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> <Icon className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
          {devices.length > 0 && <Badge variant="secondary">{devices.length} device{devices.length > 1 ? "s" : ""}</Badge>}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <div className="h-[420px] overflow-hidden rounded-xl border border-border/60 bg-[radial-gradient(circle_at_center,#0f172a,#020617)]">
            <Canvas shadows camera={{ position: [0, 3, 10], fov: 45 }}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
              <gridHelper args={[40, 40, "#1e293b", "#0f172a"]} />
              {devices.map((d) => (
                <DeviceMesh key={d.id} device={d} selected={d.id === selectedId} onSelect={() => setSelectedId(d.id)} />
              ))}
              <OrbitControls enableDamping makeDefault />
            </Canvas>
          </div>
          <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Inspector</div>
            {selected ? (
              <div className="space-y-2 text-xs">
                <Input className="h-8" value={selected.label} onChange={(e) => upd.mutate({ id: selected.id, patch: { label: e.target.value } })} />
                <Input className="h-8" placeholder="https://" defaultValue={selected.preview_url ?? ""} onBlur={(e) => upd.mutate({ id: selected.id, patch: { preview_url: e.target.value || null } })} />
                <div className="grid grid-cols-3 gap-1">
                  <label className="space-y-1"><span className="text-muted-foreground">x</span><Input className="h-7" type="number" defaultValue={Number(selected.position_x)} onBlur={(e) => upd.mutate({ id: selected.id, patch: { position_x: Number(e.target.value) } })} /></label>
                  <label className="space-y-1"><span className="text-muted-foreground">z</span><Input className="h-7" type="number" defaultValue={Number(selected.position_z)} onBlur={(e) => upd.mutate({ id: selected.id, patch: { position_z: Number(e.target.value) } })} /></label>
                  <label className="space-y-1"><span className="text-muted-foreground">rot</span><Input className="h-7" type="number" step="0.1" defaultValue={Number(selected.rotation_y)} onBlur={(e) => upd.mutate({ id: selected.id, patch: { rotation_y: Number(e.target.value) } })} /></label>
                </div>
                <label className="block space-y-1"><span className="text-muted-foreground">scale</span><Input className="h-7" type="number" step="0.1" defaultValue={Number(selected.scale)} onBlur={(e) => upd.mutate({ id: selected.id, patch: { scale: Number(e.target.value) } })} /></label>
                <Button size="sm" variant="destructive" className="w-full" onClick={() => del.mutate(selected.id)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete device
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Click a device in the scene to inspect.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
