import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, ListChecks, Trash2, Plus, Clock } from "lucide-react";
import { toast } from "sonner";

const PATTERN_CAPS = {
  "2T+1L": { theory: 2, lab: 1 },
  "2T+2L": { theory: 2, lab: 2 },
  "3T+1L": { theory: 3, lab: 1 },
};

// Sentinel used by the picker selects to represent "no pin" — Radix Select
// doesn't accept empty-string values, and `null`/`undefined` clear the trigger.
const ANY = "__any__";

export default function FacultyChoices({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [choices, setChoices] = useState([]);
  const [designationMeta, setDesignationMeta] = useState([]);
  // faculty_id -> {subject_id, section_id, role, day, time_slot}
  const [picker, setPicker] = useState({});

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fetchAll = async () => {
    try {
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const [sess, fac, subs, secs, chs, meta] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, auth),
        axios.get(`/api/sessions/${sessionId}/faculty`, auth),
        axios.get(`/api/sessions/${sessionId}/subjects`, auth),
        axios.get(`/api/sessions/${sessionId}/sections`, auth),
        axios.get(`/api/sessions/${sessionId}/faculty-choices`, auth),
        axios.get(`/api/meta/designations`, auth),
      ]);
      setSession(sess.data);
      setFaculty(fac.data);
      setSubjects(subs.data);
      setSections(secs.data);
      setChoices(chs.data);
      setDesignationMeta(meta.data);
    } catch (error) {
      toast.error("Failed to fetch data");
      navigate("/dashboard");
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
  const designationByValue = (v) => designationMeta.find((d) => d.value === v);

  const days = session?.working_days || [];
  const slots = session?.time_slots || [];

  const choicesByFaculty = useMemo(() => {
    const m = {};
    choices.forEach((c) => {
      if (!m[c.faculty_id]) m[c.faculty_id] = [];
      m[c.faculty_id].push(c);
    });
    return m;
  }, [choices]);

  const usedCounts = (facId) => {
    const list = choicesByFaculty[facId] || [];
    return {
      theory: list.filter((c) => c.role === "theory").length,
      lab: list.filter((c) => c.role === "lab").length,
    };
  };

  const setPick = (facId, patch) => {
    setPicker((prev) => ({ ...prev, [facId]: { ...(prev[facId] || {}), ...patch } }));
  };

  const addChoice = async (facId) => {
    const p = picker[facId] || {};
    if (!p.subject_id || !p.section_id || !p.role) {
      toast.error("Pick subject, section, and role");
      return;
    }
    try {
      await axios.post(`/api/sessions/${sessionId}/faculty-choices`, {
        faculty_id: facId,
        subject_id: p.subject_id,
        section_id: p.section_id,
        role: p.role,
        day: p.day && p.day !== ANY ? p.day : null,
        time_slot: p.time_slot && p.time_slot !== ANY ? p.time_slot : null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Choice added");
      setPicker((prev) => ({ ...prev, [facId]: {} }));
      fetchAll();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to add");
    }
  };

  const deleteChoice = async (choiceId) => {
    try {
      await axios.delete(`/api/sessions/${sessionId}/faculty-choices/${choiceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Removed");
      fetchAll();
    } catch (error) {
      toast.error("Failed to remove");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />

      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Faculty Choices</h1>
            <p className="text-slate-600 max-w-3xl">
              Record which subjects + sections each faculty wants to teach, and optionally pin a preferred day and / or time slot.
              <strong> Category 1, 2, 3 (Sr / Assoc / Asst Professor)</strong> picks are honored as hard constraints, in that priority order.
              <strong> Category 4, 5 (ADHOC / Research Scholar)</strong> picks are soft hints &mdash; the generator tries to honor them but will reassign if it can&rsquo;t avoid clashes.
              Day/slot are always optional &mdash; leave blank to let the generator decide.
            </p>
          </div>
        </div>

        {faculty.length === 0 ? (
          <Card>
            <CardContent className="empty-state py-12">
              <div className="empty-state-icon"><ListChecks className="w-10 h-10 text-slate-400" /></div>
              <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No faculty yet</h3>
              <p className="text-slate-600 mb-4">Add faculty before recording their choices.</p>
              <Button onClick={() => navigate(`/session/${sessionId}/faculty`)}>Go to Faculty</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {faculty.map((f) => {
              const meta = designationByValue(f.designation);
              const caps = PATTERN_CAPS[f.pattern] || { theory: 0, lab: 0 };
              const used = usedCounts(f.faculty_id);
              const isHard = meta?.choice_priority;
              const list = choicesByFaculty[f.faculty_id] || [];
              const pick = picker[f.faculty_id] || {};
              const chosenSubject = pick.subject_id ? subjectById[pick.subject_id] : null;
              const allowedSections = chosenSubject
                ? sections.filter((s) => s.year === chosenSubject.year)
                : [];
              const allowedRoles = chosenSubject
                ? (chosenSubject.requires_lab ? ["theory", "lab"] : ["theory"])
                : ["theory", "lab"];

              // If faculty has a non-empty subject_ids whitelist, narrow the
              // picker subject list to those. Helps faculty stay within their
              // declared expertise.
              const facultySubjects = (f.subject_ids && f.subject_ids.length)
                ? subjects.filter((s) => f.subject_ids.includes(s.subject_id))
                : subjects;

              return (
                <Card key={f.faculty_id} data-testid={`faculty-choice-card-${f.faculty_id}`}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-3 flex-wrap">
                      <span>{f.name}</span>
                      <Badge variant="outline">Cat {meta?.category ?? "?"}</Badge>
                      <Badge variant={isHard ? "default" : "secondary"}>
                        {isHard ? "Hard choice" : "Soft hint"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {meta?.label || f.designation} • Pattern {f.pattern} •
                      {" "}Theory {used.theory}/{caps.theory}, Lab {used.lab}/{caps.lab}
                      {f.subject_ids?.length > 0 && (
                        <> • Expertise: {f.subject_ids.length} subject{f.subject_ids.length === 1 ? "" : "s"}</>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {list.length > 0 && (
                      <div className="space-y-2">
                        {list.map((c) => {
                          const subj = subjectById[c.subject_id];
                          const sec = sectionById[c.section_id];
                          return (
                            <div
                              key={c.choice_id}
                              className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                              data-testid={`choice-row-${c.choice_id}`}
                            >
                              <div className="flex items-center gap-3 text-sm flex-wrap">
                                <span className="font-mono font-medium">{subj?.code || c.subject_id}</span>
                                <span>{subj?.name || "—"}</span>
                                <span className="text-slate-400">→</span>
                                <span>{sec?.name || c.section_id}</span>
                                <Badge variant={c.role === "lab" ? "secondary" : "outline"}>
                                  {c.role}
                                </Badge>
                                {(c.day || c.time_slot) && (
                                  <Badge variant="default" className="bg-blue-100 text-blue-800 hover:bg-blue-100 gap-1">
                                    <Clock className="w-3 h-3" />
                                    {c.day || "any day"}
                                    {c.time_slot ? ` • ${c.time_slot}` : ""}
                                  </Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost" size="icon"
                                className="text-rose-600 hover:bg-rose-50"
                                onClick={() => deleteChoice(c.choice_id)}
                                data-testid={`remove-choice-${c.choice_id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">Subject</Label>
                        <Select
                          value={pick.subject_id || ""}
                          onValueChange={(v) => setPick(f.faculty_id, { subject_id: v, section_id: "", role: "" })}
                        >
                          <SelectTrigger data-testid={`pick-subject-${f.faculty_id}`}>
                            <SelectValue placeholder="Choose subject" />
                          </SelectTrigger>
                          <SelectContent>
                            {facultySubjects.map((s) => (
                              <SelectItem key={s.subject_id} value={s.subject_id}>
                                Y{s.year} • {s.code} — {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Section</Label>
                        <Select
                          value={pick.section_id || ""}
                          onValueChange={(v) => setPick(f.faculty_id, { section_id: v })}
                          disabled={!chosenSubject}
                        >
                          <SelectTrigger data-testid={`pick-section-${f.faculty_id}`}>
                            <SelectValue placeholder={chosenSubject ? "Choose section" : "Subject first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedSections.map((s) => (
                              <SelectItem key={s.section_id} value={s.section_id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Role</Label>
                        <Select
                          value={pick.role || ""}
                          onValueChange={(v) => setPick(f.faculty_id, { role: v })}
                          disabled={!chosenSubject}
                        >
                          <SelectTrigger data-testid={`pick-role-${f.faculty_id}`}>
                            <SelectValue placeholder="theory or lab" />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedRoles.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Day (optional)</Label>
                        <Select
                          value={pick.day || ANY}
                          onValueChange={(v) => setPick(f.faculty_id, { day: v })}
                        >
                          <SelectTrigger data-testid={`pick-day-${f.faculty_id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ANY}>Any day</SelectItem>
                            {days.map((d) => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">Slot (optional)</Label>
                        <Select
                          value={pick.time_slot || ANY}
                          onValueChange={(v) => setPick(f.faculty_id, { time_slot: v })}
                        >
                          <SelectTrigger data-testid={`pick-slot-${f.faculty_id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ANY}>Any slot</SelectItem>
                            {slots.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => addChoice(f.faculty_id)}
                        disabled={!pick.subject_id || !pick.section_id || !pick.role}
                        data-testid={`add-choice-${f.faculty_id}`}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add choice
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/faculty`)} data-testid="prev-step-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Faculty
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 btn-primary"
            onClick={() => navigate(`/session/${sessionId}/timetable`)}
            data-testid="next-step-btn"
          >
            Next: Generate Timetable
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
