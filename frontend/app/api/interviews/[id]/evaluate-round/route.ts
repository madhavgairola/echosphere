import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb, saveDb } from '@/lib/db';

/**
 * Heuristically extracts candidate utterances and verifies verbatim technical evidence.
 */
function analyzeCandidateTranscript(transcript: any[]) {
  const candidateUtterances = transcript.filter((t: any) => {
    const sp = (t.speaker || '').toLowerCase();
    return !sp.includes('priya') && !sp.includes('arjun') && !sp.includes('sarah') && !sp.includes('interviewer') && !sp.includes('ai');
  });

  const totalCandidateWords = candidateUtterances.reduce((acc, t) => acc + (t.text || '').split(/\s+/).filter(Boolean).length, 0);
  const techPattern = /\b(api|async|await|batch|buffer|cache|channel|cluster|concurrency|database|deadlock|distributed|event|goroutine|grpc|http|index|kafka|latency|lock|log|memory|message|microservice|mutex|network|node|optimize|packet|partition|pipeline|postgres|process|proto|pubsub|query|queue|raft|redis|replica|request|scale|server|service|socket|stream|sync|tcp|thread|throughput|timeout|transaction|vector|webrtc|websocket)\b/gi;
  
  const verbatimQuotes: string[] = [];
  let substantiveCount = 0;
  let gibberishCount = 0;

  for (const u of candidateUtterances) {
    const txt = (u.text || '').trim();
    const words = txt.split(/\s+/).filter(Boolean);
    const techMatches = txt.match(techPattern) || [];

    if (words.length >= 7 && techMatches.length >= 1) {
      substantiveCount++;
      const quote = txt.slice(0, 140) + (txt.length > 140 ? '...' : '');
      if (!verbatimQuotes.includes(quote)) {
        verbatimQuotes.push(quote);
      }
    } else if (words.length > 3 && techMatches.length === 0 && !/[a-zA-Z]{4,}/.test(txt)) {
      gibberishCount++;
    }
  }

  return {
    candidateUtteranceCount: candidateUtterances.length,
    totalCandidateWords,
    substantiveCount,
    gibberishCount,
    verbatimQuotes,
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

    let evaluation: {
      decision: 'PASS' | 'FAIL';
      score: number;
      reason: string;
      competencyEvaluations?: Array<{
        competency: string;
        score: number;
        evidenceQuality: 'STRONG' | 'PARTIAL' | 'VAGUE' | 'NONE';
        evidence: string[];
        missingEvidence: string[];
      }>;
      keyEvidence?: string[];
      missingEvidence?: string[];
    };

    // Strict Hard-Cap: If candidate provided zero or mostly gibberish/empty responses
    if (stats.candidateUtteranceCount === 0 || (!stats.hasSubstantialEvidence && stats.totalCandidateWords < 20)) {
      evaluation = {
        decision: 'FAIL',
        score: Math.min(30, Math.max(10, stats.totalCandidateWords * 2)),
        reason: 'Candidate provided zero demonstrable technical evidence or unintelligible non-answers during the round.',
        competencyEvaluations: Object.keys(rubric || {}).map(comp => ({
          competency: comp,
          score: 15,
          evidenceQuality: 'NONE',
          evidence: [],
          missingEvidence: [`Candidate did not answer core questions on ${comp}`]
        })),
        keyEvidence: [],
        missingEvidence: ['Candidate failed to provide concrete technical explanations or codecraft details.']
      };
    } else {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const systemInstruction = `You are an expert AI Interview Evaluator and Senior Technical Hiring Partner at Nexora Labs.
Evaluate candidate performance on this specific round by scoring REQUIRED COMPETENCIES FIRST against the rubric, then deriving the overall score.

CRITICAL EVALUATION RULES:
1. EVIDENCE GROUNDING: Evaluate ONLY what the candidate actually stated in the transcript. Never hallucinate or assume evidence.
2. NO EVIDENCE = NO SCORE: If a competency was not answered or candidate gave gibberish/evasion, evidenceQuality is "NONE", evidence is [], and competency score must be <= 30.
3. WEAK/PARTIAL EVIDENCE = CONSTRAINED SCORE: If candidate gave vague high-level answers without implementation details, evidenceQuality is "VAGUE" or "PARTIAL", score 40-65.
4. STRONG EVIDENCE = HIGH SCORE: If candidate gave concrete architectural mechanisms, trade-offs, and numbers, evidenceQuality is "STRONG", cite verbatim quotes in evidence, score 75-100.
5. DECISION GATE:
   - PASS: Overall score >= 60 AND at least 2 competencies have STRONG or PARTIAL evidence.
   - FAIL: Overall score < 60 OR critical competencies have NO evidence.

Return ONLY valid JSON matching this exact structure:
{
  "decision": "PASS" | "FAIL",
  "score": <number 0-100 derived from competency average>,
  "reason": "<A concise 2-sentence explanation citing concrete competency evidence or missing components>",
  "competencyEvaluations": [
    {
      "competency": "<Name of rubric competency>",
      "score": <number 0-100>,
      "evidenceQuality": "STRONG" | "PARTIAL" | "VAGUE" | "NONE",
      "evidence": ["<Verbatim candidate quote>"],
      "missingEvidence": ["<Specific missing trade-off or mechanism>"]
    }
  ],
  "keyEvidence": ["<Verbatim candidate quote>"],
  "missingEvidence": ["<Missing technical depth>"]
}`;

        const userPrompt = `
Round: ${roundName}
Rubric Context:
${JSON.stringify(rubric, null, 2)}

Transcript:
${cleanTranscript.map((t: any) => `[${t.speaker || 'Speaker'}]: ${t.text || ''}`).join('\n')}

Evaluate competencies first, derive the score, and return the JSON decision.`;

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
          score = 35;
          decision = 'FAIL';
        }

        evaluation = {
          decision: score >= 60 ? 'PASS' : 'FAIL',
          score,
          reason: parsed.reason || (score >= 60 ? 'Demonstrated solid technical understanding across required competencies.' : 'Did not provide sufficient demonstrable technical depth.'),
          competencyEvaluations: Array.isArray(parsed.competencyEvaluations) ? parsed.competencyEvaluations : [],
          keyEvidence: Array.isArray(parsed.keyEvidence) ? parsed.keyEvidence : stats.verbatimQuotes.slice(0, 2),
          missingEvidence: Array.isArray(parsed.missingEvidence) ? parsed.missingEvidence : []
        };
      } catch (llmErr) {
        console.warn('[evaluate-round] LLM evaluation fallback:', llmErr);
        // Deterministic heuristic fallback
        if (stats.hasSubstantialEvidence) {
          evaluation = {
            decision: 'PASS',
            score: Math.min(88, 65 + stats.substantiveCount * 6),
            reason: `Candidate articulated technical concepts with concrete reasoning across ${stats.substantiveCount} technical topics.`,
            competencyEvaluations: Object.keys(rubric || {}).map(comp => ({
              competency: comp,
              score: 75,
              evidenceQuality: 'PARTIAL',
              evidence: stats.verbatimQuotes.slice(0, 1),
              missingEvidence: []
            })),
            keyEvidence: stats.verbatimQuotes.slice(0, 2),
            missingEvidence: []
          };
        } else {
          evaluation = {
            decision: 'FAIL',
            score: 35,
            reason: 'Candidate answers lacked technical specificity and demonstrable depth on core architectural requirements.',
            competencyEvaluations: Object.keys(rubric || {}).map(comp => ({
              competency: comp,
              score: 25,
              evidenceQuality: 'NONE',
              evidence: [],
              missingEvidence: [`No demonstrable technical evidence provided for ${comp}`]
            })),
            keyEvidence: [],
            missingEvidence: ['Candidate did not articulate core concurrency or distributed systems trade-offs.']
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

