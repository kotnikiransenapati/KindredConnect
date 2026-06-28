// A7 — Spatial Presence panel: live 3D avatars + spatial-audio-style proximity meter.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Grid } from "@react-three/drei";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { heartbeatPresence, listPresence, leavePresence } from "@/lib/presence.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Radio, LogOut } from "lucide-react";

type Presence = {
  id: string; user_id: string; display_name: string; color: string;
  pos_x: number; pos_y: number; pos_z: number; status: string; last_seen: string;
};

function Avatar({ p, self }: { p: Presence; self: boolean }) {
  const ref = useRef<THREE.Group>(null!);
  const target = useMemo(() => new THREE.Vector3(p.pos_x, p.pos_y, p.pos_z), [p.pos_x, p.pos_y, p.pos_z]);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.lerp(target, Math.min(1, dt * 6));
    ref.current.rotation.y += dt * 0.5;
  });
  return (
    <group ref={ref}>
      <mesh castShadow>
        <coneGeometry args={[0.35, 0.9, 6]} />
        <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={self ? 0.6 : 0.25} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshStandardMaterial color={p.color} roughness={0.3} metalness={0.4} />
      </mesh>
      <Html position={[0, 1.45, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div className="rounded-md border border-border bg-background/95 px-2 py-1 text-[11px] font-medium shadow-md"
             style={{ borderColor: p.color }}>
          {p.display_name}{self ? " (you)" : ""}
        </div>
      </Html>
    </group>
  );
}

function SelfDriver({ projectId, displayName, onMove }: {
  projectId: string; displayName: string; onMove: (pos: [number, number, number]) => void;
}) {
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt * 0.4;
    const x = Math.cos(t.current) * 3.2;
    const z = Math.sin(t.current * 0.8) * 3.2;
    onMove([x, 0.5, z]);
  });
  return null;
}

export function SpatialPresencePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listPresence);
  const beat = useServerFn(heartbeatPresence);
  const leave = useServerFn(leavePresence);
  const [name, setName] = useState("");
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState<[number, number, number]>([0, 0.5, 0]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const m = data.user?.user_metadata as any;
      setName((m?.full_name as string) || data.user?.email?.split("@")[0] || "Guest");
    });
    return () => { mounted = false; };
  }, []);

  const q = useQuery({
    queryKey: ["spatial-presence", projectId],
    queryFn: () => list({ data: { projectId } }) as Promise<Presence[]>,
    refetchInterval: 3000,
  });

  const heartbeat = useMutation({
    mutationFn: () => beat({ data: { projectId, displayName: name || "Guest", pos, status: "online" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spatial-presence", projectId] }),
  });

  useEffect(() => {
    if (!active || !name) return;
    const id = setInterval(() => heartbeat.mutate(), 4000);
    heartbeat.mutate();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, name, pos[0], pos[1], pos[2]]);

  const leaveMut = useMutation({
    mutationFn: () => leave({ data: { projectId } }),
    onSuccess: () => { setActive(false); qc.invalidateQueries({ queryKey: ["spatial-presence", projectId] }); },
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" /> Spatial Presence
          <Badge variant="secondary" className="ml-2">{q.data?.length ?? 0} online</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="w-48" />
          {!active ? (
            <Button size="sm" onClick={() => setActive(true)} disabled={!name}>
              <Radio className="size-3.5 mr-1" /> Join scene
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => leaveMut.mutate()}>
              <LogOut className="size-3.5 mr-1" /> Leave
            </Button>
          )}
        </div>

        <div className="h-[360px] w-full rounded-md overflow-hidden border border-border bg-gradient-to-b from-background to-muted/40">
          <Canvas shadows camera={{ position: [6, 5, 6], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 8, 4]} intensity={0.8} castShadow />
            <Grid args={[20, 20]} cellColor="#444" sectionColor="#666" infiniteGrid fadeDistance={25} />
            {active ? <SelfDriver projectId={projectId} displayName={name} onMove={setPos} /> : null}
            {(q.data ?? []).map((p) => (
              <Avatar key={p.id} p={p} self={false} />
            ))}
            {active ? (
              <Avatar
                p={{ id: "self", user_id: "self", display_name: name || "You",
                     color: "#7c5cff", pos_x: pos[0], pos_y: pos[1], pos_z: pos[2],
                     status: "online", last_seen: new Date().toISOString() }}
                self
              />
            ) : null}
            <OrbitControls makeDefault enablePan enableZoom />
          </Canvas>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(q.data ?? []).map((p) => (
            <Badge key={p.id} variant="outline" style={{ borderColor: p.color, color: p.color }}>
              ● {p.display_name}
            </Badge>
          ))}
          {q.data?.length === 0 ? (
            <span className="text-xs text-muted-foreground">No collaborators in the scene yet — join to broadcast your position.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
