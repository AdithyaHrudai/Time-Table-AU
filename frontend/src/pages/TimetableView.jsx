import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, RefreshCw, Table2, Users, GraduationCap, AlertTriangle, Layers, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function TimetableView({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [session, setSession] = useState(null);
  const [timetable, setTimetable] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [feasibility, setFeasibility] = useState(null);
  const [viewType, setViewType] = useState("master"); // master | faculty | section | year
  const [filterId, setFilterId] = useState("");

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const [sess, tt, fac, secs, subs, feas] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, auth),
        axios.get(`/api/sessions/${sessionId}/timetable`, auth),
        axios.get(`/api/sessions/${sessionId}/faculty`, auth),
        axios.get(`/api/sessions/${sessionId}/sections`, auth),
        axios.get(`/api/sessions/${sessionId}/subjects`, auth),
        axios.get(`/api/sessions/${sessionId}/feasibility`, auth),
      ]);
      setSession(sess.data);
      setTimetable(tt.data);
      setFaculty(fac.data);
      setSections(secs.data);
      setSubjects(subs.data);
      setFeasibility(feas.data);
    } catch (error) {
      toast.error("Failed to fetch timetable");
    } finally {
      setLoading(false);
    }
  };

  const subjectById = useMemo(() => {
    const m = {}; subjects.forEach((s) => { m[s.subject_id] = s; }); return m;
  }, [subjects]);
  const sectionById = useMemo(() => {
    const m = {}; sections.forEach((s) => { m[s.section_id] = s; }); return m;
  }, [sections]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await axios.post(`/api/sessions/${sessionId}/generate-timetable`, null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.unassigned_count > 0) {
        toast.warning(`Generated with ${res.data.unassigned_count} unassigned demand items — see below`);
      } else {
        toast.success("Timetable generated");
      }
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to generate");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      let url = `/api/sessions/${sessionId}/export-pdf?view_type=${viewType}`;
      if (filterId) url += `&filter_id=${encodeURIComponent(filterId)}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob"
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `timetable_${session?.name?.replace(/\s+/g, "_") || "export"}_${viewType}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  const days = session?.working_days || [];
  const slots = session?.time_slots || [];
  const lunchSlot = session?.lunch_slot || "12:20-13:30";

  // Filter entries
  let entries = timetable?.entries || [];
  if (viewType === "faculty" && filterId) entries = entries.filter((e) => e.faculty_id === filterId);
  else if (viewType === "section" && filterId) entries = entries.filter((e) => e.section_id === filterId);
  else if (viewType === "year" && filterId) entries = entries.filter((e) => String(e.section_year) === String(filterId));

  // Build display rows: slot1, slot2, lunch, slot3
  const displayRows = [];
  slots.forEach((s, idx) => {
    displayRows.push({ slot: s, isLunch: false });
    if (idx === 1) displayRows.push({ slot: lunchSlot, isLunch: true });
  });

  const cellEntries = (day, slot) => entries.filter((e) => e.day === day && e.time_slot === slot);

  const unassigned = timetable?.unassigned || [];
  const facultyLoad = timetable?.faculty_load || {};
  const totalEntries = entries.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />

      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Timetable</h1>
            <p className="text-slate-600">
              {totalEntries} scheduled sessions • {days.length} working days • {slots.length} slots/day
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleRegenerate} disabled={regenerating} data-testid="regenerate-btn">
              <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? "spinner" : ""}`} />
              {regenerating ? "Generating..." : "Generate / Regenerate"}
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 btn-primary"
              onClick={handleDownloadPDF}
              disabled={downloading || totalEntries === 0 || (viewType !== "master" && !filterId)}
              data-testid="download-pdf-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              {downloading ? "Downloading..." : "Download PDF"}
            </Button>
          </div>
        </div>

        {feasibility && (
          <Card className={`mb-6 ${feasibility.status === "feasible" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                {feasibility.status === "feasible" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium mb-1 ${feasibility.status === "feasible" ? "text-emerald-900" : "text-amber-900"}`}>
                    {feasibility.status === "feasible"
                      ? "Inputs look feasible — capacity is sufficient for a clash-free timetable."
                      : "Capacity check: review before generating"}
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700 mb-1">
                    <span>Theory headroom: <strong className={feasibility.headroom.theory < 0 ? "text-rose-600" : ""}>{feasibility.headroom.theory}</strong></span>
                    <span>Lab headroom: <strong className={feasibility.headroom.lab < 0 ? "text-rose-600" : ""}>{feasibility.headroom.lab}</strong></span>
                    <span>Faculty: <strong>{feasibility.capacity.faculty_count}</strong></span>
                    <span>Weekly sessions to place: <strong>{feasibility.demand.total_weekly_sessions}</strong></span>
                  </div>
                  {feasibility.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-amber-900 list-disc list-inside">
                      {feasibility.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {unassigned.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-900 mb-1">
                    {unassigned.length} demand item(s) couldn&rsquo;t be scheduled
                  </p>
                  <p className="text-sm text-amber-800 mb-3">
                    Common causes: not enough faculty pattern-capacity for the demanded subjects, or no free slot satisfies all constraints. Add more faculty / split sections / verify subjects.
                  </p>
                  <details className="text-xs text-amber-900">
                    <summary className="cursor-pointer">Show details</summary>
                    <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {unassigned.slice(0, 50).map((u, i) => {
                        const subj = subjectById[u.subject_id];
                        const sec = sectionById[u.section_id];
                        return (
                          <li key={i}>
                            {subj?.code || u.subject_id} ({u.role}{u.batch ? ` B${u.batch}` : ""}) for {sec?.name || u.section_id} — {u.reason}
                          </li>
                        );
                      })}
                      {unassigned.length > 50 && <li>… and {unassigned.length - 50} more</li>}
                    </ul>
                  </details>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardContent className="py-4">
            <Tabs value={viewType} onValueChange={(v) => { setViewType(v); setFilterId(""); }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <TabsList>
                  <TabsTrigger value="master" data-testid="view-master-tab">
                    <Table2 className="w-4 h-4 mr-2" /> Master
                  </TabsTrigger>
                  <TabsTrigger value="year" data-testid="view-year-tab">
                    <Layers className="w-4 h-4 mr-2" /> By Year
                  </TabsTrigger>
                  <TabsTrigger value="section" data-testid="view-section-tab">
                    <GraduationCap className="w-4 h-4 mr-2" /> By Section
                  </TabsTrigger>
                  <TabsTrigger value="faculty" data-testid="view-faculty-tab">
                    <Users className="w-4 h-4 mr-2" /> By Faculty
                  </TabsTrigger>
                </TabsList>

                {viewType === "year" && (
                  <Select value={filterId} onValueChange={setFilterId}>
                    <SelectTrigger className="w-64" data-testid="filter-year-select">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {(session?.years || []).map((y) => (
                        <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {viewType === "section" && (
                  <Select value={filterId} onValueChange={setFilterId}>
                    <SelectTrigger className="w-64" data-testid="filter-section-select">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.section_id} value={s.section_id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {viewType === "faculty" && (
                  <Select value={filterId} onValueChange={setFilterId}>
                    <SelectTrigger className="w-64" data-testid="filter-faculty-select">
                      <SelectValue placeholder="Select faculty" />
                    </SelectTrigger>
                    <SelectContent>
                      {faculty.map((f) => (
                        <SelectItem key={f.faculty_id} value={f.faculty_id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {totalEntries === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Table2 className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No Timetable Yet</h3>
                <p className="text-slate-600 mb-4">Click &ldquo;Generate&rdquo; to build the schedule.</p>
                <Button onClick={handleRegenerate} disabled={regenerating}>
                  Generate Timetable
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg">
                {viewType === "master" && "Master Timetable (all sections)"}
                {viewType === "year" && (filterId ? `Year ${filterId}` : "Select a year")}
                {viewType === "section" && (filterId ? `Section: ${sections.find((s) => s.section_id === filterId)?.name}` : "Select a section")}
                {viewType === "faculty" && (filterId ? `Faculty: ${faculty.find((f) => f.faculty_id === filterId)?.name}` : "Select a faculty")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="px-3 py-2 border border-slate-700 w-32">Time</th>
                    {days.map((d) => (
                      <th key={d} className="px-3 py-2 border border-slate-700">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, ri) => {
                    if (row.isLunch) {
                      return (
                        <tr key={`lunch-${ri}`} className="bg-amber-50">
                          <td className="px-3 py-2 border border-slate-200 font-medium text-slate-700">{row.slot}</td>
                          {days.map((d) => (
                            <td key={d} className="px-3 py-2 border border-slate-200 text-center font-medium text-amber-700">
                              LUNCH
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    return (
                      <tr key={`row-${ri}`}>
                        <td className="px-3 py-2 border border-slate-200 font-medium text-slate-700 bg-slate-50 align-top">
                          {row.slot}
                        </td>
                        {days.map((d) => {
                          const cell = cellEntries(d, row.slot);
                          return (
                            <td key={d} className="px-2 py-2 border border-slate-200 align-top min-w-[160px]" data-testid={`cell-${d}-${row.slot}`}>
                              {cell.length === 0 ? (
                                <span className="text-slate-300 text-xs">—</span>
                              ) : (
                                <div className="space-y-1.5">
                                  {cell.map((e) => (
                                    <div
                                      key={e.entry_id}
                                      className={`rounded-md px-2 py-1.5 text-xs leading-tight border ${
                                        e.is_lab
                                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                          : "bg-blue-50 border-blue-200 text-blue-900"
                                      }`}
                                    >
                                      {viewType === "section" ? (
                                        // Section view: subject name front and centre. Code +
                                        // faculty are repeated in the legend below the table.
                                        <div className="font-semibold leading-snug" title={e.subject_name}>
                                          {e.subject_name}
                                          {e.is_lab && (
                                            <span className="ml-1 px-1 py-0.5 bg-emerald-600 text-white text-[10px] rounded">
                                              LAB{e.batch ? ` B${e.batch}` : ""}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <>
                                          <div className="font-semibold">
                                            {e.subject_code}
                                            {e.is_lab && (
                                              <span className="ml-1 px-1 py-0.5 bg-emerald-600 text-white text-[10px] rounded">
                                                LAB{e.batch ? ` B${e.batch}` : ""}
                                              </span>
                                            )}
                                          </div>
                                          <div className="truncate" title={e.faculty_name}>{e.faculty_name}</div>
                                          <div className="text-slate-500 truncate">{e.section_name}</div>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {viewType === "section" && filterId && totalEntries > 0 && (() => {
          // Aggregate: subject_id → { code, name, theory: Set(faculty_name), lab: Set(faculty_name), has_lab }
          const byId = {};
          for (const e of entries) {
            const k = e.subject_id;
            if (!byId[k]) {
              byId[k] = {
                code: e.subject_code,
                name: e.subject_name,
                theory: new Set(),
                lab: new Set(),
              };
            }
            if (e.is_lab) byId[k].lab.add(e.faculty_name);
            else byId[k].theory.add(e.faculty_name);
          }
          const rows = Object.entries(byId).sort((a, b) => a[1].code.localeCompare(b[1].code));
          return (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Subject &rarr; Faculty</CardTitle>
                <p className="text-sm text-slate-600">
                  Who teaches which subject for this section.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-700 w-28">Code</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Subject</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Theory faculty</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Lab faculty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([sid, info]) => (
                      <tr key={sid} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-2 font-mono font-medium">{info.code}</td>
                        <td className="px-4 py-2">{info.name}</td>
                        <td className="px-4 py-2">
                          {info.theory.size === 0 ? <span className="text-slate-400">—</span> : [...info.theory].join(", ")}
                        </td>
                        <td className="px-4 py-2">
                          {info.lab.size === 0 ? <span className="text-slate-400">—</span> : [...info.lab].join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })()}

        {Object.keys(facultyLoad).length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Faculty Load Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {faculty.map((f) => {
                  const sessions = facultyLoad[f.faculty_id] || 0;
                  const hours = (sessions * 100 / 60).toFixed(1);
                  return (
                    <div key={f.faculty_id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      <div className="font-medium truncate">{f.name}</div>
                      <div className="text-slate-500 text-xs">
                        {sessions} sessions • ~{hours} hrs/wk
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-start mt-8">
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/faculty-choices`)} data-testid="back-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Faculty Choices
          </Button>
        </div>
      </main>
    </div>
  );
}
