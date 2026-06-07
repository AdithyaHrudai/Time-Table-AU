import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, GraduationCap, Info } from "lucide-react";
import { toast } from "sonner";

export default function SectionsManagement({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [sections, setSections] = useState([]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const [sessionRes, sectionsRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, auth),
        axios.get(`/api/sessions/${sessionId}/sections`, auth),
      ]);
      setSession(sessionRes.data);
      setSections(sectionsRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => {
    const g = {};
    sections.forEach((s) => {
      if (!g[s.year]) g[s.year] = [];
      g[s.year].push(s);
    });
    Object.values(g).forEach((arr) =>
      arr.sort((a, b) => {
        if (a.stream !== b.stream) return a.stream === "4yr" ? -1 : 1;
        return (a.section_number || 0) - (b.section_number || 0);
      })
    );
    return g;
  }, [sections]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  const years = Object.keys(groups).map(Number).sort();

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />

      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Sections</h1>
            <p className="text-slate-600 max-w-3xl">
              Sections are auto-generated from your year configuration in Session Setup.
              Each section is split into <strong>Batch-1</strong> and <strong>Batch-2</strong> for labs.
              To change section counts or strength, go back to Session Setup.
            </p>
          </div>
        </div>

        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="py-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700">
              Naming: a single 4-yr section is <code>{`{y}/4 CSE`}</code>; multiple 4-yr get
              <code> {`{y}/4 CSE - N`}</code>. 6-yr sections are always numbered:
              <code> {`{y}/6 CSE - 1, 2, …`}</code>
            </p>
          </CardContent>
        </Card>

        {sections.length === 0 ? (
          <Card>
            <CardContent className="empty-state py-12">
              <div className="empty-state-icon">
                <GraduationCap className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No Sections Yet</h3>
              <p className="text-slate-600 mb-4">
                Configure years and section counts in Session Setup to generate sections.
              </p>
              <Button onClick={() => navigate(`/session/${sessionId}/setup`)}>
                Go to Session Setup
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {years.map((y) => (
              <Card key={y}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-blue-600" />
                    Year {y} ({groups[y].length} section{groups[y].length === 1 ? "" : "s"})
                  </CardTitle>
                  <CardDescription>
                    {groups[y].filter((s) => s.stream === "4yr").length} × 4-yr B.Tech, {" "}
                    {groups[y].filter((s) => s.stream === "6yr").length} × 6-yr integrated
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Section</TableHead>
                        <TableHead>Stream</TableHead>
                        <TableHead>Strength</TableHead>
                        <TableHead>Batches</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups[y].map((sec) => (
                        <TableRow key={sec.section_id} data-testid={`section-row-${sec.section_id}`}>
                          <TableCell className="font-medium">{sec.name}</TableCell>
                          <TableCell>
                            <Badge variant={sec.stream === "4yr" ? "default" : "secondary"}>
                              {sec.stream === "4yr" ? "4-yr B.Tech" : "6-yr Integrated"}
                            </Badge>
                          </TableCell>
                          <TableCell>{sec.strength}</TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            Batch-1 ({Math.ceil(sec.strength / 2)}) + Batch-2 ({Math.floor(sec.strength / 2)})
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => navigate(`/session/${sessionId}/setup`)}
            data-testid="prev-step-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Session Setup
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 btn-primary"
            onClick={() => navigate(`/session/${sessionId}/subjects`)}
            data-testid="next-step-btn"
          >
            Next: Subjects
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
