// P47 — Realtime whiteboard panel.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appendStroke, clearBoard, createBoard, deleteBoard, listBoards, listStrokes } from "@/lib/whiteboard.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#ffffff", "#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa"];

export function WhiteboardPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lFn = useServerFn(listBoards);
  const cFn = useServerFn(createBoard);
  const dFn = useServerFn(deleteBoard);
  const sFn = useServerFn(listStrokes);
  const apFn = useServerFn(appendStroke);
  const clrFn = useServerFn(clearBoard);

  const boards = useQuery({ queryKey: ["wb-boards", projectId], queryFn: () => lFn({ data: { projectId } }) });
  const [boardId, setBoardId] = useState<string>("");
  const [name, setName] = useState("Sprint planning");
  const [tool, setTool] = useState<"pen" | "marker" | "highlighter" | "eraser">("pen");
  const [color, setColor] = useState("#60a5fa");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const sinceRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ active: boolean; points: { x: number; y: number }[] }>({ active: false, points: [] });

  const strokes = useQuery({
    queryKey: ["wb-strokes", projectId, boardId],
    queryFn: () => sFn({ data: { projectId, boardId, sinceSeq: 0 } }),
    enabled: !!boardId,
    refetchInterval: 4000,
  });

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes.data ?? []) {
      ctx.strokeStyle = s.tool === "eraser" ? "#0b1020" : s.color;
      ctx.lineWidth = s.stroke_width; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      (s.points ?? []).forEach((p: any, i: number) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      sinceRef.current = Math.max(sinceRef.current, Number(s.seq));
    }
  }, [strokes.data]);

  const create = useMutation({
    mutationFn: () => cFn({ data: { projectId, name } }),
    onSuccess: (b: any) => { setBoardId(b.id); qc.invalidateQueries({ queryKey: ["wb-boards", projectId] }); toast.success("Board created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvasRef.current!.width, y: ((e.clientY - r.top) / r.height) * canvasRef.current!.height };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = { active: true, points: [pos(e)] }; };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current.active) return;
    const p = pos(e); drawing.current.points.push(p);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = tool === "eraser" ? "#0b1020" : color; ctx.lineWidth = strokeWidth; ctx.lineCap = "round";
    const pts = drawing.current.points;
    ctx.beginPath(); ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const onUp = async () => {
    if (!drawing.current.active || !boardId) { drawing.current = { active: false, points: [] }; return; }
    const pts = drawing.current.points; drawing.current = { active: false, points: [] };
    if (pts.length < 2) return;
    try {
      await apFn({ data: { projectId, boardId, tool, color, strokeWidth, points: pts, metadata: {} } });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center gap-2">
        <Pencil className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Realtime whiteboard</CardTitle>
        <Badge variant="outline" className="ml-2">P47</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]"><Label>New board</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button onClick={() => create.mutate()} size="sm">Create</Button>
          <Select value={boardId} onValueChange={setBoardId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Open board" /></SelectTrigger>
            <SelectContent>{(boards.data ?? []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          {boardId && (
            <>
              <Button size="sm" variant="outline" onClick={() => clrFn({ data: { projectId, boardId } }).then(() => qc.invalidateQueries({ queryKey: ["wb-strokes", projectId, boardId] }))}>Clear</Button>
              <Button size="sm" variant="ghost" onClick={() => dFn({ data: { projectId, id: boardId } }).then(() => { setBoardId(""); qc.invalidateQueries({ queryKey: ["wb-boards", projectId] }); })}><Trash2 className="h-3.5 w-3.5" /></Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={tool} onValueChange={(v) => setTool(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["pen", "marker", "highlighter", "eraser"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-primary" : "border-border/40"}`} style={{ background: c }} />
            ))}
          </div>
          <Input type="number" min={1} max={32} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-[80px]" />
        </div>

        <div className="rounded-md border border-border/60 bg-[#0b1020]">
          <canvas
            ref={canvasRef} width={960} height={540}
            className="block w-full touch-none"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          />
        </div>
        <div className="text-xs text-muted-foreground">{strokes.data?.length ?? 0} strokes · syncs every 4s</div>
      </CardContent>
    </Card>
  );
}
