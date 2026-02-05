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

export default function SubjectsManagement({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    section_id: "",
    lecture_hours_per_week: 3,
    lab_hours_per_week: 2,
    requires_lab: false
  });

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const [sessionRes, subjectsRes, sectionsRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/sections`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSession(sessionRes.data);
      setSubjects(subjectsRes.data);
      setSections(sectionsRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      section_id: sections.length > 0 ? sections[0].section_id : "",
      lecture_hours_per_week: 3,
      lab_hours_per_week: 2,
      requires_lab: false
    });
    setEditing(null);
  };

  const handleEdit = (subject) => {
    setFormData({
      name: subject.name,
      code: subject.code,
      section_id: subject.section_id,
      lecture_hours_per_week: subject.lecture_hours_per_week,
      lab_hours_per_week: subject.lab_hours_per_week,
      requires_lab: subject.requires_lab
    });
    setEditing(subject.subject_id);
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim() || !formData.section_id) {
      toast.error("Please fill all required fields");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/sessions/${sessionId}/subjects/${editing}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Subject updated!");
      } else {
        await axios.post(`/api/sessions/${sessionId}/subjects`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Subject added!");
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(editing ? "Failed to update subject" : "Failed to add subject");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (subjectId) => {
    if (!window.confirm("Are you sure you want to delete this subject?")) return;

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

  const getSectionName = (sectionId) => {
    const section = sections.find(s => s.section_id === sectionId);
    return section ? section.name : "-";
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
        {/* Step Indicator */}
        <div className="step-indicator mb-8">
          <div className="step completed"></div>
          <div className="step completed"></div>
          <div className="step completed"></div>
          <div className="step completed"></div>
          <div className="step active"></div>
          <div className="step"></div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Subjects</h1>
            <p className="text-slate-600">Define subjects with their lecture and lab hours</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" data-testid="add-subject-btn" disabled={sections.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Subject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit Subject" : "Add New Subject"}</DialogTitle>
                <DialogDescription>
                  Enter subject details and weekly hours
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="subjectName">Subject Name *</Label>
                    <Input
                      id="subjectName"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Data Structures"
                      required
                      data-testid="subject-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subjectCode">Subject Code *</Label>
                    <Input
                      id="subjectCode"
                      value={formData.code}
                      onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g., CS201"
                      required
                      data-testid="subject-code-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Section *</Label>
                  <Select value={formData.section_id} onValueChange={(v) => setFormData(prev => ({ ...prev, section_id: v }))}>
                    <SelectTrigger data-testid="subject-section-select">
                      <SelectValue placeholder="Select a section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((section) => (
                        <SelectItem key={section.section_id} value={section.section_id}>
                          {section.name} - {section.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lectureHours">Lecture Hours/Week</Label>
                    <Input
                      id="lectureHours"
                      type="number"
                      min="0"
                      max="20"
                      value={formData.lecture_hours_per_week}
                      onChange={(e) => setFormData(prev => ({ ...prev, lecture_hours_per_week: parseInt(e.target.value) || 0 }))}
                      data-testid="lecture-hours-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labHours">Lab Hours/Week</Label>
                    <Input
                      id="labHours"
                      type="number"
                      min="0"
                      max="20"
                      value={formData.lab_hours_per_week}
                      onChange={(e) => setFormData(prev => ({ ...prev, lab_hours_per_week: parseInt(e.target.value) || 0 }))}
                      data-testid="lab-hours-input"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-4 rounded-lg bg-slate-50">
                  <Switch
                    id="requiresLab"
                    checked={formData.requires_lab}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_lab: checked }))}
                    data-testid="requires-lab-switch"
                  />
                  <div>
                    <Label htmlFor="requiresLab" className="cursor-pointer">Requires Lab Session</Label>
                    <p className="text-xs text-slate-500">Enable if this subject needs laboratory sessions</p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving} data-testid="save-subject-btn">
                    {saving ? "Saving..." : editing ? "Update Subject" : "Add Subject"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {sections.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <BookOpen className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">Add Sections First</h3>
                <p className="text-slate-600 mb-4">You need to add sections before adding subjects</p>
                <Button onClick={() => navigate(`/session/${sessionId}/sections`)}>
                  Go to Sections
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                All Subjects ({subjects.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {subjects.length === 0 ? (
                <div className="empty-state py-12">
                  <div className="empty-state-icon">
                    <BookOpen className="w-10 h-10 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No Subjects Added</h3>
                  <p className="text-slate-600 mb-4">Add subjects to schedule classes</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Subject Name</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Lecture Hrs</TableHead>
                      <TableHead>Lab Hrs</TableHead>
                      <TableHead>Lab Required</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjects.map((subject) => (
                      <TableRow key={subject.subject_id} data-testid={`subject-row-${subject.subject_id}`}>
                        <TableCell className="font-mono font-medium">{subject.code}</TableCell>
                        <TableCell>{subject.name}</TableCell>
                        <TableCell>{getSectionName(subject.section_id)}</TableCell>
                        <TableCell>{subject.lecture_hours_per_week}</TableCell>
                        <TableCell>{subject.lab_hours_per_week}</TableCell>
                        <TableCell>
                          <span className={`badge ${subject.requires_lab ? "badge-success" : "badge-warning"}`}>
                            {subject.requires_lab ? "Yes" : "No"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(subject)} data-testid={`edit-subject-${subject.subject_id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => handleDelete(subject.subject_id)}
                            data-testid={`delete-subject-${subject.subject_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/sections`)} data-testid="prev-step-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Sections
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" onClick={() => navigate(`/session/${sessionId}/priority`)} data-testid="next-step-btn">
            Next: Priority Slots
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
