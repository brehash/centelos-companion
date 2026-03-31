import { useState, useEffect, useRef, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { CrossWindowCallState } from "@/contexts/ElectronContext";

export type PhoneStatus = "offline" | "connecting" | "registered" | "error";
export type CallStatus = "idle" | "ringing-in" | "ringing-out" | "in-call";
export type TransferMode = null | "selecting" | "consulting";
export type TransferPhase = "idle" | "holding" | "consult_ringing" | "consult_connected" | "completing" | "rejoining";

interface VoicePhoneState {
  phoneStatus: PhoneStatus;
  callStatus: CallStatus;
  isMuted: boolean;
  isOnHold: boolean;
  callDuration: number;
  incomingFrom: string | null;
  incomingIsInternal: boolean;
  incomingCallerUserId: string | null;
  errorMessage: string | null;
  extensionNumber: string | null;
  activeCallSid: string | null;
  transferMode: TransferMode;
  transferPhase: TransferPhase;
  consultCallSid: string | null;
}

interface VoicePhoneActions {
  makeCall: (number: string) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  sendDtmf: (digit: string) => void;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  holdCall: () => Promise<void>;
  unholdCall: () => Promise<void>;
  blindTransfer: (targetExt: string) => Promise<void>;
  startAttendedTransfer: (targetExt: string) => void;
  completeAttendedTransfer: () => Promise<void>;
  cancelAttendedTransfer: () => Promise<void>;
}

export interface UseVoicePhoneReturn extends VoicePhoneState, VoicePhoneActions {
  hasExtension: boolean;
  consultTarget: string | null;
  dialedTarget: string | null;
  callDirection: "inbound" | "outbound" | null;
}

// ─── Detect if this window is the VoIP owner (softphone) or a delegate (chat) ───
function isSoftphoneWindow(): boolean {
  return window.location.hash.includes("/softphone") || window.location.pathname.includes("/softphone");
}

function isElectronDelegateWindow(): boolean {
  return !!window.electronAPI?.isElectron && !isSoftphoneWindow();
}

// ─── Delegate hook: used by chat window in Electron ───
function useVoicePhoneDelegate(): UseVoicePhoneReturn {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [extensionNumber, setExtensionNumber] = useState<string | null>(null);
  const [dialedTarget, setDialedTarget] = useState<string | null>(null);
  const [callDirection, setCallDirection] = useState<"inbound" | "outbound" | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>("offline");

  // Listen for call state broadcasts from softphone via IPC
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onCallStateChanged) return;
    const cleanup = api.onCallStateChanged((state: CrossWindowCallState) => {
      setCallStatus(state.callStatus);
      setIsMuted(state.isMuted);
      setIsOnHold(state.isOnHold);
      setCallDuration(state.callDuration);
      setIncomingFrom(state.incomingFrom);
      setExtensionNumber(state.extensionNumber);
      setDialedTarget(state.dialedTarget);
      setCallDirection(state.callDirection);
      setPhoneStatus(state.phoneStatus ?? "offline");
    });
    return cleanup;
  }, []);

  const makeCall = useCallback((number: string) => {
    window.electronAPI?.requestCall(number);
  }, []);

  const hangUp = useCallback(() => {
    window.electronAPI?.requestHangup();
  }, []);

  const acceptCall = useCallback(() => {
    window.electronAPI?.requestAcceptCall();
  }, []);

  const rejectCall = useCallback(() => {
    window.electronAPI?.requestRejectCall();
  }, []);

  // These actions are not supported from delegate — no-ops
  const toggleMute = useCallback(() => {}, []);
  const sendDtmf = useCallback((_digit: string) => {}, []);
  const setInputDevice = useCallback(async (_deviceId: string) => {}, []);
  const setOutputDevice = useCallback(async (_deviceId: string) => {}, []);
  const holdCall = useCallback(async () => {}, []);
  const unholdCall = useCallback(async () => {}, []);
  const blindTransfer = useCallback(async (_targetExt: string) => {}, []);
  const startAttendedTransfer = useCallback((_targetExt: string) => {}, []);
  const completeAttendedTransfer = useCallback(async () => {}, []);
  const cancelAttendedTransfer = useCallback(async () => {}, []);

  return {
    phoneStatus,
    callStatus,
    isMuted,
    isOnHold,
    callDuration,
    incomingFrom,
    incomingIsInternal: false,
    incomingCallerUserId: null,
    errorMessage: null,
    extensionNumber,
    hasExtension: !!extensionNumber,
    activeCallSid: null,
    transferMode: null,
    transferPhase: "idle",
    consultCallSid: null,
    consultTarget: null,
    dialedTarget,
    callDirection,
    makeCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    sendDtmf,
    setInputDevice,
    setOutputDevice,
    holdCall,
    unholdCall,
    blindTransfer,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
  };
}

// ─── Primary hook: owns the Twilio Device (softphone window or non-Electron) ───
function useVoicePhonePrimary(): UseVoicePhoneReturn {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>("offline");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [incomingIsInternal, setIncomingIsInternal] = useState(false);
  const [incomingCallerUserId, setIncomingCallerUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extensionNumber, setExtensionNumber] = useState<string | null>(null);
  const [hasExtension, setHasExtension] = useState(false);
  const [registrationVersion, setRegistrationVersion] = useState(0);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [transferMode, setTransferMode] = useState<TransferMode>(null);
  const [transferPhase, setTransferPhase] = useState<TransferPhase>("idle");
  const [consultCallSid, setConsultCallSid] = useState<string | null>(null);
  const [consultTarget, setConsultTarget] = useState<string | null>(null);
  const [dialedTarget, setDialedTarget] = useState<string | null>(null);
  const [callDirection, setCallDirection] = useState<"inbound" | "outbound" | null>(null);

  const heldCallSidRef = useRef<string | null>(null);
  const transferModeRef = useRef<TransferMode>(null);
  const transferPhaseRef = useRef<TransferPhase>("idle");
  const consultCallRef = useRef<Call | null>(null);
  const consultCallSidRef = useRef<string | null>(null);
  const isOnHoldRef = useRef(false);
  const holdDurationRef = useRef(0);
  const holdWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transferContextRef = useRef<{ originalCaller: string; transferredFrom: string } | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const incomingCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const credentialsRef = useRef<{ sip_username: string; sip_password: string } | null>(null);
  const retryCountRef = useRef(0);
  const destroyedRef = useRef(false);

  const setPhase = useCallback((phase: TransferPhase) => { transferPhaseRef.current = phase; setTransferPhase(phase); }, []);
  const setMode = useCallback((mode: TransferMode) => { transferModeRef.current = mode; setTransferMode(mode); }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const stopHoldWatchdog = useCallback(() => {
    if (holdWatchdogRef.current) { clearInterval(holdWatchdogRef.current); holdWatchdogRef.current = null; }
  }, []);

  const cleanupCall = useCallback(() => {
    activeCallRef.current = null;
    incomingCallRef.current = null;
    consultCallRef.current = null;
    consultCallSidRef.current = null;
    isOnHoldRef.current = false;
    transferContextRef.current = null;
    setCallStatus("idle");
    setIsMuted(false);
    setIsOnHold(false);
    setIncomingFrom(null);
    setIncomingIsInternal(false);
    setIncomingCallerUserId(null);
    setActiveCallSid(null);
    setMode(null);
    setPhase("idle");
    setConsultCallSid(null);
    setConsultTarget(null);
    setDialedTarget(null);
    setCallDirection(null);
    holdDurationRef.current = 0;
    heldCallSidRef.current = null;
    stopHoldWatchdog();
    stopTimer();
    setCallDuration(0);
  }, [stopTimer, setMode, setPhase, stopHoldWatchdog]);

  const resolveCallerIdentity = useCallback(async (from: string) => {
    let sipUsername: string | null = null;
    if (from.startsWith("client:")) sipUsername = from.replace("client:", "");
    else if (from.startsWith("sip:")) sipUsername = from.replace("sip:", "").split("@")[0];
    if (!sipUsername) return;
    try {
      const { data: device } = await supabase.from("devices").select("extension_id").eq("sip_username", sipUsername).maybeSingle();
      if (!device?.extension_id) return;
      const { data: ext } = await supabase.from("extensions").select("user_id, display_name, extension_number").eq("id", device.extension_id).maybeSingle();
      if (ext?.user_id) {
        setIncomingIsInternal(true);
        setIncomingCallerUserId(ext.user_id);
        setIncomingFrom(ext.display_name || `Ext ${ext.extension_number}`);
      }
    } catch (err) { console.error("Failed to resolve caller identity:", err); }
  }, []);

  const fetchToken = useCallback(async (): Promise<string | null> => {
    const creds = credentialsRef.current;
    if (!creds) return null;
    try {
      const { data, error } = await supabase.functions.invoke("generate-voice-token", {
        body: { sip_username: creds.sip_username, sip_password: creds.sip_password },
      });
      if (error || data?.error) { console.error("Token fetch error:", error || data?.error); return null; }
      return data.token;
    } catch (err) { console.error("Token fetch exception:", err); return null; }
  }, []);

  const reconnectDevice = useCallback(async () => {
    const device = deviceRef.current;
    if (!device || destroyedRef.current) return;
    const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 30000);
    retryCountRef.current++;
    setPhoneStatus("connecting");
    await new Promise((r) => setTimeout(r, delay));
    if (destroyedRef.current) return;
    try {
      const newToken = await fetchToken();
      if (!newToken || destroyedRef.current) { if (!destroyedRef.current) reconnectDevice(); return; }
      device.updateToken(newToken);
      await device.register();
    } catch (err: any) {
      console.error("Reconnect attempt failed:", err);
      if (!destroyedRef.current) reconnectDevice();
    }
  }, [fetchToken]);

  const setupCallListeners = useCallback((call: Call, direction: "inbound" | "outbound") => {
    activeCallRef.current = call;
    call.on("accept", () => {
      setCallStatus("in-call");
      setActiveCallSid(call.parameters?.CallSid || null);
      startTimer();
    });
    const guardedCleanup = () => {
      if (isOnHoldRef.current) { activeCallRef.current = null; return; }
      if (transferModeRef.current === "consulting") { activeCallRef.current = null; return; }
      cleanupCall();
    };
    call.on("disconnect", guardedCleanup);
    call.on("cancel", guardedCleanup);
    call.on("reject", guardedCleanup);
    call.on("error", (err: any) => { console.error("Call error:", err); guardedCleanup(); });
  }, [startTimer, cleanupCall]);

  // Initialize device
  useEffect(() => {
    if (!user || !currentWorkspace) { setHasExtension(false); return; }
    let cancelled = false;
    destroyedRef.current = false;
    retryCountRef.current = 0;

    const init = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("manage-extensions", {
          body: { action: "get_my_extension", workspace_id: currentWorkspace.id },
        });
        if (error || data?.error || !data?.extension) { setHasExtension(false); return; }
        if (cancelled) return;

        setHasExtension(true);
        setExtensionNumber(data.extension.extension_number);
        credentialsRef.current = { sip_username: data.device.sip_username, sip_password: data.device.sip_password };

        setPhoneStatus("connecting");
        const token = await fetchToken();
        if (!token || cancelled) { setPhoneStatus("error"); setErrorMessage("Failed to get voice token"); return; }

        const device = new Device(token, { codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU], closeProtection: true });

        device.on("registered", () => { if (!cancelled) { setPhoneStatus("registered"); retryCountRef.current = 0; } });
        device.on("unregistered", () => { if (!cancelled && !destroyedRef.current) reconnectDevice(); });
        device.on("error", (err: any) => { console.error("Device error:", err); if (!cancelled) { retryCountRef.current = 0; reconnectDevice(); } });

        device.on("incoming", (call: Call) => {
          if (cancelled) return;

          // Auto-accept after unhold
          if (isOnHoldRef.current) {
            call.accept();
            setupCallListeners(call, "inbound");
            setActiveCallSid(call.parameters?.CallSid || null);
            setCallStatus("in-call");
            isOnHoldRef.current = false;
            setIsOnHold(false);
            stopHoldWatchdog();
            if (transferContextRef.current) {
              const ctx = transferContextRef.current;
              let label = ctx.transferredFrom && ctx.originalCaller ? `${ctx.originalCaller} (via ${ctx.transferredFrom})` : ctx.originalCaller || "";
              if (label) setIncomingFrom(label);
            }
            startTimer();
            return;
          }

          incomingCallRef.current = call;
          setCallStatus("ringing-in");
          const from = call.parameters?.From || "Unknown";
          setIncomingFrom(from);

          // Transfer params
          const originalCaller = call.customParameters?.get("originalCaller");
          const transferredFrom = call.customParameters?.get("transferredFrom");
          if (originalCaller || transferredFrom) {
            transferContextRef.current = { originalCaller: originalCaller || "", transferredFrom: transferredFrom || "" };
            let label = transferredFrom && originalCaller ? `${originalCaller} (via ${transferredFrom})` : originalCaller || `Transfer from ${transferredFrom}`;
            setIncomingFrom(label);
          } else {
            const callerExt = call.customParameters?.get("callerExt");
            const callerName = call.customParameters?.get("callerName");
            if (callerExt) {
              setIncomingFrom(callerName ? `${callerName} (Ext ${callerExt})` : `Ext ${callerExt}`);
              setIncomingIsInternal(true);
            } else if (from.startsWith("client:") || from.startsWith("sip:")) {
              resolveCallerIdentity(from);
            }
          }

          // Trigger native notification in Electron
          if (window.electronAPI?.isElectron) {
            window.electronAPI.showNotification({ title: "Incoming Call", body: from, type: "call" });
          }

          const guardedIncomingCleanup = () => {
            if (transferModeRef.current === "consulting") { incomingCallRef.current = null; return; }
            if (isOnHoldRef.current) { incomingCallRef.current = null; return; }
            cleanupCall();
          };
          call.on("cancel", guardedIncomingCleanup);
          call.on("disconnect", guardedIncomingCleanup);
          call.on("reject", guardedIncomingCleanup);
        });

        device.on("tokenWillExpire", async () => {
          const newToken = await fetchToken();
          if (newToken) device.updateToken(newToken);
        });

        await device.register();
        deviceRef.current = device;
      } catch (err: any) {
        console.error("Voice init error:", err);
        if (!cancelled) { setPhoneStatus("error"); setErrorMessage(err.message); }
      }
    };

    init();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && deviceRef.current && !destroyedRef.current) {
        if (deviceRef.current.state !== "registered") { retryCountRef.current = 0; reconnectDevice(); }
      }
    };
    const handleOnline = () => {
      if (deviceRef.current && !destroyedRef.current && deviceRef.current.state !== "registered") { retryCountRef.current = 0; reconnectDevice(); }
    };
    const healthCheck = setInterval(() => {
      if (deviceRef.current && !destroyedRef.current && deviceRef.current.state !== "registered") { retryCountRef.current = 0; reconnectDevice(); }
    }, 60000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      destroyedRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      clearInterval(healthCheck);
      if (deviceRef.current) { deviceRef.current.destroy(); deviceRef.current = null; }
      cleanupCall();
      setPhoneStatus("offline");
      setHasExtension(false);
    };
  }, [user?.id, currentWorkspace?.id, registrationVersion, reconnectDevice]);

  // Listen for extension reassignment
  const callStatusRef = useRef<CallStatus>(callStatus);
  callStatusRef.current = callStatus;

  useEffect(() => {
    if (!currentWorkspace?.id || !extensionNumber) return;
    const transferChannel = supabase.channel(`transfer-notify:${currentWorkspace.id}`)
      .on("broadcast", { event: "blind_transfer_redirect" }, (msg: any) => {
        const { newRemoteExtNumber, newRemoteDisplayName, newRemoteUserId } = msg.payload || {};
        if (activeCallRef.current && callStatusRef.current === "in-call") {
          const label = newRemoteDisplayName ? `${newRemoteDisplayName} (Ext ${newRemoteExtNumber})` : `Ext ${newRemoteExtNumber}`;
          setIncomingFrom(label);
          setIncomingIsInternal(true);
          setIncomingCallerUserId(newRemoteUserId || null);
        }
      }).subscribe();
    return () => { supabase.removeChannel(transferChannel); };
  }, [currentWorkspace?.id, extensionNumber]);

  useEffect(() => {
    if (!user?.id || !currentWorkspace?.id) return;
    const channel = supabase.channel(`ext-changes-${currentWorkspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "extensions", filter: `workspace_id=eq.${currentWorkspace.id}` }, (payload: any) => {
        if (payload.new?.user_id === user.id || payload.old?.user_id === user.id) setRegistrationVersion((v) => v + 1);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, currentWorkspace?.id]);

  // Listen for notification actions from Electron (answer/reject)
  useEffect(() => {
    const api = window.electronAPI as any;
    if (!api?.onNotificationAction) return;
    const cleanup = api.onNotificationAction((action: string) => {
      if (action === "answer" && incomingCallRef.current) {
        setCallDirection("inbound");
        incomingCallRef.current.accept();
        setupCallListeners(incomingCallRef.current, "inbound");
      } else if (action === "reject" && incomingCallRef.current) {
        incomingCallRef.current.reject();
        cleanupCall();
      }
    });
    return cleanup;
  }, [setupCallListeners, cleanupCall]);

  // ─── Listen for delegated call actions from chat window via IPC ───
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isElectron || !isSoftphoneWindow()) return;

    const cleanups: (() => void)[] = [];

    if (api.onCallMakeRequest) {
      cleanups.push(api.onCallMakeRequest((number: string) => {
        if (deviceRef.current && callStatusRef.current === "idle") {
          makeCallInternal(number);
        }
      }));
    }

    if (api.onCallHangupRequest) {
      cleanups.push(api.onCallHangupRequest(() => {
        hangUpInternal();
      }));
    }

    if (api.onCallAcceptRequest) {
      cleanups.push(api.onCallAcceptRequest(() => {
        if (incomingCallRef.current) {
          setCallDirection("inbound");
          incomingCallRef.current.accept();
          setupCallListeners(incomingCallRef.current, "inbound");
        }
      }));
    }

    if (api.onCallRejectRequest) {
      cleanups.push(api.onCallRejectRequest(() => {
        if (incomingCallRef.current) {
          incomingCallRef.current.reject();
          cleanupCall();
        }
      }));
    }

    return () => cleanups.forEach((c) => c());
  }, [setupCallListeners, cleanupCall]);

  // ─── Broadcast call state to other windows via IPC ───
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isElectron || !isSoftphoneWindow() || !api.broadcastCallState) return;

    const state: CrossWindowCallState = {
      callStatus,
      incomingFrom,
      isMuted,
      isOnHold,
      callDuration,
      extensionNumber,
      dialedTarget,
      callDirection,
      phoneStatus,
    };
    api.broadcastCallState(state);
  }, [callStatus, incomingFrom, isMuted, isOnHold, callDuration, extensionNumber, dialedTarget, callDirection, phoneStatus]);

  // Internal make call (used by both direct calls and IPC-delegated)
  const makeCallInternal = useCallback(async (number: string) => {
    if (!deviceRef.current || callStatus !== "idle") return;
    setDialedTarget(number);
    setCallDirection("outbound");
    try {
      const call = await deviceRef.current.connect({ params: { To: number } });
      setCallStatus("ringing-out");
      setupCallListeners(call, "outbound");
    } catch (err) { console.error("makeCall error:", err); setDialedTarget(null); setCallDirection(null); }
  }, [callStatus, setupCallListeners]);

  const makeCall = useCallback(async (number: string) => {
    makeCallInternal(number);
  }, [makeCallInternal]);

  const acceptCall = useCallback(() => {
    if (!incomingCallRef.current) return;
    setCallDirection("inbound");
    incomingCallRef.current.accept();
    setupCallListeners(incomingCallRef.current, "inbound");
  }, [setupCallListeners]);

  const rejectCall = useCallback(() => {
    if (!incomingCallRef.current) return;
    incomingCallRef.current.reject();
    cleanupCall();
  }, [cleanupCall]);

  const invokeCallAction = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("call-actions", {
      body: { ...body, workspace_id: currentWorkspace?.id },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Call action failed");
    return data;
  }, [currentWorkspace?.id]);

  const hangUpInternal = useCallback(() => {
    if (activeCallSid && currentWorkspace?.id) invokeCallAction({ action: "hangup_remote", callSid: activeCallSid }).catch(() => {});
    if (activeCallRef.current) activeCallRef.current.disconnect();
    if (incomingCallRef.current) incomingCallRef.current.reject();
    cleanupCall();
  }, [activeCallSid, currentWorkspace?.id, cleanupCall, invokeCallAction]);

  const hangUp = useCallback(() => {
    hangUpInternal();
  }, [hangUpInternal]);

  const toggleMute = useCallback(() => {
    if (!activeCallRef.current) return;
    const newMuted = !activeCallRef.current.isMuted();
    activeCallRef.current.mute(newMuted);
    setIsMuted(newMuted);
  }, []);

  const sendDtmf = useCallback((digit: string) => { activeCallRef.current?.sendDigits(digit); }, []);
  const setInputDevice = useCallback(async (deviceId: string) => { if (deviceRef.current?.audio) await deviceRef.current.audio.setInputDevice(deviceId); }, []);
  const setOutputDevice = useCallback(async (deviceId: string) => { if (deviceRef.current?.audio) await (deviceRef.current.audio as any).speakerDevices?.set(deviceId); }, []);

  const holdCall = useCallback(async () => {
    if (!activeCallSid) return;
    isOnHoldRef.current = true;
    setIsOnHold(true);
    try {
      await invokeCallAction({ action: "hold", callSid: activeCallSid });
      stopHoldWatchdog();
      const sid = activeCallSid;
      holdWatchdogRef.current = setInterval(async () => {
        try {
          const { data } = await supabase.functions.invoke("call-actions", { body: { action: "remote_leg_status", callSid: sid, workspace_id: currentWorkspace?.id } });
          if (data && !data.active) { stopHoldWatchdog(); cleanupCall(); }
        } catch {}
      }, 4000);
    } catch (err) { console.error("Hold failed:", err); isOnHoldRef.current = false; setIsOnHold(false); }
  }, [activeCallSid, invokeCallAction, stopHoldWatchdog, cleanupCall, currentWorkspace?.id]);

  const unholdCall = useCallback(async () => {
    if (!activeCallSid) return;
    stopHoldWatchdog();
    try { await invokeCallAction({ action: "unhold", callSid: activeCallSid }); }
    catch (err) { console.error("Unhold failed:", err); isOnHoldRef.current = false; setIsOnHold(false); cleanupCall(); }
  }, [activeCallSid, invokeCallAction, cleanupCall, stopHoldWatchdog]);

  const blindTransfer = useCallback(async (targetExt: string) => {
    if (!activeCallSid) return;
    await invokeCallAction({ action: "blind_transfer", callSid: activeCallSid, target: targetExt });
    cleanupCall();
  }, [activeCallSid, invokeCallAction, cleanupCall]);

  const startAttendedTransfer = useCallback((targetExt: string) => {
    if (!activeCallSid) return;
    heldCallSidRef.current = activeCallSid;
    setMode("consulting");
    setPhase("holding");
    setConsultTarget(targetExt);
    stopTimer();

    let recoveryRan = false;
    const unholdOriginal = async () => {
      if (recoveryRan) return;
      recoveryRan = true;
      const origSid = heldCallSidRef.current;
      setMode(null);
      setPhase("rejoining");
      setConsultCallSid(null);
      consultCallSidRef.current = null;
      setConsultTarget(null);
      consultCallRef.current = null;
      activeCallRef.current = null;
      stopTimer();
      if (origSid) {
        setActiveCallSid(origSid);
        try {
          await invokeCallAction({ action: "unhold", callSid: origSid });
          setCallStatus("in-call");
          setIsOnHold(false);
          setPhase("idle");
          startTimer();
        } catch { cleanupCall(); }
      } else cleanupCall();
    };

    const sidToHold = heldCallSidRef.current;
    if (!sidToHold) return;

    invokeCallAction({ action: "hold", callSid: sidToHold })
      .then(() => {
        setIsOnHold(true);
        setPhase("consult_ringing");
        if (!deviceRef.current) return;
        setCallStatus("ringing-out");
        deviceRef.current.connect({ params: { To: targetExt } }).then((consultCall) => {
          consultCallRef.current = consultCall;
          activeCallRef.current = consultCall;
          const immediateSid = consultCall.parameters?.CallSid || null;
          if (immediateSid) { consultCallSidRef.current = immediateSid; setConsultCallSid(immediateSid); }
          consultCall.on("accept", () => {
            const sid = consultCall.parameters?.CallSid || null;
            if (sid) { consultCallSidRef.current = sid; setConsultCallSid(sid); }
            setActiveCallSid(sid);
            setCallStatus("in-call");
            setPhase("consult_connected");
            startTimer();
          });
          consultCall.on("disconnect", () => { if (transferModeRef.current === "consulting" && transferPhaseRef.current !== "completing") unholdOriginal(); });
          consultCall.on("cancel", () => { if (transferModeRef.current === "consulting") unholdOriginal(); });
          consultCall.on("reject", () => { if (transferModeRef.current === "consulting") unholdOriginal(); });
          consultCall.on("error", () => { if (transferModeRef.current === "consulting") unholdOriginal(); });
        }).catch(() => unholdOriginal());
      })
      .catch(() => { setMode(null); setPhase("idle"); setConsultTarget(null); });
  }, [activeCallSid, invokeCallAction, startTimer, stopTimer, cleanupCall, setMode, setPhase]);

  const completeAttendedTransfer = useCallback(async () => {
    const held = heldCallSidRef.current;
    const cSid = consultCallSidRef.current || consultCallSid;
    if (!held || !cSid) throw new Error("Missing call SIDs for transfer");
    setPhase("completing");
    try {
      await invokeCallAction({ action: "attended_transfer", heldCallSid: held, consultCallSid: cSid });
      cleanupCall();
    } catch (err) { setPhase("consult_connected"); throw err; }
  }, [consultCallSid, invokeCallAction, cleanupCall, setPhase]);

  const cancelAttendedTransfer = useCallback(async () => {
    setMode(null);
    setPhase("rejoining");
    if (consultCallRef.current) { consultCallRef.current.disconnect(); consultCallRef.current = null; }
    consultCallSidRef.current = null;
    setConsultCallSid(null);
    setConsultTarget(null);
    if (heldCallSidRef.current) {
      setActiveCallSid(heldCallSidRef.current);
      try {
        await invokeCallAction({ action: "unhold", callSid: heldCallSidRef.current });
        setIsOnHold(false);
        setCallStatus("in-call");
        setPhase("idle");
        startTimer();
      } catch { cleanupCall(); }
    } else cleanupCall();
  }, [invokeCallAction, setMode, setPhase, startTimer, cleanupCall]);

  return {
    phoneStatus, callStatus, isMuted, isOnHold, callDuration, incomingFrom, incomingIsInternal,
    incomingCallerUserId, errorMessage, extensionNumber, hasExtension, activeCallSid, transferMode,
    transferPhase, consultCallSid, makeCall, acceptCall, rejectCall, hangUp, toggleMute, sendDtmf,
    setInputDevice, setOutputDevice, holdCall, unholdCall, blindTransfer, startAttendedTransfer,
    completeAttendedTransfer, cancelAttendedTransfer, consultTarget, dialedTarget, callDirection,
  };
}

// Export both hooks — VoicePhoneContext picks the right one based on window role
export { useVoicePhonePrimary, useVoicePhoneDelegate, isElectronDelegateWindow };

// Default export for non-Electron or single-window usage
export function useVoicePhone(): UseVoicePhoneReturn {
  return useVoicePhonePrimary();
}
