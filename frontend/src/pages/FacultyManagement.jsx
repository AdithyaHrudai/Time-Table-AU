import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ArrowRight, ArrowLeft, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export default function FacultyManagement({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "male",
    department: "",
    min_hours: 12,
    max_hours: 18
  });

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const [sessionRes, facultyRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/faculty`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSession(sessionRes.data);
      setFaculty(facultyRes.data);
      setFormData(prev => ({
        ...prev,
        min_hours: sessionRes.data.min_weekly_hours || 12,
        max_hours: sessionRes.data.max_weekly_hours || 18
      }));
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
      email: "",
      gender: "male",
      department: "",
      min_hours: session?.min_weekly_hours || 12,
      max_hours: session?.max_weekly_hours || 18
    });
    setEditing(null);
  };

  const handleEdit = (fac) => {
    setFormData({
      name: fac.name,
      email: fac.email || "",
      gender: fac.gender,
      department: fac.department || "",
      min_hours: fac.min_hours,
      max_hours: fac.max_hours
    });
    setEditing(fac.faculty_id);
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Please enter faculty name");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/sessions/${sessionId}/faculty/${editing}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Faculty updated!");
      } else {
        await axios.post(`/api/sessions/${sessionId}/faculty`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Faculty added!");
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(editing ? "Failed to update faculty" : "Failed to add faculty");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (facultyId) => {
    if (!window.confirm("Are you sure you want to delete this faculty member?")) return;

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

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />
      
      <main className="ml-64 p-8">
        {/* Step Indicator */}
        <div className="step-indicator mb-8">
          <div className="step completed"></div>
          <div className="step active"></div>
          <div className="step"></div>
          <div className="step"></div>
          <div className="step"></div>
          <div className="step"></div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Faculty Management</h1>
            <p className="text-slate-600">Add and manage faculty members for this session</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" data-testid="add-faculty-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Faculty
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit Faculty" : "Add New Faculty"}</DialogTitle>
                <DialogDescription>
                  Enter faculty member details
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="facultyName">Full Name *</Label>
                  <Input
                    id="facultyName"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Dr. John Smith"
                    required
                    data-testid="faculty-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="facultyEmail">Email</Label>
                  <Input
                    id="facultyEmail"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john.smith@university.edu"
                    data-testid="faculty-email-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Gender *</Label>
                    <Select value={formData.gender} onValueChange={(v) => setFormData(prev => ({ ...prev, gender: v }))}>
                      <SelectTrigger data-testid="faculty-gender-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input
                      id="department"
                      value={formData.department}
                      onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                      placeholder="Computer Science"
                      data-testid="faculty-department-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minFacultyHours">Min Hours/Week</Label>
                    <Input
                      id="minFacultyHours"
                      type="number"
                      min="1"
                      max="40"
                      value={formData.min_hours}
                      onChange={(e) => setFormData(prev => ({ ...prev, min_hours: parseInt(e.target.value) || 12 }))}
                      data-testid="faculty-min-hours-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxFacultyHours">Max Hours/Week</Label>
                    <Input
                      id="maxFacultyHours"
                      type="number"
                      min="1"
                      max="40"
                      value={formData.max_hours}
                      onChange={(e) => setFormData(prev => ({ ...prev, max_hours: parseInt(e.target.value) || 18 }))}
                      data-testid="faculty-max-hours-input"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving} data-testid="save-faculty-btn">
                    {saving ? "Saving..." : editing ? "Update Faculty" : "Add Faculty"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Faculty List */}
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
                <p className="text-slate-600 mb-4">Add faculty members to start building your timetable</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Hours/Week</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faculty.map((fac) => (
                    <TableRow key={fac.faculty_id} data-testid={`faculty-row-${fac.faculty_id}`}>
                      <TableCell className="font-medium">{fac.name}</TableCell>
                      <TableCell>{fac.email || "-"}</TableCell>
                      <TableCell className="capitalize">{fac.gender}</TableCell>
                      <TableCell>{fac.department || "-"}</TableCell>
                      <TableCell>{fac.min_hours}-{fac.max_hours}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(fac)}
                          data-testid={`edit-faculty-${fac.faculty_id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleDelete(fac.faculty_id)}
                          data-testid={`delete-faculty-${fac.faculty_id}`}
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
            onClick={() => navigate(`/session/${sessionId}/rooms`)}
            data-testid="next-step-btn"
          >
            Next: Rooms & Labs
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
