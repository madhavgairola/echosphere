import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb, saveDb } from '@/lib/db';

/**
 * Heuristically analyzes candidate responses from the transcript.
 */
function analyzeCandidateTranscript(transcript: any[]) {
  const candidateUtterances = transcript.filter((t: any) => {
    const sp = (t.speaker || '').toLowerCase();
    return !sp.includes('priya') && !sp.includes('arjun') && !sp.includes('sarah') && !sp.includes('interviewer') && !sp.includes('ai');
  });

  const totalCandidateWords = candidateUtterances.reduce((acc, t) => acc + (t.text || '').split(/\s+/).filter(Boolean).length, 0);
  
  // Count responses with substantive length and technical keywords
  const techPattern = /\b(api|async|await|batch|buffer|cache|channel|cluster|concurrency|database|deadlock|distributed|event|goroutine|grpc|http|index|kafka|latency|lock|log|memory|message|microservice|mutex|network|node|optimize|packet|partition|pipeline|postgres|process|proto|pubsub|query|queue|raft|redis|replica|request|scale|server|service|socket|stream|sync|tcp|thread|throughput|timeout|transaction|vector|webrtc|websocket)\b/gi;
  
  let substantiveCount = 0;
  let gibberishCount = 0;

  for (const u of candidateUtterances) {
    const txt = (u.text || '').trim();
    const words = txt.split(/\s+/).filter(Boolean);
    const techMatches = txt.match(techPattern) || [];

    if (words.length >= 8 && techMatches.length >= 1) {
      substantiveCount++;
    } else if (words.length > 3 && techMatches.length === 0 && !/[a-zA-Z]{4,}/.test(txt)) {
      gibberishCount++;
    }
  }

  return {
    candidateUtteranceCount: candidateUtterances.length,
    totalCandidateWords,
    substantiveCount,
    gibberishCount,
    hasSubstantialEvidence: substantiveCount >= 2 || (totalCandidateWords >= 40 && substantiveCount >= 1)
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const interviewId = resolvedParams.id;
    const { roundName, transcript, rubric } = await req.json();

    const db = getDb();
    const interview = db.interviews.find(i => i.id === interviewId);
    
    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    const cleanTranscript = Array.isArray(transcript) ? transcript : [];
    const stats = analyzeCandidateTranscript(cleanTranscript);

    let evaluation: { decision: 'PASS' | 'FAIL'; score: number; reason: string; keyEvidence?: string[] };

    // Strict Hard-Cap: If candidate provided zero or mostly gibberish/empty responses
    if (stats.candidateUtteranceCount === 0 || (!stats.hasSubstantialEvidence && stats.totalCandidateWords < 20)) {
      evaluation = {
        decision: 'FAIL',
        score: Math.min(30, Math.max(10, stats.totalCandidateWords * 2)),
        reason: 'Candidate provided insufficient demonstrable technical evidence or non-substantive responses during the round.',
        keyEvidence: []
      };
    } else {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const systemInstruction = `You are an expert AI Interview Evaluator and Senior Technical Hiring Partner at Nexora Labs.
Your job is to read a raw interview transcript for a specific round and evaluate candidate performance against the rubric with uncompromising technical rigor.

EVALUATION RULES:
1. Grounded Evidence Only: You MUST evaluate ONLY what the candidate actually said in the transcript.
2. Anti-Hallucination: If the candidate gave gibberish, vague non-answers, repeated the question without answering, or spoke minimally, you MUST return decision "FAIL" and a score under 40.
3. Pass Criteria: Return decision "PASS" ONLY if the candidate achieved a score >= 60 AND provided clear, technically sound explanations.
4. If this is an HR/Behavioral round, evaluate communication clarity, incident ownership, and team alignment.

Return ONLY valid JSON in this exact structure:
{
  "decision": "PASS" | "FAIL",
  "score": <number 0-100>,
  "reason": "<A concise 2-sentence explanation of why they passed or failed based on concrete transcript evidence>",
  "keyEvidence": ["<Verbatim candidate quote or specific technical trade-off cited>"]
}`;

        const userPrompt = `
Round: ${roundName}
Rubric Context:
${JSON.stringify(rubric, null, 2)}

Transcript:
${cleanTranscript.map((t: any) => `[${t.speaker || 'Speaker'}]: ${t.text || ''}`).join('\n')}

Evaluate this round and return the JSON decision.`;

        const model = genAI.getGenerativeModel({
          model: "gemini-3.6-flash",
          systemInstruction,
          generationConfig: { responseMimeType: "application/json" },
        });

        const result = await model.generateContent(userPrompt);
        const parsed = JSON.parse(result.response.text());
        
        let score = typeof parsed.score === 'number' ? parsed.score : 50;
        let decision = parsed.decision === 'PASS' ? 'PASS' : 'FAIL';

        // Enforce Guardrail: If candidate had low substantive answers, cap score
        if (!stats.hasSubstantialEvidence && score > 45) {
          score = 38;
          decision = 'FAIL';
        }

        evaluation = {
          decision: score >= 60 ? 'PASS' : 'FAIL',
          score,
          reason: parsed.reason || (score >= 60 ? 'Demonstrated solid technical understanding.' : 'Did not provide sufficient technical depth.'),
          keyEvidence: Array.isArray(parsed.keyEvidence) ? parsed.keyEvidence : []
        };
      } catch (llmErr) {
        console.warn('[evaluate-round] LLM evaluation fallback:', llmErr);
        // Deterministic heuristic fallback
        if (stats.hasSubstantialEvidence) {
          evaluation = {
            decision: 'PASS',
            score: Math.min(88, 65 + stats.substantiveCount * 6),
            reason: `Candidate articulated technical concepts with concrete reasoning across ${stats.substantiveCount} technical topics.`,
            keyEvidence: cleanTranscript.filter((t: any) => (t.text || '').length > 40).slice(0, 2).map((t: any) => `[${t.speaker}]: ${t.text.slice(0, 100)}...`)
          };
        } else {
          evaluation = {
            decision: 'FAIL',
            score: 35,
            reason: 'Candidate answers lacked technical specificity and demonstrable depth on core architectural requirements.',
            keyEvidence: []
          };
        }
      }
    }

    // Save to DB
    if (!interview.evaluations) interview.evaluations = [];
    interview.evaluations.push({
      round: roundName,
      decision: evaluation.decision,
      score: evaluation.score,
      reason: evaluation.reason
    });

    // Also persist the partial transcript
    if (!interview.transcript) interview.transcript = [];
    interview.transcript.push(...cleanTranscript);

    if (evaluation.decision === 'FAIL') {
      interview.status = 'FAILED';
    }

    saveDb(db);

    return NextResponse.json({ success: true, evaluation });
  } catch (error: any) {
    console.error('Round Evaluation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
