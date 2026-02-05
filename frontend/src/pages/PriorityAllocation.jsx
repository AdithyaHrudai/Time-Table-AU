import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, Clock, Zap, AlertCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";

export default function PriorityAllocation({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [session, setSession] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [priorityEntries, setPriorityEntries] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);

  // Form state for new priority entry
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isLab, setIsLab] = useState(false);

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const generateTimeSlots = (startTime, endTime, duration) => {
    const slots = [];
    const [startHour, startMin] = startTime.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);
    
    let currentHour = startHour;
    let currentMin = startMin;
    
    while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
      const slotStart = `${currentHour.toString().padStart(2, "0")}:${currentMin.toString().padStart(2, "0")}`;
      
      currentMin += duration;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
      
      const slotEnd = `${currentHour.toString().padStart(2, "0")}:${currentMin.toString().padStart(2, "0")}`;
      slots.push(`${slotStart}-${slotEnd}`);
    }
    
    return slots;
  };

  const fetchData = async () => {
    try {
      const [sessionRes, facultyRes, subjectsRes, sectionsRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/faculty`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/sections`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setSession(sessionRes.data);
      setFaculty(facultyRes.data);
      setSubjects(subjectsRes.data);
      setSections(sectionsRes.data);
      
      const slots = generateTimeSlots(
        sessionRes.data.start_time || "09:00",
        sessionRes.data.end_time || "17:00",
        sessionRes.data.slot_duration || 60
      );
      setTimeSlots(slots);
    } catch (error) {
      toast.error("Failed to fetch data");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const addPriorityEntry = () => {
    if (!selectedFaculty || !selectedSubject || !selectedDay || !selectedSlot) {
      toast.error("Please select all fields");
      return;
    }

    const subject = subjects.find(s => s.subject_id === selectedSubject);
    const facultyMember = faculty.find(f => f.faculty_id === selectedFaculty);
    
    // Check for conflicts
    const conflict = priorityEntries.find(e => 
      e.day === selectedDay && 
      e.time_slot === selectedSlot && 
      (e.faculty_id === selectedFaculty || e.section_id === subject?.section_id)
    );
    
    if (conflict) {
      toast.error("This slot conflicts with an existing priority entry");
      return;
    }

    const newEntry = {
      id: Date.now(),
      faculty_id: selectedFaculty,
      faculty_name: facultyMember?.name || "",
      subject_id: selectedSubject,
      subject_name: subject?.name || "",
      subject_code: subject?.code || "",
      section_id: subject?.section_id || "",
      day: selectedDay,
      time_slot: selectedSlot,
      is_lab: isLab
    };

    setPriorityEntries(prev => [...prev, newEntry]);
    
    // Reset form
    setSelectedSlot("");
    toast.success("Priority slot added");
  };

  const removePriorityEntry = (id) => {
    setPriorityEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleGenerate = async () => {
    if (faculty.length === 0 || subjects.length === 0 || sections.length === 0) {
      toast.error("Please add faculty, subjects, and sections first");
      return;
    }

    setGenerating(true);
    try {
      const response = await axios.post(
        `/api/sessions/${sessionId}/generate-timetable`,
        priorityEntries.map(e => ({
          faculty_id: e.faculty_id,
          subject_id: e.subject_id,
          section_id: e.section_id,
          day: e.day,
          time_slot: e.time_slot,
          is_lab: e.is_lab
        })),
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.conflicts && response.data.conflicts.length > 0) {
        toast.warning(`Timetable generated with ${response.data.conflicts.length} conflicts`);
      } else {
        toast.success(`Timetable generated with ${response.data.entries_count} entries!`);
      }
      
      navigate(`/session/${sessionId}/timetable`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to generate timetable");
    } finally {
      setGenerating(false);
    }
  };

  const getSectionName = (sectionId) => {
    const section = sections.find(s => s.section_id === sectionId);
    return section ? section.name : "";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  const canGenerate = faculty.length > 0 && subjects.length > 0 && sections.length > 0;

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
          <div className="step completed"></div>
          <div className="step active"></div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Priority Slot Allocation</h1>
            <p className="text-slate-600">Allow faculty to select their preferred time slots (optional)</p>
          </div>
        </div>

        {!canGenerate && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <p className="text-amber-800">
                  Please add <strong>faculty</strong>, <strong>sections</strong>, and <strong>subjects</strong> before generating timetable.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add Priority Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Add Priority Slot
              </CardTitle>
              <CardDescription>
                Select faculty and their preferred time slot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Faculty Member</Label>
                <Select value={selectedFaculty} onValueChange={setSelectedFaculty}>
                  <SelectTrigger data-testid="priority-faculty-select">
                    <SelectValue placeholder="Select faculty" />
                  </SelectTrigger>
                  <SelectContent>
                    {faculty.map((f) => (
                      <SelectItem key={f.faculty_id} value={f.faculty_id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger data-testid="priority-subject-select">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.subject_id} value={s.subject_id}>
                        {s.code} - {s.name} ({getSectionName(s.section_id)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select value={selectedDay} onValueChange={setSelectedDay}>
                    <SelectTrigger data-testid="priority-day-select">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {(session?.working_days || []).map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Time Slot</Label>
                  <Select value={selectedSlot} onValueChange={setSelectedSlot}>
                    <SelectTrigger data-testid="priority-slot-select">
                      <SelectValue placeholder="Select slot" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((slot) => (
                        <SelectItem key={slot} value={slot}>
                          {slot}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-50">
                <input
                  type="checkbox"
                  id="isLabSession"
                  checked={isLab}
                  onChange={(e) => setIsLab(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                  data-testid="priority-is-lab-checkbox"
                />
                <Label htmlFor="isLabSession" className="cursor-pointer">Lab Session</Label>
              </div>

              <Button
                onClick={addPriorityEntry}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={!selectedFaculty || !selectedSubject || !selectedDay || !selectedSlot}
                data-testid="add-priority-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Priority Slot
              </Button>
            </CardContent>
          </Card>

          {/* Priority Entries List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Priority Entries ({priorityEntries.length})</CardTitle>
              <CardDescription>
                These slots will be allocated first
              </CardDescription>
            </CardHeader>
            <CardContent>
              {priorityEntries.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No priority slots added yet</p>
                  <p className="text-sm">Priority allocation is optional</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {priorityEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg"
                      data-testid={`priority-entry-${entry.id}`}
                    >
                      <div>
                        <p className="font-medium text-slate-900">{entry.faculty_name}</p>
                        <p className="text-sm text-slate-600">
                          {entry.subject_code} • {entry.day} • {entry.time_slot}
                          {entry.is_lab && <span className="ml-2 badge badge-success">Lab</span>}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-rose-600"
                        onClick={() => removePriorityEntry(entry.id)}
                        data-testid={`remove-priority-${entry.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Generate Button */}
        <Card className="mt-6">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900 mb-1">Ready to Generate?</h3>
                <p className="text-slate-600">
                  The algorithm will allocate remaining slots automatically with no overlaps
                </p>
              </div>
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 btn-primary px-8"
                onClick={handleGenerate}
                disabled={!canGenerate || generating}
                data-testid="generate-timetable-btn"
              >
                {generating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner mr-2"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Generate Timetable
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/subjects`)} data-testid="prev-step-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Subjects
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 btn-primary"
            onClick={() => navigate(`/session/${sessionId}/timetable`)}
            data-testid="view-timetable-btn"
          >
            View Timetable
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  );
}
