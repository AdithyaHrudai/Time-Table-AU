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
import { Plus, ArrowRight, ArrowLeft, Pencil, Trash2, Building2, FlaskConical } from "lucide-react";
import { toast } from "sonner";

export default function RoomsManagement({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    room_type: "classroom",
    capacity: 60,
    building: ""
  });

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const [sessionRes, roomsRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/rooms`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSession(sessionRes.data);
      setRooms(roomsRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", room_type: "classroom", capacity: 60, building: "" });
    setEditing(null);
  };

  const handleEdit = (room) => {
    setFormData({
      name: room.name,
      room_type: room.room_type,
      capacity: room.capacity,
      building: room.building || ""
    });
    setEditing(room.room_id);
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Please enter room name");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/sessions/${sessionId}/rooms/${editing}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Room updated!");
      } else {
        await axios.post(`/api/sessions/${sessionId}/rooms`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Room added!");
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(editing ? "Failed to update room" : "Failed to add room");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roomId) => {
    if (!window.confirm("Are you sure you want to delete this room?")) return;

    try {
      await axios.delete(`/api/sessions/${sessionId}/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Room deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete room");
    }
  };

  const classrooms = rooms.filter(r => r.room_type === "classroom");
  const labs = rooms.filter(r => r.room_type === "lab");

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
          <div className="step active"></div>
          <div className="step"></div>
          <div className="step"></div>
          <div className="step"></div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Rooms & Labs</h1>
            <p className="text-slate-600">Manage classrooms and laboratory spaces</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" data-testid="add-room-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Room/Lab
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit Room" : "Add New Room/Lab"}</DialogTitle>
                <DialogDescription>
                  Enter room or laboratory details
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="roomName">Room Name *</Label>
                  <Input
                    id="roomName"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Room 101 or Lab A"
                    required
                    data-testid="room-name-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type *</Label>
                    <Select value={formData.room_type} onValueChange={(v) => setFormData(prev => ({ ...prev, room_type: v }))}>
                      <SelectTrigger data-testid="room-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="classroom">Classroom</SelectItem>
                        <SelectItem value="lab">Laboratory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity">Capacity</Label>
                    <Input
                      id="capacity"
                      type="number"
                      min="1"
                      value={formData.capacity}
                      onChange={(e) => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 60 }))}
                      data-testid="room-capacity-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="building">Building</Label>
                  <Input
                    id="building"
                    value={formData.building}
                    onChange={(e) => setFormData(prev => ({ ...prev, building: e.target.value }))}
                    placeholder="e.g., Main Building"
                    data-testid="room-building-input"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving} data-testid="save-room-btn">
                    {saving ? "Saving..." : editing ? "Update Room" : "Add Room"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-900">{classrooms.length}</p>
                  <p className="text-slate-600">Classrooms</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <FlaskConical className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-900">{labs.length}</p>
                  <p className="text-slate-600">Laboratories</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rooms List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Rooms & Labs ({rooms.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {rooms.length === 0 ? (
              <div className="empty-state py-12">
                <div className="empty-state-icon">
                  <Building2 className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No Rooms Added</h3>
                <p className="text-slate-600 mb-4">Add classrooms and labs for scheduling</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Building</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => (
                    <TableRow key={room.room_id} data-testid={`room-row-${room.room_id}`}>
                      <TableCell className="font-medium">{room.name}</TableCell>
                      <TableCell>
                        <span className={`badge ${room.room_type === "lab" ? "badge-success" : "badge-info"}`}>
                          {room.room_type === "lab" ? "Lab" : "Classroom"}
                        </span>
                      </TableCell>
                      <TableCell>{room.capacity}</TableCell>
                      <TableCell>{room.building || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(room)} data-testid={`edit-room-${room.room_id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleDelete(room.room_id)}
                          data-testid={`delete-room-${room.room_id}`}
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
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/faculty`)} data-testid="prev-step-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Faculty
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" onClick={() => navigate(`/session/${sessionId}/sections`)} data-testid="next-step-btn">
            Next: Sections
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
