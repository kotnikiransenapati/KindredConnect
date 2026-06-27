import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Stars, Grid } from "@react-three/drei";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as THREE from "three";
import {
  listSpatialNodes,
  upsertSpatialNode,
  deleteSpatialNode,
  moveSpatialNode,
  seedSceneFromFiles,
  saveViewpoint,
} from "@/lib/spatial-scene.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Box, Sparkles, Camera, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type SpatialNode = {
  id: string;
  kind: string;
  label: string;
  file_path: string | null;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  scale: number;
  color: string;
};

function NodeMesh({
  node,
  selected,
  onSelect,
  onDrag,
}: {
  node: SpatialNode;
  selected: boolean;
  onSelect: () => void;
  onDrag: (pos: [number, number, number]) => void;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const [hover, setHover] = useState(false);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * (hover ? 0.6 : 0.15);
    if (selected) {
      ref.current.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2).multiplyScalar(node.scale), 0.15);
    } else {
      ref.current.scale.lerp(new THREE.Vector3(1, 1, 1).multiplyScalar(node.scale), 0.15);
    }
  });
  return (
    <group position={[node.pos_x, node.pos_y, node.pos_z]}>
      <mesh
        ref={ref}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "default";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // nudge along a random axis on dbl-click to demo movement
          onDrag([node.pos_x + (Math.random() - 0.5) * 1.5, node.pos_y, node.pos_z + (Math.random() - 0.5) * 1.5]);
        }}
      >
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial
          color={node.color}
          metalness={0.55}
          roughness={0.25}
          emissive={node.color}
          emissiveIntensity={selected ? 0.7 : hover ? 0.4 : 0.15}
        />
      </mesh>
      <Html distanceFactor={9} position={[0, 0.95, 0]} center style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(15,23,42,0.85)",
            color: "white",
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            border: `1px solid ${node.color}`,
            whiteSpace: "nowrap",
            backdropFilter: "blur(4px)",
          }}
        >
          {node.label}
        </div>
      </Html>
    </group>
  );
}

function SceneContent({
  nodes,
  selectedId,
  onSelect,
  onDrag,
}: {
  nodes: SpatialNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrag: (id: string, pos: [number, number, number]) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[8, 12, 6]} intensity={1.1} castShadow />
      <pointLight position={[-8, -4, -6]} intensity={0.5} color="#6366f1" />
      <Stars radius={80} depth={40} count={1800} factor={3} fade speed={0.6} />
      <Grid
        position={[0, -2.2, 0]}
        args={[40, 40]}
        cellColor="#1f2937"
        sectionColor="#334155"
        sectionSize={4}
        fadeDistance={28}
        infiniteGrid
      />
      <mesh onClick={() => onSelect(null)} position={[0, -2.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {nodes.map((n) => (
        <NodeMesh
          key={n.id}
          node={n}
          selected={n.id === selectedId}
          onSelect={() => onSelect(n.id)}
          onDrag={(pos) => onDrag(n.id, pos)}
        />
      ))}
    </>
  );
}

export function SpatialScenePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listSpatialNodes);
  const upsert = useServerFn(upsertSpatialNode);
  const move = useServerFn(moveSpatialNode);
  const del = useServerFn(deleteSpatialNode);
  const seed = useServerFn(seedSceneFromFiles);
  const saveView = useServerFn(saveViewpoint);

  const { data, isLoading } = useQuery({
    queryKey: ["spatial-nodes", projectId],
    queryFn: () => list({ data: { projectId } }),
  });
  const nodes = (data?.nodes ?? []) as SpatialNode[];
  const viewpoints = data?.viewpoints ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [viewName, setViewName] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["spatial-nodes", projectId] });

  const seedMut = useMutation({
    mutationFn: () => seed({ data: { projectId } }),
    onSuccess: (r) => {
      toast.success(`Seeded ${r.inserted} nodes from project files`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: () => {
      const golden = Math.PI * (3 - Math.sqrt(5));
      const i = nodes.length;
      const r = Math.sqrt(i + 1) * 1.4;
      const a = i * golden;
      return upsert({
        data: {
          projectId,
          kind: "note",
          label: label.trim() || `Node ${i + 1}`,
          position: { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r },
          color,
          scale: 1,
          metadata: {},
        },
      });
    },
    onSuccess: () => {
      setLabel("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMut = useMutation({
    mutationFn: (vars: { id: string; pos: [number, number, number] }) =>
      move({ data: { id: vars.id, position: { x: vars.pos[0], y: vars.pos[1], z: vars.pos[2] } } }),
    onSuccess: invalidate,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      setSelectedId(null);
      invalidate();
    },
  });

  const saveViewMut = useMutation({
    mutationFn: () =>
      saveView({
        data: {
          projectId,
          name: viewName.trim() || `View ${(viewpoints.length ?? 0) + 1}`,
          camera: { x: 8, y: 6, z: 12 },
          target: { x: 0, y: 0, z: 0 },
        },
      }),
    onSuccess: () => {
      setViewName("");
      toast.success("Viewpoint saved");
      invalidate();
    },
  });

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Box className="h-4 w-4" /> 3D Workspace Scene
          <Badge variant="secondary" className="ml-2">{nodes.length} nodes</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_280px]">
          <div className="relative h-[460px] rounded-md overflow-hidden border bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950">
            <Canvas
              shadows
              camera={{ position: [8, 6, 12], fov: 50 }}
              gl={{ antialias: true, alpha: true }}
              dpr={[1, 2]}
            >
              <Suspense fallback={null}>
                <SceneContent
                  nodes={nodes}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onDrag={(id, pos) => moveMut.mutate({ id, pos })}
                />
              </Suspense>
              <OrbitControls enableDamping dampingFactor={0.08} makeDefault />
            </Canvas>
            {isLoading && (
              <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                Loading scene...
              </div>
            )}
            {nodes.length === 0 && !isLoading && (
              <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-md bg-background/80 px-3 py-1.5 text-xs backdrop-blur">
                Empty scene — seed from files or add a node
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Quick actions</Label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Seed from files
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-xs">Add node</Label>
              <Input
                placeholder="Label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-14 p-1"
                />
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => addMut.mutate()}
                  disabled={addMut.isPending}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-xs">Inspector</Label>
              {selectedNode ? (
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Label:</span> {selectedNode.label}
                  </div>
                  {selectedNode.file_path && (
                    <div className="truncate">
                      <span className="text-muted-foreground">Path:</span> {selectedNode.file_path}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Kind:</span> {selectedNode.kind}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pos:</span>{" "}
                    {selectedNode.pos_x.toFixed(1)}, {selectedNode.pos_y.toFixed(1)}, {selectedNode.pos_z.toFixed(1)}
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={() => delMut.mutate(selectedNode.id)}
                    disabled={delMut.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Click a node to inspect</div>
              )}
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-xs flex items-center gap-1">
                <Camera className="h-3 w-3" /> Viewpoints ({viewpoints.length})
              </Label>
              <Input
                placeholder="View name"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => saveViewMut.mutate()}
                disabled={saveViewMut.isPending}
              >
                Save current view
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Tip: drag to orbit, scroll to zoom, double-click a node to nudge it. Built on WebGL via react-three-fiber.
        </p>
      </CardContent>
    </Card>
  );
}
