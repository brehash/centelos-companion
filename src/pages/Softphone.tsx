import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useVoicePhoneContext } from "@/contexts/VoicePhoneContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import FramelessTitleBar from "@/components/FramelessTitleBar";
import DialPad from "@/components/DialPad";
import IncomingCallBanner from "@/components/IncomingCallBanner";
import {
  Phone, PhoneOutgoing, Delete, AlertCircle, Headphones,
  ChevronDown, ChevronUp, Mic, MicOff, Pause, Play, PhoneOff,
  PhoneForwarded, ArrowRightLeft, User, Check, XCircle, MessageCircle,
  Clock, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const KEY_MAP: Record<string, string> = {
  Numpad0: "0", Numpad1: "1", Numpad2: "2", Numpad3: "3",
  Numpad4: "4", Numpad5: "5", Numpad6: "6", Numpad7: "7",
  Numpad8: "8", Numpad9: "9", NumpadMultiply: "*", NumpadDecimal: "#",
  Digit0: "0", Digit1: "1", Digit2: "2", Digit3: "3",
  Digit4: "4", Digit5: "5", Digit6: "6", Digit7: "7",
  Digit8: "8", Digit9: "9",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function isExtensionNumber(val: string): boolean {
  return /^\d{2,5}$/.test(val.trim());
}

interface ExtensionContact {
  id: string;
  extension_number: string;
  display_name: string | null;
  user_id: string | null;
  profile_name: string | null;
  workspace_id: string;
  workspace_name: string;
}

type SidebarTab = "phone" | "history" | "contacts";

export default function Softphone() {
  const { user } = useAuth();
  const phone = useVoicePhoneContext();
  const { currentWorkspace, workspaces, setCurrentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [dialNumber, setDialNumber] = useState("");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionContact[]>([]);
  const [showTransferPicker, setShowTransferPicker] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferType, setTransferType] = useState<"blind" | "attended">("blind");
  const [activeTab, setActiveTab] = useState<SidebarTab>("phone");

  // Fetch extensions
  useEffect(() => {
    if (!workspaces.length) return;
    const fetchAll = async () => {
      const all: ExtensionContact[] = [];
      for (const ws of workspaces) {
        const { data } = await supabase.from("extensions").select("id, extension_number, display_name, user_id").eq("workspace_id", ws.id);
        if (!data) continue;
        const userIds = data.filter((e) => e.user_id).map((e) => e.user_id!);
        let profileMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
          if (profiles) profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p.full_name || ""]));
        }
        for (const e of data) {
          if (e.user_id === user?.id) continue;
          all.push({ ...e, profile_name: e.user_id ? profileMap[e.user_id] || null : null, workspace_id: ws.id, workspace_name: ws.name });
        }
      }
      setExtensions(all);
    };
    fetchAll();
  }, [workspaces, user?.id]);

  // @-mention
  const isAtSearch = dialNumber.includes("@");
  const atSearchTerm = isAtSearch ? dialNumber.slice(dialNumber.lastIndexOf("@") + 1).toLowerCase() : "";
  const filteredExtensions = useMemo(() => {
    if (!isAtSearch) return [];
    if (!atSearchTerm) return extensions;
    return extensions.filter((e) => e.extension_number.includes(atSearchTerm) || e.display_name?.toLowerCase().includes(atSearchTerm) || e.profile_name?.toLowerCase().includes(atSearchTerm));
  }, [extensions, isAtSearch, atSearchTerm]);

  // Transfer extensions
  const transferExtensions = useMemo(() => {
    const sameWs = extensions.filter((e) => e.workspace_id === currentWorkspace?.id);
    if (!transferSearch) return sameWs;
    const term = transferSearch.toLowerCase();
    return sameWs.filter((e) => e.extension_number.includes(term) || e.display_name?.toLowerCase().includes(term) || e.profile_name?.toLowerCase().includes(term));
  }, [extensions, transferSearch, currentWorkspace?.id]);

  // Contacts for the contacts tab
  const contactExtensions = useMemo(() => {
    return extensions.filter((e) => e.workspace_id === currentWorkspace?.id);
  }, [extensions, currentWorkspace?.id]);

  // Audio devices
  useEffect(() => {
    const load = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter((d) => d.kind === "audioinput" || d.kind === "audiooutput"));
      } catch {}
    };
    if (phone.hasExtension) load();
  }, [phone.hasExtension]);

  const inputDevices = useMemo(() => audioDevices.filter((d) => d.kind === "audioinput"), [audioDevices]);
  const outputDevices = useMemo(() => audioDevices.filter((d) => d.kind === "audiooutput"), [audioDevices]);

  const statusColor =
    phone.phoneStatus === "registered" ? "text-accent" :
    phone.phoneStatus === "error" ? "text-destructive" :
    phone.phoneStatus === "connecting" ? "text-warning animate-pulse" :
    "text-muted-foreground";

  const statusDotColor =
    phone.phoneStatus === "registered" ? "bg-accent" :
    phone.phoneStatus === "error" ? "bg-destructive" :
    phone.phoneStatus === "connecting" ? "bg-warning animate-pulse" :
    "bg-muted-foreground";

  const isInCall = phone.callStatus === "in-call";
  const isIdle = phone.callStatus === "idle";

  const handleDial = useCallback(() => {
    if (dialNumber.trim()) phone.makeCall(dialNumber.trim());
  }, [dialNumber, phone]);

  const handleSelectExtension = useCallback((ext: ExtensionContact) => {
    if (ext.workspace_id !== currentWorkspace?.id) {
      const targetWs = workspaces.find((w) => w.id === ext.workspace_id);
      if (targetWs) {
        setCurrentWorkspace(targetWs);
        setTimeout(() => { setDialNumber(ext.extension_number); phone.makeCall(ext.extension_number); }, 1500);
        return;
      }
    }
    setDialNumber(ext.extension_number);
    phone.makeCall(ext.extension_number);
  }, [currentWorkspace?.id, workspaces, phone, setCurrentWorkspace]);

  const handleContactCall = useCallback((ext: ExtensionContact) => {
    setDialNumber(ext.extension_number);
    setActiveTab("phone");
    phone.makeCall(ext.extension_number);
  }, [phone]);

  const handleDigit = useCallback((digit: string) => {
    if (isInCall) phone.sendDtmf(digit);
    else setDialNumber((prev) => prev + digit);
  }, [isInCall, phone]);

  // Keyboard support
  useEffect(() => {
    if (!phone.hasExtension) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const digit = KEY_MAP[e.code];
      if (digit) { e.preventDefault(); handleDigit(digit); }
      if (e.key === "Backspace") { e.preventDefault(); setDialNumber((p) => p.slice(0, -1)); }
      if (e.key === "Enter" && isIdle && dialNumber.trim()) { e.preventDefault(); handleDial(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [phone.hasExtension, handleDigit, isIdle, dialNumber, handleDial]);

  // Call target label
  const callTargetLabel = useMemo(() => {
    const num = phone.dialedTarget || dialNumber.trim();
    if (!num) return "";
    if (isExtensionNumber(num)) {
      const ext = extensions.find((e) => e.extension_number === num);
      const name = ext?.display_name || ext?.profile_name;
      return name ? `Ext ${num} (${name})` : `Ext ${num}`;
    }
    return num;
  }, [phone.dialedTarget, dialNumber, extensions]);

  const isReady = phone.phoneStatus === "registered" || phone.phoneStatus === "error" || !phone.hasExtension;

  const userInitial = user?.email?.charAt(0).toUpperCase() || "U";

  // Auto-switch to phone tab when call starts
  useEffect(() => {
    if (!isIdle) setActiveTab("phone");
  }, [isIdle]);

  const navItems: { id: SidebarTab; icon: React.ElementType; label: string }[] = [
    { id: "phone", icon: Phone, label: "Phone" },
    { id: "history", icon: Clock, label: "History" },
    { id: "contacts", icon: Users, label: "Contacts" },
  ];

  return (
    <div className="flex flex-col h-screen bg-card overflow-hidden relative">
      <FramelessTitleBar title="Centelos Softphone" showMinimize={true} />

      {/* Full-window preloader */}
      {!isReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-card/80 backdrop-blur-sm">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-foreground">Softphone starting...</p>
          <p className="text-xs text-muted-foreground mt-1">Registering VoIP device</p>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[140px] shrink-0 bg-secondary/50 border-r border-border flex flex-col">
          {/* User Info */}
          <div className="px-3 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground truncate">
                  {phone.hasExtension ? `Ext ${phone.extensionNumber}` : "No Ext"}
                </p>
                <div className="flex items-center gap-1">
                  <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDotColor)} />
                  <span className="text-[9px] text-muted-foreground capitalize truncate">{phone.phoneStatus}</span>
                </div>
              </div>
            </div>
            {currentWorkspace && (
              <p className="text-[9px] text-muted-foreground truncate mt-1 pl-10">{currentWorkspace.name}</p>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 py-1.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === item.id
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border-l-2 border-transparent"
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Audio Devices toggle at bottom */}
          {phone.hasExtension && (inputDevices.length > 0 || outputDevices.length > 0) && (
            <div className="border-t border-border px-3 py-2">
              <button
                onClick={() => setShowAudioSettings((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 text-[10px] w-full transition-colors",
                  showAudioSettings ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Headphones className="h-3 w-3 shrink-0" />
                <span className="truncate">Audio</span>
                {showAudioSettings ? <ChevronUp className="h-2.5 w-2.5 ml-auto" /> : <ChevronDown className="h-2.5 w-2.5 ml-auto" />}
              </button>
              {showAudioSettings && (
                <div className="space-y-1.5 mt-1.5 animate-in slide-in-from-bottom-2 duration-200">
                  {inputDevices.length > 0 && (
                    <Select value={selectedInput} onValueChange={(val) => { setSelectedInput(val); phone.setInputDevice(val); }}>
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Mic" /></SelectTrigger>
                      <SelectContent>{inputDevices.map((d) => <SelectItem key={d.deviceId} value={d.deviceId} className="text-[10px]">{d.label || `Mic ${d.deviceId.slice(0, 6)}`}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {outputDevices.length > 0 && (
                    <Select value={selectedOutput} onValueChange={(val) => { setSelectedOutput(val); phone.setOutputDevice(val); }}>
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Speaker" /></SelectTrigger>
                      <SelectContent>{outputDevices.map((d) => <SelectItem key={d.deviceId} value={d.deviceId} className="text-[10px]">{d.label || `Speaker ${d.deviceId.slice(0, 6)}`}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* No extension */}
          {!phone.hasExtension && (
            <div className="flex-1 flex flex-col items-center justify-center p-5 space-y-3 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium text-card-foreground">No Extension Assigned</p>
              <p className="text-xs text-muted-foreground">Ask your workspace administrator to assign an extension to you.</p>
            </div>
          )}

          {phone.hasExtension && (
            <div className="flex-1 overflow-y-auto">
              {/* Incoming call banner - always visible regardless of tab */}
              {phone.callStatus === "ringing-in" && (
                <IncomingCallBanner
                  callerName=""
                  callerNumber={phone.incomingFrom || "Unknown"}
                  onAccept={phone.acceptCall}
                  onReject={phone.rejectCall}
                  onChat={phone.incomingIsInternal && phone.incomingCallerUserId ? () => navigate(`/chat/${phone.incomingCallerUserId}`) : undefined}
                />
              )}

              {/* ─── Phone Tab ─── */}
              {activeTab === "phone" && (
                <>
                  {/* In-call / ringing-out / consulting */}
                  {(isInCall || phone.callStatus === "ringing-out" || phone.transferMode === "consulting") && (
                    <div className="p-4 text-center space-y-3">
                      <PhoneOutgoing className="h-8 w-8 mx-auto text-primary" />
                      <p className="text-sm font-medium text-card-foreground">
                        {phone.transferMode === "consulting"
                          ? `Consulting${phone.consultTarget ? ` Ext ${phone.consultTarget}` : ""}…`
                          : isInCall
                          ? `In Call — ${(phone.callDirection === "inbound" ? phone.incomingFrom : callTargetLabel) || "Unknown"}`
                          : `Calling ${callTargetLabel || ""}…`}
                      </p>
                      {phone.isOnHold && (
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning font-medium">On Hold</span>
                      )}
                      {isInCall && (
                        <p className="text-2xl font-mono text-card-foreground">{formatDuration(phone.callDuration)}</p>
                      )}

                      {/* Consulting transfer controls */}
                      {phone.transferMode === "consulting" && (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center justify-center gap-2 text-xs text-warning font-medium animate-pulse">
                            <Pause className="h-3.5 w-3.5" /><span>Original caller is on hold</span>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" onClick={async () => { try { await phone.completeAttendedTransfer(); toast.success("Transfer completed"); } catch { toast.error("Transfer failed"); } }} disabled={!phone.consultCallSid && phone.transferPhase !== "consult_connected"}>
                              <Check className="h-4 w-4 mr-1.5" /> {phone.transferPhase === "consult_connected" || phone.consultCallSid ? "Connect Caller" : "Waiting for answer…"}
                            </Button>
                            <Button variant="destructive" className="w-full" onClick={async () => { try { await phone.cancelAttendedTransfer(); } catch { toast.error("Cancel failed"); } }}>
                              <XCircle className="h-4 w-4 mr-1.5" /> Cancel Transfer
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Normal call controls */}
                      {phone.transferMode !== "consulting" && (
                        <>
                          <div className="flex justify-center gap-2">
                            <Button size="icon" variant={phone.isMuted ? "destructive" : "outline"} onClick={phone.toggleMute} title={phone.isMuted ? "Unmute" : "Mute"} disabled={!isInCall}>
                              {phone.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                            </Button>
                            <Button size="icon" variant={phone.isOnHold ? "secondary" : "outline"} onClick={async () => { try { if (phone.isOnHold) await phone.unholdCall(); else await phone.holdCall(); } catch { toast.error("Hold action failed"); } }} title={phone.isOnHold ? "Unhold" : "Hold"} disabled={!isInCall}>
                              {phone.isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                            </Button>
                            <Button size="icon" variant={showTransferPicker && transferType === "blind" ? "secondary" : "outline"} onClick={() => { if (showTransferPicker && transferType === "blind") setShowTransferPicker(false); else { setTransferType("blind"); setShowTransferPicker(true); setTransferSearch(""); } }} title="Blind Transfer" disabled={!isInCall}>
                              <PhoneForwarded className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant={showTransferPicker && transferType === "attended" ? "secondary" : "outline"} onClick={() => { if (showTransferPicker && transferType === "attended") setShowTransferPicker(false); else { setTransferType("attended"); setShowTransferPicker(true); setTransferSearch(""); } }} title="Attended Transfer" disabled={!isInCall}>
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                            {phone.incomingIsInternal && phone.incomingCallerUserId && (
                              <Button size="icon" variant="outline" onClick={() => navigate(`/chat/${phone.incomingCallerUserId}`)} title="Chat with caller">
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="destructive" onClick={phone.hangUp}>
                              <PhoneOff className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Transfer picker */}
                          {showTransferPicker && isInCall && (
                            <div className="mt-2 border border-border rounded-lg bg-popover p-2 text-left space-y-2">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">
                                {transferType === "blind" ? "Blind Transfer" : "Attended Transfer"}
                              </p>
                              <Input value={transferSearch} onChange={(e) => setTransferSearch(e.target.value)} placeholder="Search extensions…" className="text-xs h-8" />
                              <div className="max-h-36 overflow-y-auto divide-y divide-border">
                                {transferExtensions.map((ext) => (
                                  <div key={ext.id} className="flex items-center gap-2 px-2 py-1.5">
                                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-accent/15 shrink-0">
                                      <User className="h-3 w-3 text-accent" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs font-medium text-popover-foreground truncate block">{ext.display_name || ext.profile_name || "Unknown"}</span>
                                      <span className="text-[10px] text-muted-foreground">Ext {ext.extension_number}</span>
                                    </div>
                                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 shrink-0" onClick={async () => { try { setShowTransferPicker(false); if (transferType === "blind") { await phone.blindTransfer(ext.extension_number); toast.success(`Transferred to Ext ${ext.extension_number}`); } else { phone.startAttendedTransfer(ext.extension_number); } } catch { toast.error("Transfer failed"); } }}>
                                      {transferType === "blind" ? <><PhoneForwarded className="h-3 w-3 mr-0.5" /> Transfer</> : <><ArrowRightLeft className="h-3 w-3 mr-0.5" /> Consult</>}
                                    </Button>
                                  </div>
                                ))}
                                {transferExtensions.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No extensions found</p>}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* In-call dial pad for DTMF */}
                      {isInCall && phone.transferMode !== "consulting" && (
                        <div className="pt-2">
                          <DialPad onDigit={handleDigit} compact />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Idle dial pad */}
                  {isIdle && phone.callStatus !== "ringing-in" && (
                    <div className="p-4 space-y-3 flex flex-col h-full">
                      {/* Dial input */}
                      <div className="relative flex gap-1">
                        <Input
                          value={dialNumber}
                          onChange={(e) => setDialNumber(e.target.value)}
                          placeholder="Number or @name…"
                          className="text-base h-10 font-medium"
                          onKeyDown={(e) => { if (e.key === "Enter" && !isAtSearch) handleDial(); }}
                        />
                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setDialNumber((p) => p.slice(0, -1))} disabled={!dialNumber}>
                          <Delete className="h-4 w-4" />
                        </Button>

                        {/* @-mention dropdown */}
                        {isAtSearch && filteredExtensions.length > 0 && (
                          <div className="absolute left-0 right-9 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto divide-y divide-border">
                            {filteredExtensions.map((ext) => (
                              <button key={ext.id} onClick={() => handleSelectExtension(ext)} className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted/60 transition-colors">
                                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-accent/15 shrink-0">
                                  <User className="h-3 w-3 text-accent" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-medium text-popover-foreground truncate block">{ext.display_name || ext.profile_name || "Unknown"}</span>
                                  {workspaces.length > 1 && <span className="text-[10px] text-muted-foreground truncate block">{ext.workspace_name}</span>}
                                </div>
                                <span className="text-xs font-mono text-muted-foreground shrink-0">{ext.extension_number}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Dial pad */}
                      <DialPad onDigit={handleDigit} />

                      {/* Call button */}
                      <Button
                        className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-semibold"
                        onClick={handleDial}
                        disabled={!dialNumber.trim() || phone.phoneStatus !== "registered"}
                      >
                        <Phone className="h-4 w-4 mr-2" /> Call
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* ─── History Tab ─── */}
              {activeTab === "history" && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-foreground">Call History</p>
                  <p className="text-xs text-muted-foreground mt-1">Coming soon</p>
                </div>
              )}

              {/* ─── Contacts Tab ─── */}
              {activeTab === "contacts" && (
                <div className="flex flex-col h-full">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-medium text-foreground">
                      Contacts {currentWorkspace && <span className="text-muted-foreground font-normal">— {currentWorkspace.name}</span>}
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-border">
                    {contactExtensions.length === 0 && (
                      <div className="p-6 text-center">
                        <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No contacts in this workspace</p>
                      </div>
                    )}
                    {contactExtensions.map((ext) => (
                      <div key={ext.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 transition-colors">
                        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 shrink-0">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {ext.display_name || ext.profile_name || "Unknown"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Ext {ext.extension_number}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 shrink-0 text-accent hover:text-accent hover:bg-accent/10"
                          onClick={() => handleContactCall(ext)}
                          disabled={phone.phoneStatus !== "registered"}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
