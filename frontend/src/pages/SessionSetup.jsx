import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SessionSetup({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    working_days: DAYS,
    start_time: "09:00",
    end_time: "17:00",
    slot_duration: 60,
    min_weekly_hours: 12,
    max_weekly_hours: 18,
    break_slots: []
  });

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await axios.get(`/api/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSession(response.data);
      setFormData({
        name: response.data.name,
        working_days: response.data.working_days || DAYS,
        start_time: response.data.start_time || "09:00",
        end_time: response.data.end_time || "17:00",
        slot_duration: response.data.slot_duration || 60,
        min_weekly_hours: response.data.min_weekly_hours || 12,
        max_weekly_hours: response.data.max_weekly_hours || 18,
        break_slots: response.data.break_slots || []
      });
    } catch (error) {
      toast.error("Failed to fetch session");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleDayToggle = (day) => {
    setFormData(prev => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter(d => d !== day)
        : [...prev.working_days, day]
    }));
  };

  const handleSave = async () => {
    if (formData.working_days.length === 0) {
      toast.error("Select at least one working day");
      return;
    }

    if (formData.min_weekly_hours > formData.max_weekly_hours) {
      toast.error("Min hours cannot exceed max hours");
      return;
    }

    setSaving(true);
    try {
      await axios.put(`/api/sessions/${sessionId}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Session settings saved!");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    await handleSave();
    navigate(`/session/${sessionId}/faculty`);
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
          <div className="step active"></div>
          <div className="step"></div>
          <div className="step"></div>
          <div className="step"></div>
          <div className="step"></div>
          <div className="step"></div>
        </div>

        <div className="max-w-3xl">
          <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Session Configuration</h1>
          <p className="text-slate-600 mb-8">Set up working days, time slots, and weekly hour requirements</p>

          <div className="space-y-6">
            {/* Session Name */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="name">Session Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Fall 2024 - Computer Science"
                    data-testid="session-name-input"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Working Days */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Working Days</CardTitle>
                <CardDescription>Select the days when classes are scheduled</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {DAYS.map((day) => (
                    <div
                      key={day}
                      className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formData.working_days.includes(day)
                          ? "bg-blue-50 border-blue-200"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => handleDayToggle(day)}
                      data-testid={`day-${day.toLowerCase()}`}
                    >
                      <Checkbox
                        checked={formData.working_days.includes(day)}
                        onCheckedChange={() => handleDayToggle(day)}
                      />
                      <span className="font-medium text-slate-700">{day}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Time Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Time Configuration</CardTitle>
                <CardDescription>Define working hours and slot duration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                      data-testid="start-time-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                      data-testid="end-time-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slotDuration">Slot Duration (minutes)</Label>
                    <Input
                      id="slotDuration"
                      type="number"
                      min="30"
                      max="120"
                      step="15"
                      value={formData.slot_duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, slot_duration: parseInt(e.target.value) || 60 }))}
                      data-testid="slot-duration-input"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Weekly Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Faculty Weekly Hours</CardTitle>
                <CardDescription>Set minimum and maximum teaching hours per week for faculty</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="minHours">Minimum Hours</Label>
                    <Input
                      id="minHours"
                      type="number"
                      min="1"
                      max="40"
                      value={formData.min_weekly_hours}
                      onChange={(e) => setFormData(prev => ({ ...prev, min_weekly_hours: parseInt(e.target.value) || 12 }))}
                      data-testid="min-weekly-hours-input"
                    />
                    <p className="text-xs text-slate-500">Minimum teaching hours required per faculty</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxHours">Maximum Hours</Label>
                    <Input
                      id="maxHours"
                      type="number"
                      min="1"
                      max="40"
                      value={formData.max_weekly_hours}
                      onChange={(e) => setFormData(prev => ({ ...prev, max_weekly_hours: parseInt(e.target.value) || 18 }))}
                      data-testid="max-weekly-hours-input"
                    />
                    <p className="text-xs text-slate-500">Maximum teaching hours allowed per faculty</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving}
                data-testid="save-session-btn"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 btn-primary"
                onClick={handleNext}
                data-testid="next-step-btn"
              >
                Next: Add Faculty
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
