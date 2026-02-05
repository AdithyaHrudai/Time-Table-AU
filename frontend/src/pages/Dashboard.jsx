import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar, Users, Building2, BookOpen, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard({ user, token, logout }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    name: "",
    min_weekly_hours: 12,
    max_weekly_hours: 18
  });

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await axios.get("/api/sessions", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessions(response.data);
    } catch (error) {
      toast.error("Failed to fetch sessions");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!newSession.name.trim()) {
      toast.error("Please enter a session name");
      return;
    }

    setCreating(true);
    try {
      const response = await axios.post("/api/sessions", newSession, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Session created!");
      setDialogOpen(false);
      setNewSession({ name: "", min_weekly_hours: 12, max_weekly_hours: 18 });
      navigate(`/session/${response.data.session_id}/setup`);
    } catch (error) {
      toast.error("Failed to create session");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!window.confirm("Are you sure you want to delete this session? All data will be lost.")) {
      return;
    }

    try {
      await axios.delete(`/api/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Session deleted");
      fetchSessions();
    } catch (error) {
      toast.error("Failed to delete session");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} />
      
      <main className="ml-64 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-600 mt-1">Welcome back, {user?.name?.split(' ')[0]}</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" data-testid="create-session-btn">
                <Plus className="w-4 h-4 mr-2" />
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">Create New Session</DialogTitle>
                <DialogDescription>
                  Start by configuring weekly hour requirements for faculty
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSession} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="sessionName">Session Name</Label>
                  <Input
                    id="sessionName"
                    placeholder="e.g., Fall 2024 - Computer Science"
                    value={newSession.name}
                    onChange={(e) => setNewSession(prev => ({ ...prev, name: e.target.value }))}
                    required
                    data-testid="session-name-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minHours">Min Weekly Hours</Label>
                    <Input
                      id="minHours"
                      type="number"
                      min="1"
                      max="40"
                      value={newSession.min_weekly_hours}
                      onChange={(e) => setNewSession(prev => ({ ...prev, min_weekly_hours: parseInt(e.target.value) || 12 }))}
                      data-testid="min-hours-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxHours">Max Weekly Hours</Label>
                    <Input
                      id="maxHours"
                      type="number"
                      min="1"
                      max="40"
                      value={newSession.max_weekly_hours}
                      onChange={(e) => setNewSession(prev => ({ ...prev, max_weekly_hours: parseInt(e.target.value) || 18 }))}
                      data-testid="max-hours-input"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={creating} data-testid="confirm-create-session-btn">
                    {creating ? "Creating..." : "Create Session"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Calendar className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-serif font-bold text-slate-900 mb-2">No Sessions Yet</h3>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              Create your first scheduling session to start building conflict-free timetables
            </p>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 btn-primary"
              onClick={() => setDialogOpen(true)}
              data-testid="empty-create-session-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Session
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {sessions.map((session) => (
              <Link 
                key={session.session_id} 
                to={`/session/${session.session_id}/setup`}
                className="block"
              >
                <Card className="stat-card card-hover group cursor-pointer" data-testid={`session-card-${session.session_id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-blue-600" />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        onClick={(e) => handleDeleteSession(session.session_id, e)}
                        data-testid={`delete-session-${session.session_id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <CardTitle className="font-serif text-lg mt-4">{session.name}</CardTitle>
                    <CardDescription>
                      {session.working_days?.length || 6} working days • {session.min_weekly_hours}-{session.max_weekly_hours} hrs/week
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          Faculty
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          Rooms
                        </span>
                      </div>
                      <ArrowRight className="w-5 h-5 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
