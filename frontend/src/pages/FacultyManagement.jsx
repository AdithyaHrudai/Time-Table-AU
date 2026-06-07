import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ArrowRight, ArrowLeft, Pencil, Trash2, Users, BookOpen, CalendarOff } from "lucide-react";
import { toast } from "sonner";

const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const emptyForm = {
  name: "",
  email: "",
  designation: "assistant_professor",
  pattern: "2T+2L",
  subject_ids: [],
  unavailable_days: [],
};

export default function FacultyManagement({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [designationMeta, setDesignationMeta] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const [sessionRes, facultyRes, subjectsRes, metaRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, auth),
        axios.get(`/api/sessions/${sessionId}/faculty`, auth),
        axios.get(`/api/sessions/${sessionId}/subjects`, auth),
        axios.get(`/api/meta/designations`, auth),
      ]);
      setSession(sessionRes.data);
      setFaculty(facultyRes.data);
      setSubjects(subjectsRes.data);
      setDesignationMeta(metaRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const designationByValue = (v) => designationMeta.find((d) => d.value === v);
  const allowedPatterns = (designation) => designationByValue(designation)?.patterns || [];
  const subjectsById = useMemo(() => {
    const m = {}; subjects.forEach((s) => { m[s.subject_id] = s; }); return m;
  }, [subjects]);

  // Group subjects by year for the multi-select.
  const subjectsByYear = useMemo(() => {
    const m = {};
    subjects.forEach((s) => {
      if (!m[s.year]) m[s.year] = [];
      m[s.year].push(s);
    });
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.code.localeCompare(b.code)));
    return m;
  }, [subjects]);

  // Whenever the designation OR the meta itself changes, force `pattern` to a
  // legal value. This fixes a race where the user picks Senior Professor before
  // the meta has loaded and saves an empty / mismatched pattern.
  useEffect(() => {
    if (!designationMeta.length) return;
    const patterns = allowedPatterns(formData.designation);
    if (patterns.length === 0) return;
    if (!patterns.includes(formData.pattern)) {
      setFormData((prev) => ({ ...prev, pattern: patterns[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.designation, designationMeta]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditing(null);
  };

  const handleEdit = (fac) => {
    setFormData({
      name: fac.name,
      email: fac.email || "",
      designation: fac.designation,
      pattern: fac.pattern,
      subject_ids: fac.subject_ids || [],
      unavailable_days: fac.unavailable_days || [],
    });
    setEditing(fac.faculty_id);
    setDialogOpen(true);
  };

  const onDesignationChange = (v) => {
    const patterns = allowedPatterns(v);
    setFormData((prev) => ({
      ...prev,
      designation: v,
      pattern: patterns.includes(prev.pattern) ? prev.pattern : patterns[0] || "2T+2L",
    }));
  };

  const toggleSubject = (subjectId) => {
    setFormData((prev) => ({
      ...prev,
      subject_ids: prev.subject_ids.includes(subjectId)
        ? prev.subject_ids.filter((sid) => sid !== subjectId)
        : [...prev.subject_ids, subjectId],
    }));
  };

  const toggleUnavailableDay = (day) => {
    setFormData((prev) => ({
      ...prev,
      unavailable_days: prev.unavailable_days.includes(day)
        ? prev.unavailable_days.filter((d) => d !== day)
        : [...prev.unavailable_days, day],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Enter faculty name");
      return;
    }
    setSaving(true);
    if (formData.unavailable_days.length >= WORKING_DAYS.length) {
      toast.error("Faculty must be available on at least one working day");
      setSaving(false);
      return;
    }
    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim() || null,
      designation: formData.designation,
      pattern: formData.pattern,
      subject_ids: formData.subject_ids,
      unavailable_days: formData.unavailable_days,
    };
    try {
      if (editing) {
        await axios.put(`/api/sessions/${sessionId}/faculty/${editing}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Faculty updated");
      } else {
        await axios.post(`/api/sessions/${sessionId}/faculty`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Faculty added");
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (facultyId) => {
    if (!window.confirm("Delete this faculty? Their choices will also be removed.")) return;
    try {
      await axios.delete(`/api/sessions/${sessionId}/faculty/${facultyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Faculty deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete faculty");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  const currentMeta = designationByValue(formData.designation);
  const currentPatterns = currentMeta?.patterns || [];
  const sessionYears = (session?.years || []).slice().sort();

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />

      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Faculty</h1>
            <p className="text-slate-600 max-w-3xl">
              Add every CSE faculty member. Designation determines the weekly teaching load and whether their subject/section choices are honored as hard or soft preferences. Pick the subjects each faculty is qualified to teach so the auto-fill stays within their expertise.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" data-testid="add-faculty-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Faculty
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit Faculty" : "Add Faculty"}</DialogTitle>
                <DialogDescription>
                  Min hours and lecture/lab pattern are auto-derived from designation.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="facultyName">Full Name *</Label>
                    <Input
                      id="facultyName"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Dr. R. Kumar"
                      required
                      data-testid="faculty-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="facultyEmail">Email (optional)</Label>
                    <Input
                      id="facultyEmail"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="r.kumar@au.edu.in"
                      data-testid="faculty-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Designation *</Label>
                  <Select value={formData.designation} onValueChange={onDesignationChange}>
                    <SelectTrigger data-testid="faculty-designation-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {designationMeta.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          Cat {d.category} — {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {currentMeta && (
                    <p className="text-xs text-slate-500">
                      Min {currentMeta.min_hours_per_week} hrs/week •{" "}
                      {currentMeta.choice_priority ? "Choices honored (hard)" : "Choices optional (soft)"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Teaching Pattern *</Label>
                  {currentPatterns.length <= 1 ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-sm py-1 px-3" data-testid="faculty-pattern-fixed">
                        {currentPatterns[0] || formData.pattern}
                      </Badge>
                      <p className="text-xs text-slate-500">
                        {currentMeta?.label} only allows this pattern.
                      </p>
                    </div>
                  ) : (
                    <Select
                      value={formData.pattern}
                      onValueChange={(v) => setFormData((prev) => ({ ...prev, pattern: v }))}
                    >
                      <SelectTrigger data-testid="faculty-pattern-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currentPatterns.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-slate-500">
                    Pattern = number of theory subjects + lab subjects they handle per week.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Subjects they can teach
                    <span className="text-xs font-normal text-slate-500">(optional — leave empty = no restriction)</span>
                  </Label>
                  {subjects.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No subjects defined yet. Add subjects first if you want to restrict expertise.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-lg p-3 space-y-3 max-h-64 overflow-y-auto bg-slate-50/50">
                      {sessionYears.map((y) => {
                        const yearSubjects = subjectsByYear[y] || [];
                        if (yearSubjects.length === 0) return null;
                        return (
                          <div key={y}>
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Year {y}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {yearSubjects.map((s) => (
                                <label
                                  key={s.subject_id}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-white rounded px-2 py-1.5 transition-colors"
                                  data-testid={`faculty-subject-toggle-${s.subject_id}`}
                                >
                                  <Checkbox
                                    checked={formData.subject_ids.includes(s.subject_id)}
                                    onCheckedChange={() => toggleSubject(s.subject_id)}
                                  />
                                  <span className="text-sm">
                                    <span className="font-mono font-medium">{s.code}</span>
                                    <span className="text-slate-600"> — {s.name}</span>
                                    {s.requires_lab && <Badge variant="outline" className="ml-2 text-xs">Lab</Badge>}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {formData.subject_ids.length > 0 && (
                    <p className="text-xs text-slate-500">
                      {formData.subject_ids.length} subject{formData.subject_ids.length === 1 ? "" : "s"} selected — auto-fill will only assign these.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CalendarOff className="w-4 h-4" />
                    Unavailable days
                    <span className="text-xs font-normal text-slate-500">(optional — leave empty = available all week)</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {WORKING_DAYS.map((d) => {
                      const off = formData.unavailable_days.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          onClick={() => toggleUnavailableDay(d)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                            off
                              ? "bg-rose-50 border-rose-300 text-rose-700 line-through"
                              : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                          }`}
                          data-testid={`faculty-unavailable-${d}`}
                        >
                          {d.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500">
                    The generator never schedules this faculty on selected days. Keep at least one day free.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving} data-testid="save-faculty-btn">
                    {saving ? "Saving..." : editing ? "Update" : "Add Faculty"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Faculty Members ({faculty.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {faculty.length === 0 ? (
              <div className="empty-state py-12">
                <div className="empty-state-icon">
                  <Users className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No Faculty Added</h3>
                <p className="text-slate-600 mb-4">Start with the senior-most faculty so their hard choices are honored first.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Subjects</TableHead>
                    <TableHead>Availability</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faculty.map((fac) => {
                    const meta = designationByValue(fac.designation);
                    const subList = (fac.subject_ids || []).map((sid) => subjectsById[sid]).filter(Boolean);
                    return (
                      <TableRow key={fac.faculty_id} data-testid={`faculty-row-${fac.faculty_id}`}>
                        <TableCell className="font-medium">{fac.name}</TableCell>
                        <TableCell>{fac.email || "—"}</TableCell>
                        <TableCell>{meta?.category ?? "—"}</TableCell>
                        <TableCell>{meta?.label || fac.designation}</TableCell>
                        <TableCell>{fac.pattern}</TableCell>
                        <TableCell>
                          {subList.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">Any</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {subList.slice(0, 3).map((s) => (
                                <Badge key={s.subject_id} variant="outline" className="text-xs font-mono">
                                  {s.code}
                                </Badge>
                              ))}
                              {subList.length > 3 && (
                                <Badge variant="outline" className="text-xs">+{subList.length - 3}</Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {(fac.unavailable_days || []).length === 0 ? (
                            <span className="text-xs text-emerald-600">All week</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[10rem]">
                              {fac.unavailable_days.map((d) => (
                                <Badge key={d} variant="outline" className="text-xs text-rose-600 border-rose-200">
                                  no {d.slice(0, 3)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(fac)} data-testid={`edit-faculty-${fac.faculty_id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => handleDelete(fac.faculty_id)}
                            data-testid={`delete-faculty-${fac.faculty_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/subjects`)} data-testid="prev-step-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Subjects
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 btn-primary"
            onClick={() => navigate(`/session/${sessionId}/faculty-choices`)}
            data-testid="next-step-btn"
          >
            Next: Faculty Choices
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
