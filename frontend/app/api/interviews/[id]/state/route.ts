import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { selectPanelForJob } from '@/lib/interview/interviewerPool';
import { 
  createInitialInterviewState, 
  recordCandidateUtterance, 
  recordAgentTurn, 
  arbitrateNextTurn,
  transitionToHRRound
} from '@/lib/interview/interviewState';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const interviewId = resolvedParams.id;
    const db = getDb();
    const interview = db.interviews.find(i => i.id === interviewId);

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    if (!interview.interviewState) {
      const app = db.applications.find(a => a.id === interview.applicationId);
      const job = app ? db.jobs.find(j => j.id === app.jobId) : null;
      const panel = selectPanelForJob(job?.title || '');

      interview.interviewState = createInitialInterviewState(
        interview.id,
        panel.technicalPrimary,
        panel.technicalChallenger
      );
      saveDb(db);
    }

    return NextResponse.json({ success: true, interviewState: interview.interviewState });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const interviewId = resolvedParams.id;
    const body = await req.json();
    const { action, utterance, speaker, agentId, question, topic, hrScore, hrReason } = body;

    const db = getDb();
    const interview = db.interviews.find(i => i.id === interviewId);

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    if (!interview.interviewState) {
      const app = db.applications.find(a => a.id === interview.applicationId);
      const job = app ? db.jobs.find(j => j.id === app.jobId) : null;
      const panel = selectPanelForJob(job?.title || '');
      interview.interviewState = createInitialInterviewState(
        interview.id,
        panel.technicalPrimary,
        panel.technicalChallenger
      );
    }

    let result: any = { interviewState: interview.interviewState };

    if (action === 'CANDIDATE_UTTERANCE') {
      const { updatedState, newFloorRequest, qualityReport } = recordCandidateUtterance(interview.interviewState, utterance || '');
      interview.interviewState = updatedState;
      result = { interviewState: updatedState, newFloorRequest, qualityReport };
    } else if (action === 'ARBITRATE_TURN') {
      const arbiterResult = arbitrateNextTurn(interview.interviewState);
      interview.interviewState = arbiterResult.updatedState;
      result = arbiterResult;
    } else if (action === 'AGENT_QUESTION') {
      interview.interviewState = recordAgentTurn(interview.interviewState, agentId || speaker, question || '', topic);
      result = { interviewState: interview.interviewState };
    } else if (action === 'TRANSITION_HR') {
      const app = db.applications.find(a => a.id === interview.applicationId);
      const job = app ? db.jobs.find(j => j.id === app.jobId) : null;
      const panel = selectPanelForJob(job?.title || '');
      interview.interviewState = transitionToHRRound(
        interview.interviewState,
        panel.hrInterviewer,
        hrScore || 85,
        hrReason || 'Demonstrated solid technical problem solving in Round 1.'
      );
      result = { interviewState: interview.interviewState };
    }

    saveDb(db);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
