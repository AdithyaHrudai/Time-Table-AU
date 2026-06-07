import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ArrowRight, ArrowLeft, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";

const emptyForm = { name: "", code: "", year: 1, requires_lab: false, lectures_per_week: 2, lab_sessions_per_week: 1 };

export default function SubjectsManagement({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [subjects, setSubjects] = useState([]);
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
      const [sessionRes, subjectsRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSession(sessionRes.data);
      setSubjects(subjectsRes.data);
      const firstYear = (sessionRes.data.years || [])[0] || 1;
      setFormData((prev) => ({ ...prev, year: firstYear }));
    } catch (error) {
      toast.error("Failed to fetch data");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    const firstYear = (session?.years || [])[0] || 1;
    setFormData({ ...emptyForm, year: firstYear });
    setEditing(null);
  };

  const handleEdit = (s) => {
    setFormData({
      name: s.name, code: s.code, year: s.year, requires_lab: !!s.requires_lab,
      lectures_per_week: s.lectures_per_week ?? 2,
      lab_sessions_per_week: s.lab_sessions_per_week ?? 1,
    });
    setEditing(s.subject_id);
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        year: Number(formData.year),
        requires_lab: formData.requires_lab,
        lectures_per_week: Number(formData.lectures_per_week),
        lab_sessions_per_week: Number(formData.lab_sessions_per_week),
      };
      if (editing) {
        await axios.put(`/api/sessions/${sessionId}/subjects/${editing}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Subject updated");
      } else {
        await axios.post(`/api/sessions/${sessionId}/subjects`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Subject added");
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

  const handleDelete = async (subjectId) => {
    if (!window.confirm("Delete this subject? Any faculty choices for it will be removed.")) return;
    try {
      await axios.delete(`/api/sessions/${sessionId}/subjects/${subjectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Subject deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete subject");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  const sessionYears = session?.years || [];

  // group by year
  const groups = {};
  subjects.forEach((s) => {
    if (!groups[s.year]) groups[s.year] = [];
    groups[s.year].push(s);
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />

      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Subjects</h1>
            <p className="text-slate-600">
              Subjects defined here are applied to <strong>all sections of the selected year</strong>.
              Set lectures/week per subject (credit-based); lab subjects also get lab sessions per batch/week.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" data-testid="add-subject-btn" disabled={sessionYears.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Subject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit Subject" : "Add Subject"}</DialogTitle>
                <DialogDescription>
                  Code + name + year. Toggle &ldquo;Has Lab&rdquo; if the subject also runs a lab.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="subjectCode">Subject Code *</Label>
                    <Input
                      id="subjectCode"
                      value={formData.code}
                      onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      placeholder="CS3201"
                      required
                      data-testid="subject-code-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Year *</Label>
                    <Select
                      value={String(formData.year)}
                      onValueChange={(v) => setFormData((prev) => ({ ...prev, year: Number(v) }))}
                    >
                      <SelectTrigger data-testid="subject-year-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {sessionYears.map((y) => (
                          <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subjectName">Subject Name *</Label>
                  <Input
                    id="subjectName"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Data Structures"
                    required
                    data-testid="subject-name-input"
                  />
                </div>
                <div className="flex items-center space-x-3 p-4 rounded-lg bg-slate-50">
                  <Switch
                    id="requiresLab"
                    checked={formData.requires_lab}
                    onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, requires_lab: checked }))}
                    data-testid="requires-lab-switch"
                  />
                  <div>
                    <Label htmlFor="requiresLab" className="cursor-pointer">Has Lab Component</Label>
                    <p className="text-xs text-slate-500">If on, each section gets lab sessions per batch per week for this subject.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lecturesPerWeek">Lectures / week</Label>
                    <Input
                      id="lecturesPerWeek"
                      type="number" min="0" max="6"
                      value={formData.lectures_per_week}
                      onChange={(e) => setFormData((prev) => ({ ...prev, lectures_per_week: parseInt(e.target.value, 10) || 0 }))}
                      data-testid="subject-lectures-input"
                    />
                    <p className="text-xs text-slate-500">Theory periods/week (set by credits). Default 2.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labPerWeek">Lab sessions / week</Label>
                    <Input
                      id="labPerWeek"
                      type="number" min="0" max="4"
                      value={formData.lab_sessions_per_week}
                      onChange={(e) => setFormData((prev) => ({ ...prev, lab_sessions_per_week: parseInt(e.target.value, 10) || 0 }))}
                      disabled={!formData.requires_lab}
                      data-testid="subject-lab-input"
                    />
                    <p className="text-xs text-slate-500">Per batch, per week. Only used if &ldquo;Has Lab&rdquo; is on.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving} data-testid="save-subject-btn">
                    {saving ? "Saving..." : editing ? "Update" : "Add Subject"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {sessionYears.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <BookOpen className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No years selected</h3>
                <p className="text-slate-600 mb-4">Pick years in Session Setup first.</p>
                <Button onClick={() => navigate(`/session/${sessionId}/setup`)}>Go to Session Setup</Button>
              </div>
            </CardContent>
          </Card>
        ) : Object.keys(groups).length === 0 ? (
          <Card>
            <CardContent className="empty-state py-12">
              <div className="empty-state-icon">
                <BookOpen className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No subjects yet</h3>
              <p className="text-slate-600 mb-4">Add the subjects each year teaches this semester.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.keys(groups).sort().map((year) => (
              <Card key={year}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    Year {year} ({groups[year].length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Has Lab</TableHead>
                        <TableHead>Per week</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups[year].map((s) => (
                        <TableRow key={s.subject_id} data-testid={`subject-row-${s.subject_id}`}>
                          <TableCell className="font-mono font-medium">{s.code}</TableCell>
                          <TableCell>{s.name}</TableCell>
                          <TableCell>
                            <span className={`badge ${s.requires_lab ? "badge-success" : "badge-warning"}`}>
                              {s.requires_lab ? "Yes" : "No"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {(s.lectures_per_week ?? 2)}T
                            {s.requires_lab ? ` + ${(s.lab_sessions_per_week ?? 1)}L/batch` : ""}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(s)} data-testid={`edit-subject-${s.subject_id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => handleDelete(s.subject_id)}
                              data-testid={`delete-subject-${s.subject_id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
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
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/sections`)} data-testid="prev-step-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Sections
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 btn-primary"
            onClick={() => navigate(`/session/${sessionId}/faculty`)}
            data-testid="next-step-btn"
          >
            Next: Faculty
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
