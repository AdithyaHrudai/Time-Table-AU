import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, RefreshCw, Table2, Users, GraduationCap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function TimetableView({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [session, setSession] = useState(null);
  const [timetable, setTimetable] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [sections, setSections] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [viewType, setViewType] = useState("master");
  const [filterId, setFilterId] = useState("");

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
      const [sessionRes, timetableRes, facultyRes, sectionsRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/timetable`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/faculty`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/sections`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setSession(sessionRes.data);
      setTimetable(timetableRes.data);
      setFaculty(facultyRes.data);
      setSections(sectionsRes.data);
      
      const slots = generateTimeSlots(
        sessionRes.data.start_time || "09:00",
        sessionRes.data.end_time || "17:00",
        sessionRes.data.slot_duration || 60
      );
      setTimeSlots(slots);
    } catch (error) {
      toast.error("Failed to fetch timetable");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await axios.post(`/api/sessions/${sessionId}/generate-timetable`, [], {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Timetable regenerated!");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      let url = `/api/sessions/${sessionId}/export-pdf?view_type=${viewType}`;
      if (filterId) {
        url += `&filter_id=${filterId}`;
      }
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob"
      });
      
      const blob = new Blob([response.data], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `timetable_${session?.name?.replace(/\s+/g, "_") || "export"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success("PDF downloaded!");
    } catch (error) {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const getFilteredEntries = () => {
    if (!timetable?.entries) return [];
    
    if (viewType === "faculty" && filterId) {
      return timetable.entries.filter(e => e.faculty_id === filterId);
    }
    if (viewType === "section" && filterId) {
      return timetable.entries.filter(e => e.section_id === filterId);
    }
    return timetable.entries;
  };

  const getEntriesForCell = (day, slot, entries) => {
    return entries.filter(e => e.day === day && e.time_slot === slot);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  const entries = getFilteredEntries();
  const workingDays = session?.working_days || [];
  const hasConflicts = timetable?.conflicts?.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />
      
      <main className="ml-64 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Timetable</h1>
            <p className="text-slate-600">
              {entries.length} scheduled entries • {workingDays.length} working days
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={regenerating}
              data-testid="regenerate-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? "spinner" : ""}`} />
              Regenerate
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 btn-primary"
              onClick={handleDownloadPDF}
              disabled={downloading || entries.length === 0}
              data-testid="download-pdf-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              {downloading ? "Downloading..." : "Download PDF"}
            </Button>
          </div>
        </div>

        {hasConflicts && (
          <Card className="mb-6 border-rose-200 bg-rose-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <div>
                  <p className="font-medium text-rose-800">
                    {timetable.conflicts.length} conflict(s) detected
                  </p>
                  <p className="text-sm text-rose-600">
                    Some entries couldn't be scheduled without overlaps
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* View Filters */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <Tabs value={viewType} onValueChange={(v) => { setViewType(v); setFilterId(""); }}>
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="master" className="flex items-center gap-2" data-testid="view-master-tab">
                    <Table2 className="w-4 h-4" />
                    Master View
                  </TabsTrigger>
                  <TabsTrigger value="faculty" className="flex items-center gap-2" data-testid="view-faculty-tab">
                    <Users className="w-4 h-4" />
                    By Faculty
                  </TabsTrigger>
                  <TabsTrigger value="section" className="flex items-center gap-2" data-testid="view-section-tab">
                    <GraduationCap className="w-4 h-4" />
                    By Section
                  </TabsTrigger>
                </TabsList>

                {viewType === "faculty" && (
                  <Select value={filterId} onValueChange={setFilterId}>
                    <SelectTrigger className="w-64" data-testid="filter-faculty-select">
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
                )}

                {viewType === "section" && (
                  <Select value={filterId} onValueChange={setFilterId}>
                    <SelectTrigger className="w-64" data-testid="filter-section-select">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.section_id} value={s.section_id}>
                          {s.name} - {s.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* Timetable Grid */}
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Table2 className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-serif font-bold text-slate-900 mb-2">No Timetable Generated</h3>
                <p className="text-slate-600 mb-4">Generate a timetable from the Priority Allocation page</p>
                <Button onClick={() => navigate(`/session/${sessionId}/priority`)}>
                  Go to Priority Allocation
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg">
                {viewType === "master" && "Master Timetable"}
                {viewType === "faculty" && (filterId ? `Faculty: ${faculty.find(f => f.faculty_id === filterId)?.name}` : "Select a faculty")}
                {viewType === "section" && (filterId ? `Section: ${sections.find(s => s.section_id === filterId)?.name}` : "Select a section")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <div 
                className="timetable-grid min-w-[900px]" 
                style={{ gridTemplateColumns: `100px repeat(${workingDays.length}, 1fr)` }}
                data-testid="timetable-grid"
              >
                {/* Header Row */}
                <div className="timetable-header">Time</div>
                {workingDays.map((day) => (
                  <div key={day} className="timetable-header">{day}</div>
                ))}

                {/* Time Slot Rows */}
                {timeSlots.map((slot) => (
                  <>
                    <div key={`time-${slot}`} className="timetable-time">{slot}</div>
                    {workingDays.map((day) => {
                      const cellEntries = getEntriesForCell(day, slot, entries);
                      return (
                        <div 
                          key={`${day}-${slot}`} 
                          className="timetable-entry min-h-[80px]"
                          data-testid={`cell-${day}-${slot}`}
                        >
                          {cellEntries.length > 0 ? (
                            <div className="space-y-1">
                              {cellEntries.map((entry, idx) => (
                                <div
                                  key={idx}
                                  className={`timetable-entry-content ${entry.is_lab ? "lab" : ""} ${entry.is_priority ? "priority" : ""}`}
                                >
                                  <p className="font-semibold text-xs">{entry.subject_code}</p>
                                  <p className="text-xs text-slate-600 truncate">{entry.faculty_name}</p>
                                  <p className="text-xs text-slate-500">{entry.room_name}</p>
                                  {viewType === "master" && (
                                    <p className="text-xs text-slate-400">{entry.section_name}</p>
                                  )}
                                  {entry.is_lab && (
                                    <span className="inline-block px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] rounded mt-1">LAB</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-300 text-xs">
                              —
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-start mt-8">
          <Button variant="outline" onClick={() => navigate(`/session/${sessionId}/priority`)} data-testid="back-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back: Priority Allocation
          </Button>
        </div>
      </main>
    </div>
  );
}
