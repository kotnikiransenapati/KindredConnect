import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listZones, getResidency, setResidency, listResidencyAudit,
} from "@/lib/residency.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Globe2, ShieldCheck, History } from "lucide-react";

type Enc = "platform"|"cmek"|"byok";

export function ResidencyPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const lz = useServerFn(listZones);
  const gr = useServerFn(getResidency);
  const sr = useServerFn(setResidency);
  const la = useServerFn(listResidencyAudit);

  const zones = useQuery({ queryKey: ["res-zones"], queryFn: () => lz({ data: undefined as any }) });
  const cur = useQuery({ queryKey: ["res-cur", projectId], queryFn: () => gr({ data: { projectId } }) });
  const audit = useQuery({ queryKey: ["res-audit", projectId],
    queryFn: () => la({ data: { projectId, limit: 50 } }), refetchInterval: 12_000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["res-cur", projectId] });
    qc.invalidateQueries({ queryKey: ["res-audit", projectId] });
  };

  const [primary, setPrimary] = useState<string>("");
  const [backup, setBackup] = useState<string>("");
  const [enc, setEnc] = useState<Enc>("cmek");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (cur.data) {
      setPrimary((cur.data as any).primary_zone ?? "");
      setBackup((cur.data as any).backup_zone ?? "");
      setEnc(((cur.data as any).encryption_mode as Enc) ?? "cmek");
    } else if (zones.data?.length && !primary) {
      setPrimary((zones.data[0] as any).code);
    }
  }, [cur.data, zones.data]);

  const saveM = useMutation({
    mutationFn: () => sr({ data: {
      projectId,
      primary_zone: primary,
      backup_zone: backup || null,
      encryption_mode: enc,
      reason: reason || undefined,
    } }),
    onSuccess: () => { toast.success("Residency updated"); setReason(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="h-4 w-4" /> Data Residency
          {cur.data && <Badge variant="secondary">{(cur.data as any).primary_zone}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pin">
          <TabsList>
            <TabsTrigger value="pin">Pin region</TabsTrigger>
            <TabsTrigger value="audit"><History className="h-3 w-3 mr-1" /> Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="pin" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Primary zone</Label>
                <Select value={primary} onValueChange={setPrimary}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(zones.data ?? []).map((z: any) => (
                      <SelectItem key={z.code} value={z.code}>
                        {z.display_name} · {z.country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Backup zone (optional)</Label>
                <Select value={backup || "__none"} onValueChange={(v) => setBackup(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {(zones.data ?? []).filter((z: any) => z.code !== primary).map((z: any) => (
                      <SelectItem key={z.code} value={z.code}>
                        {z.display_name} · {z.country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Encryption</Label>
                <Select value={enc} onValueChange={(v) => setEnc(v as Enc)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">Platform-managed</SelectItem>
                    <SelectItem value="cmek">Customer-managed (CMEK)</SelectItem>
                    <SelectItem value="byok">Bring-your-own-key (BYOK)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {primary && (
              <div className="border rounded-lg p-3 text-xs space-y-1 bg-muted/30">
                {(zones.data ?? []).filter((z: any) => z.code === primary).map((z: any) => (
                  <div key={z.code} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{z.code}</Badge>
                    <span>{z.display_name}</span>
                    <span className="text-muted-foreground">· provider: {z.provider}</span>
                    <div className="flex gap-1">
                      {(z.compliance ?? []).map((c: string) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Reason (for audit log)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. EU customer onboarding" />
            </div>
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !primary}>
              {saveM.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Save residency
            </Button>
          </TabsContent>

          <TabsContent value="audit" className="space-y-2 mt-3">
            {(audit.data ?? []).map((a: any) => (
              <div key={a.id} className="border rounded-lg p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{a.action}</Badge>
                  {a.from_zone && <span className="text-muted-foreground">{a.from_zone} →</span>}
                  {a.to_zone && <Badge variant="secondary">{a.to_zone}</Badge>}
                  <span className="ml-auto text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.reason && <div className="mt-1 text-muted-foreground">{a.reason}</div>}
              </div>
            ))}
            {!audit.data?.length && <div className="text-sm text-muted-foreground">No residency changes yet.</div>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
