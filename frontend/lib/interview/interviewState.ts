import { InterviewState, FloorRequest, ActivePanelAgent, InterviewerProfile, CompetencyEvidence } from '@/lib/db';

/**
 * Technical trigger keywords that prompt the Technical Lead / Challenger to intervene.
 * Deterministic matching without expensive per-turn LLM calls.
 */
const SCALABILITY_TRIGGERS = [
  { pattern: /\b(\d+\s*(?:million|billion|m|k))\s*(?:req|request|query|event|user|tps|qps)/i, reason: 'candidate_claimed_high_scale', probeType: 'traffic_spike' },
  { pattern: /\b(distributed|sharding|partition|replica|replication|cluster)\b/i, reason: 'candidate_mentioned_distributed_storage', probeType: 'partition_tolerance' },
  { pattern: /\b(kafka|pubsub|event-driven|message\s*queue|rabbitmq)\b/i, reason: 'candidate_mentioned_event_streaming', probeType: 'backpressure_and_ordering' },
  { pattern: /\b(microservice|micro-service|service\s*mesh)\b/i, reason: 'candidate_mentioned_microservices', probeType: 'service_failure_and_latency' },
  { pattern: /\b(cache|redis|memcached|invalidation)\b/i, reason: 'candidate_mentioned_caching', probeType: 'cache_stampede_and_invalidation' },
  { pattern: /\b(concurrency|multithread|asyncio|race\s*condition|deadlock|mutex|lock)\b/i, reason: 'candidate_mentioned_concurrency', probeType: 'race_condition_prevention' },
  { pattern: /\b(rag|vector|embedding|cosine|faiss|chroma|pinecone)\b/i, reason: 'candidate_mentioned_rag_pipeline', probeType: 'vector_index_latency_and_drift' },
  { pattern: /\b(vllm|tensorrt|gpu|quantization|awq|fp8|speculative)\b/i, reason: 'candidate_mentioned_gpu_serving', probeType: 'gpu_memory_and_kv_cache' },
  { pattern: /\b(webrtc|turn|stun|sdp|ice|audio\s*track|real-time\s*voice)\b/i, reason: 'candidate_mentioned_webrtc_audio', probeType: 'packet_loss_and_jitter' },
  { pattern: /\b(kubernetes|k8s|helm|autoscaling|hpa|ingress)\b/i, reason: 'candidate_mentioned_kubernetes', probeType: 'graceful_pod_termination' },
  { pattern: /\b(raft|paxos|consensus|quorum|leader\s*election|split-brain)\b/i, reason: 'candidate_mentioned_consensus', probeType: 'split_brain_and_network_partitions' }
];

/**
 * Classifies the technical quality and structure of a candidate utterance heuristically.
 */
export function classifyCandidateAnswer(utterance: string): {
  classification: 'STRONG' | 'PARTIAL' | 'VAGUE' | 'INCORRECT' | 'IRRELEVANT' | 'GIBBERISH' | 'SILENCE';
  qualityScore: number;
  isGibberish: boolean;
  verbatimQuote?: string;
} {
  const clean = utterance.trim();
  if (!clean || clean.length < 5) {
    return { classification: 'SILENCE', qualityScore: 0, isGibberish: false };
  }

  // Check for gibberish patterns: keyboard mashing, repeated characters, very high entropy of nonsense tokens
  const words = clean.split(/\s+/).filter(Boolean);
  const repeatedWords = words.filter((w, i) => words.indexOf(w) !== i && w.length > 3);
  const repetitionRatio = words.length > 0 ? repeatedWords.length / words.length : 0;
  const avgWordLength = words.reduce((acc, w) => acc + w.length, 0) / (words.length || 1);

  // Common technical terms check
  const techTermMatches = clean.match(/\b(api|async|await|buffer|cache|channel|cluster|concurrency|database|deadlock|distributed|event|goroutine|grpc|http|index|kafka|latency|lock|log|memory|message|microservice|mutex|network|node|optimize|packet|partition|pipeline|postgres|process|proto|pubsub|query|queue|raft|redis|replica|request|scale|server|service|socket|stream|sync|tcp|thread|throughput|timeout|transaction|vector|webrtc|websocket)\b/gi) || [];

  if (words.length < 4 && techTermMatches.length === 0) {
    if (/\b(yes|no|maybe|idk|sure|ok|okay|fine|stuff|thing|things)\b/i.test(clean)) {
      return { classification: 'VAGUE', qualityScore: 20, isGibberish: false };
    }
  }

  if (repetitionRatio > 0.6 || avgWordLength > 18 || (words.length > 5 && techTermMatches.length === 0 && !/[a-zA-Z]{3,}/.test(clean))) {
    return { classification: 'GIBBERISH', qualityScore: 5, isGibberish: true };
  }

  // Strong answer: long enough, contains concrete technical keywords and structured explanations
  if (clean.length >= 60 && techTermMatches.length >= 2) {
    const verbatimQuote = clean.slice(0, 160) + (clean.length > 160 ? '...' : '');
    return { classification: 'STRONG', qualityScore: 85, isGibberish: false, verbatimQuote };
  }

  if (clean.length >= 30 && techTermMatches.length >= 1) {
    const verbatimQuote = clean.slice(0, 120) + (clean.length > 120 ? '...' : '');
    return { classification: 'PARTIAL', qualityScore: 65, isGibberish: false, verbatimQuote };
  }

  return { classification: 'VAGUE', qualityScore: 35, isGibberish: false };
}

/**
 * Initializes a shared interview state for a 2-agent technical panel.
 */
export function createInitialInterviewState(
  interviewId: string,
  primaryAgent: InterviewerProfile,
  challengerAgent: InterviewerProfile
): InterviewState {
  const activeAgents: ActivePanelAgent[] = [
    {
      agentId: primaryAgent.interviewerId,
      name: primaryAgent.name,
      role: primaryAgent.role,
      voice: primaryAgent.voice,
      color: primaryAgent.color,
      isPrimary: true,
      isActive: true,
      hasFloor: true
    },
    {
      agentId: challengerAgent.interviewerId,
      name: challengerAgent.name,
      role: challengerAgent.role,
      voice: challengerAgent.voice,
      color: challengerAgent.color,
      isPrimary: false,
      isActive: true,
      hasFloor: false
    }
  ];

  return {
    interviewId,
    currentRound: 'technical',
    currentSpeaker: primaryAgent.interviewerId,
    conversationSummary: 'Technical panel interview initialized.',
    questionsAsked: [],
    topicsCovered: [],
    evidenceCollected: [],
    structuredEvidence: [],
    agentFloorRequests: [],
    roundProgress: 0,
    interviewStatus: 'IN_PROGRESS',
    activeAgents,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Records a candidate utterance into the shared state.
 * Evaluates answer quality and determines whether the Specialist should request the floor.
 */
export function recordCandidateUtterance(
  state: InterviewState,
  utterance: string
): { updatedState: InterviewState; newFloorRequest?: FloorRequest; qualityReport?: any } {
  const clean = utterance.trim();
  if (!clean) return { updatedState: state };

  const updated = { ...state };
  updated.candidateAnswer = clean;
  updated.updatedAt = new Date().toISOString();

  // Classify answer quality
  const quality = classifyCandidateAnswer(clean);

  // Record structured competency evidence
  const evidenceRecord: CompetencyEvidence = {
    id: `ev_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    round: updated.currentRound,
    speaker: 'Candidate',
    questionAsked: updated.lastQuestion || 'Introductory / Technical Question',
    candidateUtterance: clean,
    classification: quality.classification,
    verbatimQuote: quality.verbatimQuote,
    qualityScore: quality.qualityScore,
    topic: updated.currentTopic
  };

  if (!updated.structuredEvidence) updated.structuredEvidence = [];
  updated.structuredEvidence.push(evidenceRecord);

  // Extract quick evidence snippet
  if (quality.verbatimQuote && !updated.evidenceCollected.includes(quality.verbatimQuote)) {
    updated.evidenceCollected = [...updated.evidenceCollected, quality.verbatimQuote];
  }

  // Check if candidate explicitly addressed an agent by name
  let targetAgent: ActivePanelAgent | undefined;
  for (const agent of updated.activeAgents) {
    if (agent.isActive && clean.toLowerCase().includes(agent.name.toLowerCase())) {
      targetAgent = agent;
      break;
    }
  }

  if (targetAgent && !targetAgent.hasFloor) {
    const floorReq: FloorRequest = {
      id: `flr_${Math.random().toString(36).substring(2, 7)}`,
      agentId: targetAgent.agentId,
      agentName: targetAgent.name,
      reason: `candidate_explicitly_addressed_${targetAgent.name.toLowerCase()}`,
      urgency: 'high',
      proposedProbe: `Candidate addressed ${targetAgent.name} directly.`,
      timestamp: Date.now()
    };
    updated.agentFloorRequests = [...updated.agentFloorRequests, floorReq];
    return { updatedState: updated, newFloorRequest: floorReq, qualityReport: quality };
  }

  // During technical round, evaluate if the Challenger agent should intervene
  if (updated.currentRound === 'technical') {
    const challenger = updated.activeAgents.find(a => !a.isPrimary && a.isActive);

    if (challenger && !challenger.hasFloor) {
      // Check for scalability and architecture triggers
      for (const trigger of SCALABILITY_TRIGGERS) {
        const match = clean.match(trigger.pattern);
        if (match) {
          const alreadyRequested = updated.agentFloorRequests.some(r => r.reason === trigger.reason);
          if (!alreadyRequested) {
            const floorReq: FloorRequest = {
              id: `flr_${Math.random().toString(36).substring(2, 7)}`,
              agentId: challenger.agentId,
              agentName: challenger.name,
              reason: trigger.reason,
              urgency: 'high',
              proposedProbe: `Candidate claimed "${match[0]}". Probe ${trigger.probeType.replace(/_/g, ' ')}.`,
              timestamp: Date.now()
            };
            updated.agentFloorRequests = [...updated.agentFloorRequests, floorReq];
            return { updatedState: updated, newFloorRequest: floorReq, qualityReport: quality };
          }
        }
      }
    }
  }

  return { updatedState: updated, qualityReport: quality };
}

/**
 * Deterministic Turn Arbiter floor control decision.
 * Determines who speaks next without expensive per-turn LLM calls.
 */
export function arbitrateNextTurn(state: InterviewState): {
  nextSpeakerId: string;
  nextSpeakerName: string;
  action: 'continue' | 'intervene' | 'handoff';
  grantedRequest?: FloorRequest;
  updatedState: InterviewState;
} {
  const updated = { ...state };
  const primary = updated.activeAgents.find(a => a.isPrimary && a.isActive);

  // If there are floor requests from the challenger, grant floor to challenger
  if (updated.agentFloorRequests.length > 0) {
    const granted = updated.agentFloorRequests[0];
    updated.agentFloorRequests = updated.agentFloorRequests.slice(1);

    // Update floor ownership
    updated.currentSpeaker = granted.agentId;
    updated.activeAgents = updated.activeAgents.map(a => ({
      ...a,
      hasFloor: a.agentId === granted.agentId
    }));
    updated.updatedAt = new Date().toISOString();

    return {
      nextSpeakerId: granted.agentId,
      nextSpeakerName: granted.agentName,
      action: 'intervene',
      grantedRequest: granted,
      updatedState: updated
    };
  }

  // Otherwise, default back to Primary Interviewer to drive the blueprint
  const defaultAgent = primary || updated.activeAgents.find(a => a.isActive) || { agentId: 'system', name: 'Interviewer' };
  
  updated.currentSpeaker = defaultAgent.agentId;
  updated.activeAgents = updated.activeAgents.map(a => ({
    ...a,
    hasFloor: a.agentId === defaultAgent.agentId
  }));
  updated.updatedAt = new Date().toISOString();

  return {
    nextSpeakerId: defaultAgent.agentId,
    nextSpeakerName: defaultAgent.name,
    action: 'continue',
    updatedState: updated
  };
}

/**
 * Records an agent question / turn into the shared state.
 */
export function recordAgentTurn(
  state: InterviewState,
  agentId: string,
  question: string,
  topic?: string
): InterviewState {
  const clean = question.trim();
  const updated = { ...state };

  updated.lastQuestion = clean;
  updated.currentSpeaker = agentId;
  updated.questionsAsked = [...updated.questionsAsked, clean];

  if (topic && !updated.topicsCovered.includes(topic)) {
    updated.topicsCovered = [...updated.topicsCovered, topic];
  }

  // Calculate rough round progress
  const targetQuestions = updated.currentRound === 'technical' ? 8 : 4;
  updated.roundProgress = Math.min(100, Math.round((updated.questionsAsked.length / targetQuestions) * 100));
  updated.updatedAt = new Date().toISOString();

  return updated;
}

/**
 * Transitions state to HR Round cleanly.
 * DEACTIVATES technical agents, ACTIVATES single HR agent.
 * Prepares HR agent with technical summary and evidence.
 */
export function transitionToHRRound(
  state: InterviewState,
  hrAgent: InterviewerProfile,
  technicalScore: number,
  technicalDecisionReason: string
): InterviewState {
  const updated = { ...state };

  updated.currentRound = 'hr';
  updated.interviewStatus = 'IN_PROGRESS';
  updated.roundProgress = 0;
  updated.agentFloorRequests = [];
  updated.currentSpeaker = hrAgent.interviewerId;

  // Deactivate all technical agents, activate HR agent
  updated.activeAgents = [
    {
      agentId: hrAgent.interviewerId,
      name: hrAgent.name,
      role: hrAgent.role,
      voice: hrAgent.voice,
      color: hrAgent.color,
      isPrimary: true,
      isActive: true,
      hasFloor: true
    }
  ];

  // Store technical summary for HR reference
  const techEvidenceSummary = `Technical Round Passed (Score: ${technicalScore}/100). Highlights: ${updated.evidenceCollected.slice(0, 3).join('; ')}. Panel Notes: ${technicalDecisionReason}`;
  updated.conversationSummary = `${updated.conversationSummary}\n--- TECHNICAL ROUND COMPLETED ---\n${techEvidenceSummary}`;
  updated.updatedAt = new Date().toISOString();

  return updated;
}
