import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ArrowRight, ArrowLeft, Pencil, Trash2, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function SectionsManagement({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [sections, setSections] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    year: 1,
    department: "",
    strength: 60
  });

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const [sessionRes, sectionsRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/sections`, { headers: { Authorization: `Bearer ${token}` } })
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

  const resetForm = () => {
    setFormData({ name: "", year: 1, department: "", strength: 60 });
    setEditing(null);
  };

  const handleEdit = (section) => {
    setFormData({
      name: section.name,
      year: section.year,
      department: section.department,
      strength: section.strength
    });
    setEditing(section.section_id);
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.department.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/sessions/${sessionId}/sections/${editing}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Section updated!");
      } else {
        await axios.post(`/api/sessions/${sessionId}/sections`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Section added!");
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(editing ? "Failed to update section" : "Failed to add section");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sectionId) => {
    if (!window.confirm("Are you sure you want to delete this section?")) return;

    try {
      await axios.delete(`/api/sessions/${sessionId}/sections/${sectionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Section deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete section");
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
        {/* Step Indicator */}
        <div className="step-indicator mb-8">
          <div className="step completed"></div>
          <div className="step completed"></div>
          <div className="step completed"></div>
          <div className="step active"></div>
          <div className="step"></div>
          <div className="step"></div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Sections</h1>
            <p className="text-slate-600">Define student sections/batches for scheduling</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" data-testid="add-section-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Section
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit Section" : "Add New Section"}</DialogTitle>
                <DialogDescription>
                  Enter section/batch details
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="sectionName">Section Name *</Label>
                  <Input
                    id="sectionName"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., CSE-A, ECE-1"
                    required
                    data-testid="section-name-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Year *</Label>
                    <Select value={formData.year.toString()} onValueChange={(v) => setFormData(prev => ({ ...prev, year: parseInt(v) }))}>
                      <SelectTrigger data-testid="section-year-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1st Year</SelectItem>
                        <SelectItem value="2">2nd Year</SelectItem>
                        <SelectItem value="3">3rd Year</SelectItem>
                        <SelectItem value="4">4th Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="strength">Strength</Label>
                    <Input
                      id="strength"
                      type="number"
                      min="1"
                      value={formData.strength}
                      onChange={(e) => setFormData(prev => ({ ...prev, strength: parseInt(e.target.value) || 60 }))}
                      data-testid="section-strength-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sectionDepartment">Department *</Label>
                  <Input
                    id="sectionDepartment"
                    value={formData.department}
                    onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="e.g., Computer Science"
                    required
                    data-testid="section-department-input"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving} data-testid="save-section-btn">
                    {saving ? "Saving..." : editing ? "Update Section" : "Add Section"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Sections List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              All Sections ({sections.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sections.length === 0 ? (
              <div className="empty-state py-12">
                <div className="empty-state-icon">
                  <GraduationCap className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No Sections Added</h3>
                <p className="text-slate-600 mb-4">Add student sections/batches to continue</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section Name</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Strength</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((section) => (
                    <TableRow key={section.section_id} data-testid={`section-row-${section.section_id}`}>
                      <TableCell className="font-medium">{section.name}</TableCell>
                      <TableCell>{section.year}{section.year === 1 ? "st" : section.year === 2 ? "nd" : section.year === 3 ? "rd" : "th"} Year</TableCell>
                      <TableCell>{section.department}</TableCell>
                      <TableCell>{section.strength}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(section)} data-testid={`edit-section-${section.section_id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleDelete(section.section_id)}
                          data-testid={`delete-section-${section.section_id}`}
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

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/rooms`)} data-testid="prev-step-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Rooms
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" onClick={() => navigate(`/session/${sessionId}/subjects`)} data-testid="next-step-btn">
            Next: Subjects
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
