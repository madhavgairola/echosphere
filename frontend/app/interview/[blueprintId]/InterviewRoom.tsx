"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProctorEngine from './ProctorEngine';
import { injectKnowledgeBaseIntoAgentInstructions } from '@/lib/enrichment/knowledgeBase';
import { Users, Shield, Zap, Sparkles, Mic, Volume2, UserCheck, AlertCircle, Clock } from 'lucide-react';
import ParticleTalkingOrb from '@/components/room/ParticleTalkingOrb';

type InterviewerInfo = {
  interviewer_id?: string;
  name: string;
  role: string;
  voice?: string;
  color?: string;
  is_primary?: boolean;
  agent_uid?: number;
  instructions: string;
  greeting_message: string;
};

type Blueprint = {
  interview_rounds: {
    round_name: string;
    round_type?: 'technical' | 'hr';
    purpose: string;
    interviewers?: InterviewerInfo[];
    interviewer: InterviewerInfo;
    topics: string[];
  }[];
  rubric: Record<string, string>;
};

interface RunningAgent {
  agentId: string;
  agentUid: number;
  name: string;
  role: string;
  voice: string;
  color: string;
  isPrimary: boolean;
  hasFloor: boolean;
  intervening: boolean;
}

export default function InterviewRoom({ 
  blueprint, 
  interviewId, 
  candidateName,
  jobTitle,
  candidateContext,
  resumeText,
  mcpServerUrl
}: { 
  blueprint: Blueprint; 
  interviewId: string;
  candidateName: string;
  jobTitle?: string;
  candidateContext?: any;
  resumeText?: string;
  mcpServerUrl?: string;
}) {
  const router = useRouter();
  const [testState, setTestState] = useState<'IDLE' | 'STARTING' | 'RUNNING' | 'TECHNICAL_CLOSING' | 'HR_CLOSING' | 'STOPPING' | 'EVALUATING' | 'DECISION_GATE' | 'ROUND_TRANSITION' | 'INTERVIEW_COMPLETE' | 'ENDED' | 'ERROR'>('IDLE');
  const [logs, setLogs] = useState<{time: string, comp: string, msg: string}[]>([]);
  const [transcript, setTranscript] = useState<{round?: string, speaker: string, text: string}[]>([]);
  const [micVolume, setMicVolume] = useState(0);
  const [floorOwner, setFloorOwner] = useState<'PRIMARY_AI' | 'CHALLENGER_AI' | 'HR_AI' | 'CANDIDATE' | 'NONE' | 'CROSSTALK'>('NONE');
  const [currentRound, setCurrentRound] = useState(0);
  const [activePanelAgents, setActivePanelAgents] = useState<RunningAgent[]>([]);
  const [pendingFloorNotice, setPendingFloorNotice] = useState<string | null>(null);
  const [roundElapsedSeconds, setRoundElapsedSeconds] = useState(0);
  const [wrapUpWarning, setWrapUpWarning] = useState(false);
  const autoFinishTriggeredRef = useRef<boolean>(false);

  // Round Timer & Criteria Progression (5 mins for tech, 3 mins for HR)
  const ROUND_TARGET_SECONDS = currentRound === 0 ? 300 : 180;

  useEffect(() => {
    let timer: any = null;
    if (testState === 'RUNNING') {
      timer = setInterval(() => {
        setRoundElapsedSeconds(prev => {
          const next = prev + 1;
          // Smooth wrap-up notice 10s before round target (at 4:50 mark for 5-min round)
          if (next >= ROUND_TARGET_SECONDS - 10 && !autoFinishTriggeredRef.current) {
            setWrapUpWarning(true);
          }
          // Auto-trigger round wrap-up when criteria/time mark is reached
          if (next >= ROUND_TARGET_SECONDS && !autoFinishTriggeredRef.current) {
            autoFinishTriggeredRef.current = true;
            addLog('Orchestrator', `Maximum target round duration reached (${Math.floor(ROUND_TARGET_SECONDS / 60)}m). Concluding round smoothly...`);
            finishRound('TIME_LIMIT_REACHED');
          }
          return next;
        });
      }, 1000);
    } else {
      setRoundElapsedSeconds(0);
      setWrapUpWarning(false);
      autoFinishTriggeredRef.current = false;
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testState, currentRound]);

  const runningAgentsRef = useRef<RunningAgent[]>([]);
  useEffect(() => {
    runningAgentsRef.current = activePanelAgents;
  }, [activePanelAgents]);

  // Auto-redirect to completed summary page when interview concludes
  useEffect(() => {
    if (testState === 'ENDED') {
      const timer = setTimeout(() => {
        router.push(`/interview/${interviewId}/completed`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [testState, interviewId, router]);

  // Auto-start next round after ROUND_TRANSITION
  useEffect(() => {
    if (testState === 'ROUND_TRANSITION') {
      const nextRoundIdx = currentRound;
      const timer = setTimeout(() => {
        addLog('System', `Auto-starting Round ${nextRoundIdx + 1} (${blueprint.interview_rounds[nextRoundIdx]?.round_name || 'HR & Culture Round'})...`);
        startTest(nextRoundIdx);
      }, 3500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testState, currentRound]);

  const [sessionInfo, setSessionInfo] = useState<{
    sessionId: string;
    channel: string;
    candidateUid: number;
    agentIds: string[];
  } | null>(null);

  const clientRef = useRef<any>(null);
  const localAudioTrackRef = useRef<any>(null);
  const remoteAudioTracksRef = useRef<Map<number, any>>(new Map());
  const currentFloorRef = useRef<'PRIMARY_AI' | 'CHALLENGER_AI' | 'HR_AI'>('PRIMARY_AI');
  const candidateUidRef = useRef<number>(Math.floor(100000 + Math.random() * 890000));
  const isStartingRef = useRef<boolean>(false);
  const technicalSummaryRef = useRef<{ score: number; reason: string; evidence: string[] } | null>(null);

  // Stateful remote audio playback with strict floor track gating
  const initializeRemoteTrack = (uid: number, track: any) => {
    remoteAudioTracksRef.current.set(uid, track);
    try {
      track.play();
      if (uid === 9991 || uid === 9999) {
        // Primary agent starts unmuted if floor is Primary
        const vol = currentFloorRef.current === 'PRIMARY_AI' ? 100 : 0;
        track.setVolume(vol);
      } else if (uid === 9992) {
        // Challenger starts muted in silent standby until floor is explicitly handed over
        const vol = currentFloorRef.current === 'CHALLENGER_AI' ? 100 : 0;
        track.setVolume(vol);
      } else {
        track.setVolume(100);
      }
    } catch (e) {
      console.warn('[AutonomousFloor] Error playing remote track:', e);
    }
  };

  const addLog = (comp: string, msg: string) => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), comp, msg }]);
  };

  // Keep track of latest session info for unmount cleanup without triggering re-runs
  const sessionInfoRef = useRef(sessionInfo);
  useEffect(() => {
    sessionInfoRef.current = sessionInfo;
  }, [sessionInfo]);

  // Cleanup on tab close/refresh/unmount: Stop all running agents & leave Agora channel (Anti-Zombie Guarantee)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const info = sessionInfoRef.current;
      if (info?.agentIds && info.agentIds.length > 0) {
        navigator.sendBeacon('/api/agora-mllm/stop-mllm', JSON.stringify({ 
          session_id: info.sessionId, 
          agent_ids: info.agentIds 
        }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Stop agents if component unmounts unexpectedly
      const info = sessionInfoRef.current;
      if (info?.agentIds && info.agentIds.length > 0) {
        // Use sendBeacon for reliable delivery during unmount
        navigator.sendBeacon('/api/agora-mllm/stop-mllm', JSON.stringify({ 
          session_id: info.sessionId, 
          agent_ids: info.agentIds 
        }));
      }

      if (localAudioTrackRef.current) {
        try {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current.close();
        } catch (e) {}
        localAudioTrackRef.current = null;
      }
      if (clientRef.current) {
        try {
          clientRef.current.leave();
        } catch (e) {}
        clientRef.current = null;
      }
      remoteAudioTracksRef.current.clear();
    };
  }, []);

  // Handle Candidate Utterance & Deterministic Floor Arbitration
  const handleCandidateUtterance = async (utterance: string) => {
    if (!utterance || utterance.length < 8) return;
    try {
      const round = blueprint.interview_rounds[currentRound] || blueprint.interview_rounds[0];
      const res = await fetch(`/api/interviews/${interviewId}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CANDIDATE_UTTERANCE', utterance })
      });
      const stateData = await res.json();
      
      if (stateData.qualityReport) {
        addLog('Answer Classifier', `Response: ${stateData.qualityReport.classification} (Score: ${stateData.qualityReport.qualityScore})`);
      }

      // Check Challenger Active Observation
      if (stateData.challengerObservation?.action === 'STRUCTURED_FLOOR_REQUEST') {
        addLog('Challenger Observer', `Active observation formulated probe on ${stateData.challengerObservation.request?.targetCompetency}`);
      } else if (stateData.challengerObservation?.action === 'NO_INTERVENTION') {
        addLog('Challenger Observer', `No intervention needed: ${stateData.challengerObservation.reason}`);
      }

      // Handle Floor Grant to Challenger
      if (stateData.floorRequestResult?.granted) {
        const probeText = stateData.floorRequestResult.proposedProbe || stateData.challengerObservation?.request?.proposedProbe || 'Could you elaborate on the failure modes in your architecture?';
        const challengerName = challengerAgent?.name || 'Arjun Malhotra';
        
        addLog('Turn Arbiter', `Floor granted to Challenger (${challengerName}): ${stateData.floorRequestResult.decisionReason}`);
        setFloorOwner('CHALLENGER_AI');
        currentFloorRef.current = 'CHALLENGER_AI';
        remoteAudioTracksRef.current.get(9991)?.setVolume(0);
        remoteAudioTracksRef.current.get(9992)?.setVolume(100);
        setActivePanelAgents(prev => prev.map(a => ({
          ...a,
          hasFloor: !a.isPrimary,
          intervening: true
        })));

        // Append Challenger's probe to live transcript
        setTranscript(prev => [...prev, {
          round: round.round_name,
          speaker: challengerName,
          text: probeText
        }]);

        // Vocalize probe cleanly in room via Web Speech API
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const speechUtterance = new SpeechSynthesisUtterance(probeText);
            speechUtterance.rate = 1.0;
            speechUtterance.pitch = 0.95;
            speechUtterance.onend = () => {
              addLog('Turn Arbiter', `${challengerName} completed asking probe. Floor yielded for candidate response.`);
              setFloorOwner('NONE');
            };
            window.speechSynthesis.speak(speechUtterance);
          } catch (e) {
            console.warn('Speech synthesis error:', e);
          }
        }

        // Return floor to Lead Interviewer after probe interaction window (18s)
        setTimeout(() => {
          if (currentFloorRef.current === 'CHALLENGER_AI') {
            addLog('Turn Arbiter', `Specialist probe turn complete. Returning floor to Lead Interviewer.`);
            setFloorOwner('PRIMARY_AI');
            currentFloorRef.current = 'PRIMARY_AI';
            remoteAudioTracksRef.current.get(9992)?.setVolume(0);
            remoteAudioTracksRef.current.get(9991)?.setVolume(100);
            setActivePanelAgents(prev => prev.map(a => ({
              ...a,
              hasFloor: a.isPrimary,
              intervening: false
            })));
          }
        }, 18000);
      } else if (currentFloorRef.current === 'CHALLENGER_AI') {
        // If candidate just answered a Challenger probe, return floor to Primary Lead
        addLog('Turn Arbiter', `Candidate addressed Specialist probe. Returning floor to Lead Interviewer.`);
        setFloorOwner('PRIMARY_AI');
        currentFloorRef.current = 'PRIMARY_AI';
        remoteAudioTracksRef.current.get(9992)?.setVolume(0);
        remoteAudioTracksRef.current.get(9991)?.setVolume(100);
        setActivePanelAgents(prev => prev.map(a => ({
          ...a,
          hasFloor: a.isPrimary,
          intervening: false
        })));
      }

      // Check Natural Round Completion Criteria
      if (stateData.roundCompletion?.isComplete && !autoFinishTriggeredRef.current) {
        autoFinishTriggeredRef.current = true;
        addLog('Orchestrator', `✨ Natural round completion satisfied (${stateData.roundCompletion.completionReason}): ${stateData.roundCompletion.summary}. Concluding round immediately...`);
        finishRound();
      }

    } catch (err) {
      console.error('Turn arbitration sync error:', err);
    }
  };
  const transferFloorToChallenger = (reason: string = 'Deep-dive technical probe') => {
    addLog('Turn Arbiter', `Floor manually transferred to Specialist (${challengerAgent?.name || 'Specialist'}): ${reason}`);
    setFloorOwner('CHALLENGER_AI');
    currentFloorRef.current = 'CHALLENGER_AI';
    remoteAudioTracksRef.current.get(9991)?.setVolume(0);
    remoteAudioTracksRef.current.get(9992)?.setVolume(100);
    setActivePanelAgents(prev => prev.map(a => ({
      ...a,
      hasFloor: !a.isPrimary,
      intervening: true
    })));
  };

  // Explicit Floor Handoff to Lead (Primary)
  const transferFloorToPrimary = () => {
    addLog('Turn Arbiter', `Floor returned to Lead Interviewer (${primaryAgent?.name || 'Primary Lead'}).`);
    setFloorOwner('PRIMARY_AI');
    currentFloorRef.current = 'PRIMARY_AI';
    remoteAudioTracksRef.current.get(9992)?.setVolume(0);
    remoteAudioTracksRef.current.get(9991)?.setVolume(100);
    setActivePanelAgents(prev => prev.map(a => ({
      ...a,
      hasFloor: a.isPrimary,
      intervening: false
    })));
  };

  const startTest = async (roundIdx?: number) => {
    if (isStartingRef.current || testState === 'RUNNING' || testState === 'STARTING') return;
    isStartingRef.current = true;
    setTestState('STARTING');
    setLogs([]);
    
    const targetRound = roundIdx !== undefined ? roundIdx : currentRound;

    // Preserve transcript across rounds for the final evaluator
    if (targetRound === 0) {
      setTranscript([]);
    }

    // Unique attempt suffix guarantees an isolated Agora channel on every start/retry
    const sessionAttempt = Math.random().toString(36).substring(2, 7);
    const sessionId = `int_${interviewId}_rd${targetRound}_${sessionAttempt}`;
    
    // Dynamic candidate UID (100000-990000) avoids collisions with agents (9991-9993) or prior sessions
    if (!candidateUidRef.current || candidateUidRef.current < 100000) {
      candidateUidRef.current = Math.floor(100000 + Math.random() * 890000);
    }
    const candidateUid = candidateUidRef.current;
    
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      if (clientRef.current) {
        try {
          clientRef.current.removeAllListeners?.();
          if (clientRef.current.connectionState !== 'DISCONNECTED') {
            await clientRef.current.leave();
          }
        } catch (err) {}
        clientRef.current = null;
      }
      addLog('Frontend', `Initializing Agora RTC client (Candidate UID: ${candidateUid})...`);
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      const round = blueprint.interview_rounds[targetRound] || blueprint.interview_rounds[0];
      const isTechnicalRound = targetRound === 0 || round.round_type === 'technical';
      addLog('Orchestrator', `Loaded Round ${targetRound + 1}: ${round.round_name}`);

      const roundInterviewers: InterviewerInfo[] = round.interviewers && round.interviewers.length > 0
        ? round.interviewers
        : [round.interviewer];

      const runningAgents: RunningAgent[] = [];
      let channelName = '';
      let candidateToken = '';

      if (isTechnicalRound && roundInterviewers.length >= 2) {
        // Multi-Agent Technical Panel: 2 AI Interviewers simultaneously
        const primary = roundInterviewers[0];
        const challenger = roundInterviewers[1];
        
        addLog('Orchestrator', `Starting Multi-Agent Technical Panel: ${primary.name} (Primary) & ${challenger.name} (Challenger)`);

        // Inject authoritative panel rules dynamically into both agents
        const primaryStrictRule = `
================================================================================
TECHNICAL PANEL INTERVIEW PROTOCOL (LEAD DRIVER)
================================================================================
You are "${primary.name}" (${primary.role}), the PRIMARY LEAD INTERVIEWER in a live technical interview with the candidate "${candidateName}".

CORE RULES & PACING:
- You LEAD the blueprint. Greet "${candidateName}" warmly and ask Question 1.
- You speak DIRECTLY and EXCLUSIVELY to "${candidateName}".
- NEVER converse with, validate, address, or pass verbal turns to your colleague ("${challenger.name}").
- There are NO verbal handoffs (never say "over to you" or "would you like to ask").
- EVERY TURN you take MUST conclude with a direct question asked to "${candidateName}".
- Once you ask a question, STOP SPEAKING IMMEDIATELY and wait in silence for ${candidateName} to answer.
- Evaluate the candidate's answer strictly against the Answer Validation Protocol.
- If the candidate answers with gibberish or non-answers, NEVER say "makes sense" — challenge or ask to repeat.
================================================================================`;

        const primaryInstructions = injectKnowledgeBaseIntoAgentInstructions(
          (primary.instructions || '') + primaryStrictRule,
          candidateContext,
          candidateName,
          jobTitle || 'Engineering Role',
          resumeText
        );

        const challengerStrictRule = `
================================================================================
TECHNICAL SPECIALIST PROTOCOL (DEEP-DIVE PROBING)
================================================================================
You are "${challenger.name}" (${challenger.role}), the TECHNICAL SPECIALIST probing architectural failure modes, trade-offs, and scalability limits.

CORE RULES & SILENT STANDBY:
- SILENT STANDBY: When the session begins, DO NOT GREET THE CANDIDATE. REMAIN COMPLETELY SILENT.
- WHEN YOU SPEAK: You ONLY speak when granted the turn to probe a specific technical claim or failure mode.
- Direct your probe EXCLUSIVELY to "${candidateName}". Ask ONE sharp, concrete technical question (e.g. "How does your architecture handle split-brain or network partitions?").
- Once you ask your probe, STOP SPEAKING IMMEDIATELY and wait in silence for ${candidateName} to answer.
- After ${candidateName} finishes answering, give a brief 1-sentence assessment directly to ${candidateName} and yield the floor.
- NEVER converse with, validate, address, or pass verbal turns to "${primary.name}".
- There are NO verbal handoffs.
================================================================================`;

        const challengerInstructions = injectKnowledgeBaseIntoAgentInstructions(
          (challenger.instructions || '') + challengerStrictRule,
          candidateContext,
          candidateName,
          jobTitle || 'Engineering Role',
          resumeText
        );

        // 1. Spawn Primary Agent (UID 9991, Voice e.g. Aoede)
        addLog('Backend', `Spawning Primary Interviewer (${primary.name}, Voice: ${primary.voice || 'Aoede'})...`);
        const primaryRes = await fetch(`/api/agora-mllm/start-dynamic-mllm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            session_id: sessionId, 
            candidate_uid: candidateUid,
            agent_uid: primary.agent_uid || 9991,
            voice: primary.voice || 'Aoede',
            instructions: primaryInstructions,
            greeting_message: primary.greeting_message
          })
        });
        const primaryData = await primaryRes.json();
        if (!primaryRes.ok) throw new Error(primaryData.detail || `Failed to start ${primary.name}`);

        channelName = primaryData.channel_name;
        candidateToken = primaryData.candidate_token;

        runningAgents.push({
          agentId: primaryData.agent_id,
          agentUid: primary.agent_uid || 9991,
          name: primary.name,
          role: primary.role,
          voice: primary.voice || 'Aoede',
          color: primary.color || '#3B82F6',
          isPrimary: true,
          hasFloor: true,
          intervening: false
        });

        // 2. Spawn Challenger Agent (UID 9992, Voice e.g. Charon) into same channel
        addLog('Backend', `Spawning Specialist / Challenger (${challenger.name}, Voice: ${challenger.voice || 'Charon'})...`);
        const challengerRes = await fetch(`/api/agora-mllm/start-dynamic-mllm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            session_id: sessionId, 
            candidate_uid: candidateUid,
            agent_uid: challenger.agent_uid || 9992,
            voice: challenger.voice || 'Charon',
            instructions: challengerInstructions,
            greeting_message: "", // Suppress greeting on join so only Primary greets candidate
            channel_name: channelName
          })
        });
        const challengerData = await challengerRes.json();
        if (!challengerRes.ok) throw new Error(challengerData.detail || `Failed to start ${challenger.name}`);

        runningAgents.push({
          agentId: challengerData.agent_id,
          agentUid: challenger.agent_uid || 9992,
          name: challenger.name,
          role: challenger.role,
          voice: challenger.voice || 'Charon',
          color: challenger.color || '#8B5CF6',
          isPrimary: false,
          hasFloor: false,
          intervening: false
        });

      } else {
        // Single Agent Round (e.g. Round 2 HR Round)
        const solo = roundInterviewers[0];
        addLog('Orchestrator', `Starting Single Agent Round: ${solo.name}`);

        // Build HR context preamble with technical round summary
        let hrContextPreamble = '';
        if (currentRound > 0 && technicalSummaryRef.current) {
          const ts = technicalSummaryRef.current;
          hrContextPreamble = `\n\nIMPORTANT CONTEXT: The candidate (${candidateName}) has already completed the Technical Panel Interview. Technical Score: ${ts.score}/100. Panel assessment: "${ts.reason}". The technical round is COMPLETE — do NOT re-ask technical questions. You are now conducting the HR & Culture round. Begin with a warm, natural greeting and focus on behavioral fit, teamwork, and career goals.\n`;
        }

        const soloInstructions = injectKnowledgeBaseIntoAgentInstructions(
          (solo.instructions || '') + hrContextPreamble,
          candidateContext,
          candidateName,
          jobTitle || 'Engineering Role',
          resumeText
        );

        const soloRes = await fetch(`/api/agora-mllm/start-dynamic-mllm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            session_id: sessionId, 
            candidate_uid: candidateUid,
            agent_uid: solo.agent_uid || 9993,
            voice: solo.voice || 'Aoede',
            instructions: soloInstructions,
            greeting_message: solo.greeting_message
          })
        });
        const soloData = await soloRes.json();
        if (!soloRes.ok) throw new Error(soloData.detail || `Failed to start ${solo.name}`);

        channelName = soloData.channel_name;
        candidateToken = soloData.candidate_token;

        runningAgents.push({
          agentId: soloData.agent_id,
          agentUid: solo.agent_uid || 9993,
          name: solo.name,
          role: solo.role,
          voice: solo.voice || 'Aoede',
          color: solo.color || '#EA580C',
          isPrimary: true,
          hasFloor: true,
          intervening: false
        });
      }

      setActivePanelAgents(runningAgents);
      setSessionInfo({
        sessionId,
        channel: channelName,
        candidateUid,
        agentIds: runningAgents.map(a => a.agentId)
      });

      addLog('Backend', `Panel active in channel: ${channelName} (${runningAgents.length} agents)`);

      // Attach event listeners BEFORE joining the channel
      clientRef.current.removeAllListeners?.();

      clientRef.current.on("user-joined", (user: any) => {
        addLog('RTC', `[user-joined] Remote UID ${user.uid} joined channel`);
      });

      clientRef.current.on("user-published", async (user: any, mediaType: "audio" | "video") => {
        addLog('RTC', `[user-published] Remote UID ${user.uid} published ${mediaType}`);
        if (mediaType === "audio") {
          try {
            await clientRef.current.subscribe(user, "audio");
            initializeRemoteTrack(Number(user.uid), user.audioTrack);
            addLog('RTC', `Remote audio subscribed & playing for UID ${user.uid}`);
          } catch (e: any) {
            addLog('RTC', `Failed to subscribe to UID ${user.uid}: ${e.message}`);
          }
        }
      });

      clientRef.current.on("user-unpublished", (user: any, mediaType: string) => {
        addLog('RTC', `[user-unpublished] Remote UID ${user.uid} unpublished ${mediaType}`);
        if (mediaType === "audio") {
          remoteAudioTracksRef.current.delete(Number(user.uid));
        }
      });

      // Data Channel for Transcript, Speaker Attribution, and Real-Time Turn Handoffs
      clientRef.current.on("stream-message", (uid: number, payload: Uint8Array) => {
        try {
          const decoder = new TextDecoder('utf8');
          const dataStr = decoder.decode(payload);
          const data = JSON.parse(dataStr);
          
          if (data.text) {
            const numUid = Number(data.uid);

            let speakerName = candidateName;
            if (numUid === 9991 || numUid === 9999) {
              speakerName = runningAgentsRef.current.find(a => a.agentUid === 9991)?.name || 'Primary Interviewer';
            } else if (numUid === 9992) {
              speakerName = runningAgentsRef.current.find(a => a.agentUid === 9992)?.name || 'Challenger';
            } else if (numUid === 9993) {
              speakerName = runningAgentsRef.current.find(a => a.agentUid === 9993)?.name || 'HR Interviewer';
            } else if (numUid !== candidateUid) {
              speakerName = 'Interviewer';
            }

            setTranscript(prev => {
              const newArr = [...prev];
              const last = newArr[newArr.length - 1];
              
              if (last && last.speaker === speakerName) {
                if (data.is_final) {
                  last.text += " " + data.text;
                }
              } else {
                newArr.push({ round: round.round_name, speaker: speakerName, text: data.text });
              }
              return newArr;
            });

            // If candidate spoke, check for deterministic scalability/concurrency triggers or explicit name drops
            if (numUid === candidateUid && data.is_final) {
              handleCandidateUtterance(data.text);
            }
          }
        } catch (e) {
          // Ignore non-JSON Agora metadata frames
        }
      });

      // Turn Arbiter (Autonomous Floor Control & Strict Track Gating)
      clientRef.current.enableAudioVolumeIndicator();
      clientRef.current.on("volume-indicator", (volumes: any[]) => {
        let primarySpeaking = false;
        let challengerSpeaking = false;
        let hrSpeaking = false;
        let candidateSpeaking = false;

        volumes.forEach((vol) => {
          if ((vol.uid === 9991 || vol.uid === 9999) && vol.level > 10) primarySpeaking = true;
          if (vol.uid === 9992 && vol.level > 10) challengerSpeaking = true;
          if (vol.uid === 9993 && vol.level > 10) hrSpeaking = true;
          if (vol.uid === candidateUid && vol.level > 10) candidateSpeaking = true;
        });

        // Strict floor track gating: only the current floor owner's track is audible
        if (candidateSpeaking) {
          setFloorOwner('CANDIDATE');
          setMicVolume(volumes.find(v => v.uid === candidateUid)?.level || 0);
        } else if (currentFloorRef.current === 'PRIMARY_AI') {
          setFloorOwner(primarySpeaking ? 'PRIMARY_AI' : 'NONE');
          setMicVolume(0);
          remoteAudioTracksRef.current.get(9991)?.setVolume(100);
          remoteAudioTracksRef.current.get(9992)?.setVolume(0);
        } else if (currentFloorRef.current === 'CHALLENGER_AI') {
          setFloorOwner(challengerSpeaking ? 'CHALLENGER_AI' : 'NONE');
          setMicVolume(0);
          remoteAudioTracksRef.current.get(9992)?.setVolume(100);
          remoteAudioTracksRef.current.get(9991)?.setVolume(0);
        } else if (currentFloorRef.current === 'HR_AI') {
          setFloorOwner(hrSpeaking ? 'HR_AI' : 'NONE');
          setMicVolume(0);
          remoteAudioTracksRef.current.get(9993)?.setVolume(100);
        }
      });

      // Join RTC Channel
      addLog('RTC', `Joining RTC Channel: ${channelName} (Candidate UID: ${candidateUid})...`);
      await clientRef.current.join(
        process.env.NEXT_PUBLIC_AGORA_APP_ID || '', 
        channelName, 
        candidateToken, 
        candidateUid
      );

      clientRef.current.remoteUsers.forEach(async (user: any) => {
        if (user.hasAudio) {
          try {
            await clientRef.current.subscribe(user, "audio");
            initializeRemoteTrack(Number(user.uid), user.audioTrack);
            addLog('RTC', `Subscribed to existing remote UID ${user.uid}`);
          } catch (e) {}
        }
      });

      if (localAudioTrackRef.current) {
        try {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current.close();
        } catch (e) {}
        localAudioTrackRef.current = null;
      }
      const AgoraRTCSDK = (await import('agora-rtc-sdk-ng')).default;
      localAudioTrackRef.current = await AgoraRTCSDK.createMicrophoneAudioTrack();
      await clientRef.current.publish([localAudioTrackRef.current]);
      addLog('RTC', 'Local microphone published.');

      setTestState('RUNNING');
      addLog('System', `Round ${currentRound + 1} is running with active panel.`);

    } catch (e: any) {
      setTestState('ERROR');
      addLog('Error', e.message);
      // On error, randomize candidate UID so subsequent attempts never conflict
      candidateUidRef.current = Math.floor(100000 + Math.random() * 890000);
    } finally {
      isStartingRef.current = false;
    }
  };

  const finishRound = async (triggerReason: string = 'NATURAL_COMPLETION') => {
    const round = blueprint.interview_rounds[currentRound];
    const isTechnicalRound = currentRound === 0 || round.round_type === 'technical';
    const isLastRound = currentRound + 1 >= blueprint.interview_rounds.length;

    addLog('Orchestrator', `Concluding ${isTechnicalRound ? 'Technical' : 'HR'} round [Trigger: ${triggerReason}]...`);

    // ── Phase 1: Closing State ─────────────────────────────────────────────
    if (isTechnicalRound) {
      setTestState('TECHNICAL_CLOSING');
      addLog('Orchestrator', 'Technical round concluding — primary interviewer wrapping up...');
    } else {
      setTestState('HR_CLOSING');
      addLog('Orchestrator', 'HR round concluding — interviewer wrapping up...');
    }

    try {
      // ── Phase 2: Graceful Agent Shutdown ────────────────────────────────
      // For technical panel: stop Challenger first (silent during sign-off), then wait for Primary to finish speaking
      if (isTechnicalRound && sessionInfo?.agentIds && sessionInfo.agentIds.length >= 2) {
        // Stop the Challenger agent immediately so only Primary speaks
        const challengerAgentId = activePanelAgents.find(a => !a.isPrimary)?.agentId;
        if (challengerAgentId) {
          addLog('System', 'Stopping Challenger agent for clean sign-off...');
          await fetch('/api/agora-mllm/stop-mllm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionInfo.sessionId, agent_id: challengerAgentId })
          });
          addLog('System', 'Challenger agent stopped.');
        }

        // Wait for Primary to finish speaking by polling volume levels
        addLog('System', 'Waiting for primary interviewer to finish speaking...');
        await waitForAgentSilence(9991, 6000);

        // Now stop the Primary agent
        const primaryAgentId = activePanelAgents.find(a => a.isPrimary)?.agentId;
        if (primaryAgentId) {
          await fetch('/api/agora-mllm/stop-mllm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionInfo.sessionId, agent_id: primaryAgentId })
          });
          addLog('System', 'Primary agent stopped.');
        }
      } else {
        // Single agent round (HR): wait for agent to finish speaking, then stop
        addLog('System', 'Waiting for interviewer to finish speaking...');
        const soloUid = activePanelAgents[0]?.agentUid || 9993;
        await waitForAgentSilence(soloUid, 6000);

        if (sessionInfo?.agentIds && sessionInfo.agentIds.length > 0) {
          await fetch('/api/agora-mllm/stop-mllm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionInfo.sessionId, agent_ids: sessionInfo.agentIds })
          });
          addLog('System', `Stopped ${sessionInfo.agentIds.length} agent(s).`);
        }
      }

      // ── Phase 3: RTC Cleanup (preserve transcript) ─────────────────────
      setTestState('STOPPING');
      if (localAudioTrackRef.current) {
        try { localAudioTrackRef.current.stop(); localAudioTrackRef.current.close(); } catch (e) {}
        localAudioTrackRef.current = null;
      }
      if (clientRef.current) {
        try { await clientRef.current.leave(); } catch (e) {}
      }
      remoteAudioTracksRef.current.clear();
      setSessionInfo(null);
      setActivePanelAgents([]);

      // ── Phase 4: Decision Gate (Evaluate Round) ────────────────────────
      setTestState('EVALUATING');
      addLog('Arbiter', 'Evaluating round evidence via Decision Gate...');
      
      const roundName = round.round_name;
      const roundTranscript = transcript.filter(t => (t as any).round === roundName);
      
      const evalRes = await fetch(`/api/interviews/${interviewId}/evaluate-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundName, transcript: roundTranscript, rubric: blueprint.rubric })
      });
      
      const evalData = await evalRes.json();
      if (!evalRes.ok) throw new Error(evalData.error || 'Evaluation failed');
      
      addLog('Arbiter', `Decision Gate: ${evalData.evaluation.decision} (Score: ${evalData.evaluation.score}/100)`);
      setTestState('DECISION_GATE');

      // ── Phase 5: Transition Logic ──────────────────────────────────────
      if (isTechnicalRound && !isLastRound) {
        if (evalData.evaluation.decision === 'PASS') {
          // Store technical summary for HR context injection
          technicalSummaryRef.current = {
            score: evalData.evaluation.score,
            reason: evalData.evaluation.reason,
            evidence: roundTranscript.slice(-10).map((t: any) => `[${t.speaker}]: ${t.text?.slice(0, 100)}`),
          };

          addLog('System', `Technical Round Passed (Score: ${evalData.evaluation.score}/100). Transitioning to Round 2 (HR & Culture Round)...`);

          // Transition shared interview state to HR
          await fetch(`/api/interviews/${interviewId}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'TRANSITION_HR',
              technicalScore: evalData.evaluation.score,
              technicalDecisionReason: evalData.evaluation.reason
            })
          }).catch(err => console.error('State transition error:', err));

          setTestState('ROUND_TRANSITION');
          setCurrentRound(prev => prev + 1);
          // The useEffect watching for ROUND_TRANSITION will auto-start the next round
        } else {
          // Technical round FAILED (Score < 60) -> Do NOT launch HR round
          addLog('Decision Gate', `Technical Round FAILED (Score: ${evalData.evaluation.score}/100). Ending interview process.`);
          setTestState('INTERVIEW_COMPLETE');
          
          try {
            await fetch(`/api/interviews/${interviewId}/evaluate-final`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcript })
            });
          } catch (e) {
            console.error('Final evaluation post error:', e);
          }
          
          setTestState('ENDED');
        }
      } else {
        // Final round (HR or sole round) completed — synthesize final composite scorecard
        setTestState('INTERVIEW_COMPLETE');
        addLog('System', 'Interview panel concluded. Synthesizing final composite scorecard across all rounds...');
        
        try {
          await fetch(`/api/interviews/${interviewId}/evaluate-final`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript })
          });
        } catch (e) {
          console.error('Final evaluation post error:', e);
        }
        
        setTestState('ENDED');
      }

    } catch (e: any) {
      setTestState('ERROR');
      addLog('Error', `Round completion failed: ${e.message}`);
    }
  };

  /**
   * Polls the Agora volume-indicator to detect when a specific agent UID has stopped speaking.
   * Resolves when the agent's audio level stays below threshold for 3 consecutive checks,
   * or after maxWaitMs elapses (whichever comes first).
   */
  const waitForAgentSilence = (agentUid: number, maxWaitMs: number): Promise<void> => {
    return new Promise((resolve) => {
      let silentChecks = 0;
      const requiredSilentChecks = 3;
      const pollInterval = 500;
      let elapsed = 0;

      const timer = setInterval(() => {
        elapsed += pollInterval;
        
        // Check if the agent's remote audio track has low volume
        const track = remoteAudioTracksRef.current.get(agentUid);
        if (!track) {
          // Agent track already gone — treat as silent
          clearInterval(timer);
          resolve();
          return;
        }

        // Use the volume indicator state — if floorOwner is not this agent, they're silent
        const agentFloorMap: Record<number, string> = { 9991: 'PRIMARY_AI', 9992: 'CHALLENGER_AI', 9993: 'HR_AI', 9999: 'PRIMARY_AI' };
        const agentFloor = agentFloorMap[agentUid];
        
        if (floorOwner !== agentFloor) {
          silentChecks++;
        } else {
          silentChecks = 0; // Reset — agent is still speaking
        }

        if (silentChecks >= requiredSilentChecks || elapsed >= maxWaitMs) {
          clearInterval(timer);
          resolve();
        }
      }, pollInterval);
    });
  };

  const primaryAgent = activePanelAgents.find(a => a.isPrimary) || activePanelAgents[0];
  const challengerAgent = activePanelAgents.find(a => !a.isPrimary);

  return (
    <div className="flex-1 p-6 flex flex-col md:flex-row gap-6 relative">
      <ProctorEngine 
        interviewId={interviewId} 
        isRunning={testState === 'RUNNING'} 
        candidateName={candidateName}
      />
      
      {/* Left Column: Multi-Agent Video/Controls */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="bg-gray-900 rounded-2xl flex-1 min-h-[460px] flex flex-col justify-between relative overflow-hidden shadow-2xl border border-gray-800 p-6">
          
          {/* Top Panel Bar: Round Info & Active Panel Members */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-800/80 pb-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span>Round {currentRound + 1}: {blueprint.interview_rounds[currentRound]?.round_name}</span>
              </div>

              {testState === 'RUNNING' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-800/90 text-gray-300 font-mono text-xs border border-gray-700 shadow-xs">
                  <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                  <span className="font-bold text-white">
                    {Math.floor(roundElapsedSeconds / 60)}:{String(roundElapsedSeconds % 60).padStart(2, '0')}
                  </span>
                  <span className="text-gray-500">/</span>
                  <span className="text-gray-400">
                    {Math.floor(ROUND_TARGET_SECONDS / 60)}:00
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium hidden sm:inline">Panel:</span>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-mono">
                {currentRound === 0 ? '2 Technical Agents' : '1 HR Agent'}
              </span>
            </div>
          </div>

          {/* Developer / Sandbox Testing Fast-Forward Toolbar */}
          {(interviewId.includes('demo') || (typeof window !== 'undefined' && window.location.pathname.includes('demo'))) && (
            <div className="mt-3 mb-2 p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 flex flex-wrap items-center justify-between gap-3 text-xs font-mono animate-in fade-in">
              <div className="flex items-center gap-2 text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                <span className="font-bold">DEV TEST CONTROLS // ISOLATED SANDBOX</span>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {testState === 'RUNNING' && (
                  <>
                    <button
                      onClick={() => {
                        setRoundElapsedSeconds(ROUND_TARGET_SECONDS - 10);
                        setWrapUpWarning(true);
                        addLog('DevControl', '⏱️ Fast-forwarded timer to 4:50 wrap-up alert mark');
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition cursor-pointer"
                    >
                      ⏱️ Jump to 4:50 (Wrap-Up Notice)
                    </button>

                    <button
                      onClick={() => {
                        addLog('DevControl', '⏭️ Triggered immediate round conclusion & handoff');
                        finishRound('DEV_FAST_FORWARD');
                      }}
                      className="px-2.5 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 transition cursor-pointer"
                    >
                      ⏭️ Advance Round Handoff
                    </button>
                  </>
                )}

                <Link
                  href="/admin/applications/demo-app-test"
                  target="_blank"
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white border border-white/20 transition flex items-center gap-1"
                >
                  <span>📊 Admin Scorecard</span>
                  <span className="text-[10px]">↗</span>
                </Link>
              </div>
            </div>
          )}

          {/* Center: Multi-Agent Visualizer & Interviewer Cards */}
          <div className="my-auto py-4">
            {/* Wrap-up alert banner at 4:50 mark */}
            {wrapUpWarning && (
              <div className="mb-4 max-w-xl mx-auto bg-amber-500/20 border border-amber-500/50 rounded-2xl p-3 text-center text-amber-200 text-xs font-mono flex items-center justify-center gap-2 animate-bounce shadow-lg shadow-amber-500/10">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>⏱️ <strong>Target Round Time Reached (4:50)</strong> — Wrapping up this section smoothly...</span>
              </div>
            )}

            {testState === 'RUNNING' && activePanelAgents.length >= 2 ? (
              // 2-Agent Technical Panel (Primary + Challenger)
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {/* Primary Interviewer Card */}
                <div className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col items-center text-center ${
                  floorOwner === 'PRIMARY_AI' 
                    ? 'bg-blue-950/40 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] scale-102' 
                    : 'bg-gray-850/60 border-gray-800 opacity-90'
                }`}>
                  <div className="relative mb-2 flex items-center justify-center">
                    <ParticleTalkingOrb 
                      isSpeaking={floorOwner === 'PRIMARY_AI'}
                      isListening={floorOwner === 'CANDIDATE'}
                      size={150}
                      accentColor={primaryAgent?.color || '#3B82F6'}
                    />
                  </div>
                  <h3 className="text-lg font-bold text-white">{primaryAgent?.name}</h3>
                  <p className="text-xs text-gray-400 mb-3">{primaryAgent?.role}</p>
                  
                  <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                    <span className="text-3xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold uppercase">
                      Primary Driver
                    </span>
                    <span className={`text-3xs px-2 py-0.5 rounded-full font-bold uppercase transition-all ${
                      floorOwner === 'PRIMARY_AI' 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 ring-1 ring-emerald-500/40' 
                        : 'bg-gray-800 text-gray-400'
                    }`}>
                      {floorOwner === 'PRIMARY_AI' ? '🎙️ Speaking (Lead)' : '👂 Listening'}
                    </span>
                  </div>
                </div>

                {/* Challenger Interviewer Card */}
                <div className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col items-center text-center ${
                  floorOwner === 'CHALLENGER_AI' 
                    ? 'bg-purple-950/40 border-purple-500 shadow-[0_0_30px_rgba(139,92,246,0.3)] scale-102' 
                    : challengerAgent?.intervening
                      ? 'bg-amber-950/30 border-amber-500/60'
                      : 'bg-gray-850/60 border-gray-800 opacity-90'
                }`}>
                  <div className="relative mb-2 flex items-center justify-center">
                    <ParticleTalkingOrb 
                      isSpeaking={floorOwner === 'CHALLENGER_AI'}
                      isListening={floorOwner === 'CANDIDATE'}
                      isThinking={challengerAgent?.intervening}
                      size={150}
                      accentColor={challengerAgent?.color || '#8B5CF6'}
                    />
                  </div>
                  <h3 className="text-lg font-bold text-white">{challengerAgent?.name}</h3>
                  <p className="text-xs text-gray-400 mb-3">{challengerAgent?.role}</p>

                  <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                    <span className="text-3xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold uppercase">
                      Specialist Lead
                    </span>
                    <span className={`text-3xs px-2 py-0.5 rounded-full font-bold uppercase transition-all ${
                      floorOwner === 'CHALLENGER_AI'
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 ring-1 ring-purple-500/40'
                        : challengerAgent?.intervening
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                          : 'bg-gray-800 text-gray-400'
                    }`}>
                      {floorOwner === 'CHALLENGER_AI' 
                        ? '⚡ Probing Scale' 
                        : challengerAgent?.intervening 
                          ? '✋ Intervening' 
                          : '👂 Listening'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              // Single Interviewer Display (HR Round or Pre-start)
              <div className="flex flex-col items-center justify-center text-center">
                <div className="relative mb-2 flex items-center justify-center">
                  <ParticleTalkingOrb 
                    isSpeaking={testState === 'RUNNING' && (floorOwner === 'HR_AI' || floorOwner === 'PRIMARY_AI')}
                    isListening={floorOwner === 'CANDIDATE'}
                    isThinking={testState === 'STARTING' || testState === 'ROUND_TRANSITION'}
                    size={200}
                  />
                </div>
                
                <h2 className="text-xl font-bold text-white mt-2">
                  {blueprint.interview_rounds[currentRound]?.interviewers?.[0]?.name || blueprint.interview_rounds[currentRound]?.interviewer?.name || 'AI Interviewer'}
                </h2>
                <p className="text-gray-400 text-sm">
                  {blueprint.interview_rounds[currentRound]?.interviewers?.[0]?.role || blueprint.interview_rounds[currentRound]?.interviewer?.role || 'Interviewer'}
                </p>
              </div>
            )}

            {/* Challenger Floor Request Alert Banner */}
            {pendingFloorNotice && (
              <div className="mt-4 max-w-lg mx-auto bg-purple-900/40 border border-purple-500/50 rounded-xl p-3 text-xs text-purple-200 flex items-center gap-2.5 animate-in fade-in duration-200">
                <Zap className="w-4 h-4 text-purple-400 shrink-0 animate-bounce" />
                <span className="font-mono">{pendingFloorNotice}</span>
              </div>
            )}
          </div>

          {/* Floor Arbiter Bar */}
          {testState === 'RUNNING' && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-800/80 p-3.5 rounded-xl border border-gray-700/60 backdrop-blur">
              <div className={`px-4 py-1.5 rounded-full font-bold tracking-wider uppercase text-xs flex items-center gap-2 ${
                floorOwner === 'PRIMARY_AI' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
                floorOwner === 'CHALLENGER_AI' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 
                floorOwner === 'HR_AI' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 
                floorOwner === 'CANDIDATE' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                floorOwner === 'CROSSTALK' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 
                'bg-gray-900/60 text-gray-400'
              }`}>
                {floorOwner === 'PRIMARY_AI' ? `🎙️ ${primaryAgent?.name || 'Primary'} Speaking` : 
                 floorOwner === 'CHALLENGER_AI' ? `⚡ ${challengerAgent?.name || 'Challenger'} Intervening` : 
                 floorOwner === 'HR_AI' ? '🎙️ HR Interviewer Speaking' : 
                 floorOwner === 'CANDIDATE' ? '🗣️ You are Speaking' : 
                 floorOwner === 'CROSSTALK' ? '⚠️ Interruption Detected' : 
                 'Listening...'}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex-1 sm:w-48">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 transition-all duration-75" style={{width: `${micVolume}%`}}></div>
                  </div>
                </div>
                {currentRound === 0 ? (
                  <button 
                    onClick={() => finishRound('MANUAL_ADVANCE')} 
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-bold text-xs transition shadow-md whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                    title="Advance to HR Round (Fast-Forward)"
                  >
                    <span>Next Round (HR)</span>
                    <span className="text-blue-200">→</span>
                  </button>
                ) : (
                  <button 
                    onClick={() => finishRound('MANUAL_END')} 
                    className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-lg font-bold text-xs transition shadow-md whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                    title="End Interview"
                  >
                    <span>End Interview</span>
                    <span className="text-red-200">✗</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Technical Closing Overlay */}
          {testState === 'TECHNICAL_CLOSING' && (
            <div className="absolute inset-0 bg-gray-950/80 z-20 flex flex-col items-center justify-center text-white backdrop-blur-sm rounded-2xl p-6">
              <Mic className="w-10 h-10 text-blue-400 mb-4 animate-pulse" />
              <h3 className="text-xl font-bold">Technical Round Concluding</h3>
              <p className="text-gray-400 mt-2 text-center max-w-sm text-xs leading-relaxed">
                The primary interviewer is wrapping up. Please wait...
              </p>
            </div>
          )}

          {/* HR Closing Overlay */}
          {testState === 'HR_CLOSING' && (
            <div className="absolute inset-0 bg-gray-950/80 z-20 flex flex-col items-center justify-center text-white backdrop-blur-sm rounded-2xl p-6">
              <Mic className="w-10 h-10 text-orange-400 mb-4 animate-pulse" />
              <h3 className="text-xl font-bold">HR Round Concluding</h3>
              <p className="text-gray-400 mt-2 text-center max-w-sm text-xs leading-relaxed">
                The HR interviewer is wrapping up. Please wait...
              </p>
            </div>
          )}

          {/* Evaluating / Decision Gate Overlay */}
          {(testState === 'EVALUATING' || testState === 'DECISION_GATE') && (
            <div className="absolute inset-0 bg-gray-950/90 z-20 flex flex-col items-center justify-center text-white backdrop-blur-md rounded-2xl p-6">
              <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <h3 className="text-xl font-bold">
                {testState === 'DECISION_GATE' ? 'Decision Gate' : 'Evaluating Round Performance'}
              </h3>
              <p className="text-gray-400 mt-2 text-center max-w-sm text-xs leading-relaxed">
                {testState === 'DECISION_GATE' 
                  ? 'Determining whether the candidate proceeds to the next round...'
                  : 'Synthesizing evidence from the interview panel...'}
              </p>
            </div>
          )}

          {/* Round Transition Overlay */}
          {testState === 'ROUND_TRANSITION' && (
            <div className="absolute inset-0 bg-gray-950/90 z-20 flex flex-col items-center justify-center text-white backdrop-blur-md rounded-2xl p-6">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 border border-emerald-500/40">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-emerald-400">Technical Round Passed!</h3>
              <p className="text-gray-400 mt-2 text-center max-w-sm text-xs leading-relaxed">
                Transitioning to the HR & Culture round. Your HR interviewer will join shortly...
              </p>
              <svg className="animate-spin h-5 w-5 text-gray-500 mt-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
          )}

          {/* Interview Complete Overlay (generating scorecard) */}
          {testState === 'INTERVIEW_COMPLETE' && (
            <div className="absolute inset-0 bg-gray-950/90 z-20 flex flex-col items-center justify-center text-white backdrop-blur-md rounded-2xl p-6">
              <svg className="animate-spin h-10 w-10 text-emerald-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <h3 className="text-xl font-bold">Generating Final Scorecard</h3>
              <p className="text-gray-400 mt-2 text-center max-w-sm text-xs leading-relaxed">
                Synthesizing evidence across all rounds to produce your final evaluation...
              </p>
            </div>
          )}

          {/* Ended State Overlay */}
          {testState === 'ENDED' && (
            <div className="absolute inset-0 bg-gray-950/95 z-30 flex flex-col items-center justify-center text-white backdrop-blur-md rounded-2xl p-6 text-center animate-in fade-in">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 border border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                <UserCheck className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2">Interview Completed!</h3>
              <p className="text-gray-300 max-w-sm text-sm mb-5">
                Session telemetry and responses captured. Redirecting to your session completion report...
              </p>
              <button 
                onClick={() => router.push(`/interview/${interviewId}/completed`)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                View Session Summary →
              </button>
            </div>
          )}
        </div>

        {/* Pre-start Round Banner (only for initial IDLE state) */}
        {testState === 'IDLE' && (
          <div className="bg-[#0a0a0d] p-6 sm:p-8 rounded-3xl border border-white/[0.08] text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 font-mono font-bold text-xs mb-3 border border-cyan-500/20">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Ready for Round {currentRound + 1} of {blueprint.interview_rounds.length}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">{blueprint.interview_rounds[currentRound]?.round_name}</h3>
            <p className="text-white/60 text-xs sm:text-sm mb-6 max-w-lg mx-auto leading-relaxed">{blueprint.interview_rounds[currentRound]?.purpose}</p>
            <button 
              onClick={() => startTest()} 
              className="px-8 py-3.5 bg-white text-black font-sans font-bold text-xs rounded-full shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:bg-neutral-200 transition-all transform hover:scale-102 cursor-pointer"
            >
              Start Interview Session →
            </button>
          </div>
        )}
      </div>

      {/* Right Column: Live Transcript & System Logs */}
      <div className="w-full md:w-1/3 flex flex-col gap-6">
        <div className="bg-[#0a0a0d] rounded-3xl shadow-[0_0_30px_rgba(0,0,0,0.3)] border border-white/[0.08] flex-1 flex flex-col overflow-hidden max-h-[58vh]">
          <div className="p-4 bg-[#030304]/80 border-b border-white/[0.06] flex justify-between items-center">
            <h3 className="font-bold text-white text-xs uppercase font-mono tracking-wider">Live Panel Transcript</h3>
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${testState === 'RUNNING' ? 'bg-cyan-400' : 'hidden'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${testState === 'RUNNING' ? 'bg-cyan-500' : 'bg-white/20'}`}></span>
            </span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
            {transcript.map((msg, idx) => (
              <div 
                key={idx} 
                className={`p-3 rounded-2xl text-xs leading-relaxed ${
                  msg.speaker === candidateName 
                    ? 'bg-cyan-950/20 ml-4 border border-cyan-500/20 text-cyan-100' 
                    : 'bg-[#030304] mr-4 border border-white/[0.08] text-white/80'
                }`}
              >
                <div className="text-[10px] font-mono font-bold text-white/40 mb-1 uppercase tracking-wider">{msg.speaker}</div>
                <div>{msg.text}</div>
              </div>
            ))}
            {transcript.length === 0 && (
              <div className="text-white/30 text-xs italic text-center mt-12 font-mono">
                Panel transcript will stream live as audio plays...
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#0a0a0d] rounded-3xl shadow-[0_0_30px_rgba(0,0,0,0.3)] border border-white/[0.08] flex-1 flex flex-col overflow-hidden max-h-[32vh]">
          <div className="p-3 bg-[#030304]/80 border-b border-white/[0.06]">
            <h3 className="font-bold text-white/60 text-[11px] font-mono uppercase tracking-wider">Turn Arbiter & System Telemetry</h3>
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-1.5 font-mono text-[10px] custom-scrollbar">
            {logs.map((log, i) => (
              <div key={i} className="text-white/70 border-b border-white/[0.04] pb-1">
                <span className="text-white/30 mr-2">[{log.time}]</span>
                <span className="text-cyan-400 font-bold mr-1.5">{log.comp}:</span>
                <span className="text-emerald-400/90">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

