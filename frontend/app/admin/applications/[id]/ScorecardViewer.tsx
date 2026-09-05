"use client";
import React, { useState } from 'react';

export default function ScorecardViewer({ interviewId, initialScorecard }: { interviewId: string, initialScorecard?: any }) {
  const [scorecard, setScorecard] = useState<any>(initialScorecard);
  const [loading, setLoading] = useState(false);

  const generateScorecard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/evaluate-final`, { method: 'POST' });
      const data = await res.json();
      if (data.scorecard) {
        setScorecard(data.scorecard);
      } else {
        alert(data.error || 'Failed to generate scorecard');
      }
    } catch (e) {
      alert('Error generating scorecard');
    }
    setLoading(false);
  };

  if (!scorecard) {
    return (
      <div className="bg-[#0a0a0d] border border-white/[0.08] rounded-3xl p-8 text-center mt-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
        <div className="max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center justify-center mx-auto mb-4 text-xl">
            ⚖️
          </div>
          <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Final Interview Scorecard</h3>
          <p className="text-xs text-white/50 mb-6 leading-relaxed">
            The interview has concluded. Generate the automated multi-agent synthesis and assessment of the entire transcript.
          </p>
          <button 
            onClick={generateScorecard}
            disabled={loading}
            className="bg-white text-black font-sans font-bold py-3 px-8 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-neutral-200 disabled:opacity-40 transition-all text-xs"
          >
            {loading ? 'Evaluating Transcript...' : 'Generate Comprehensive Scorecard →'}
          </button>
        </div>
      </div>
    );
  }

  const isNoHire = scorecard.overall_recommendation?.toLowerCase().includes('no hire');
  const isStrong = scorecard.overall_recommendation?.toLowerCase().includes('strong');

  return (
    <div className="bg-[#0a0a0d] border border-white/[0.08] rounded-3xl p-6 sm:p-8 mt-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-500"></div>
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-white/[0.06] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-[11px] text-purple-300 bg-purple-500/10 px-3 py-0.5 rounded-full border border-purple-500/20 mb-2">
            <span>✦</span> AI INTERVIEW PANEL EVALUATION REPORT
          </div>
          <h3 className="text-2xl font-bold text-white tracking-tight">Final Candidate Scorecard</h3>
          <p className="text-white/40 text-xs mt-0.5">Objective multi-agent behavioral and technical assessment report</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-1">Advisory Signal</div>
          <div className={`px-4 py-2 rounded-full font-mono font-bold text-xs tracking-wider border ${
            isNoHire ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' :
            isStrong ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
            'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
          }`}>
            {scorecard.overall_recommendation?.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Human-in-the-loop Advisory Banner */}
      <div className="mb-6 p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl flex items-start gap-3">
        <span className="text-indigo-400 text-base mt-0.5">ℹ️</span>
        <div className="text-xs text-indigo-200/90 leading-relaxed">
          <strong className="text-indigo-300 font-semibold">Human Decision Authority: </strong>
          This report compiles transcript-grounded candidate evidence and competency scores to support your evaluation. The AI does not auto-select or auto-reject candidates; the hiring committee retains final hiring authority using the action controls.
        </div>
      </div>

      {/* Executive Summary */}
      <div className="mb-8">
        <h4 className="font-mono text-xs font-bold text-white/50 mb-3 uppercase tracking-widest">Executive Summary</h4>
        <p className="text-white/80 text-xs leading-relaxed bg-[#030304] p-5 rounded-2xl border border-white/[0.08] font-sans">
          {scorecard.overall_summary || scorecard.summary}
        </p>
      </div>

      {/* Strengths & Weaknesses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Strengths */}
        <div className="p-5 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl">
          <h4 className="font-mono text-xs font-bold text-emerald-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            <span>✓</span> Key Strengths & Demonstrated Mastery
          </h4>
          <ul className="space-y-2">
            {scorecard.strengths?.map((s: string, i: number) => (
              <li key={i} className="flex gap-2.5 text-xs text-white/80 leading-relaxed">
                <span className="text-emerald-400 font-bold shrink-0">✦</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Areas of Concern */}
        <div className="p-5 bg-rose-950/20 border border-rose-500/20 rounded-2xl">
          <h4 className="font-mono text-xs font-bold text-rose-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            <span>⚠️</span> Areas of Concern & Development Needs
          </h4>
          <ul className="space-y-2">
            {scorecard.weaknesses?.map((s: string, i: number) => (
              <li key={i} className="flex gap-2.5 text-xs text-white/80 leading-relaxed">
                <span className="text-rose-400 font-bold shrink-0">✦</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Detailed Rubric / Competency Breakdown */}
      <div>
        <h4 className="font-mono text-xs font-bold text-white/50 mb-4 uppercase tracking-widest border-b border-white/[0.06] pb-2">
          Competency & Evidence Rubric Breakdown
        </h4>
        <div className="space-y-4">
          {scorecard.rubric_evaluations?.map((evalItem: any, i: number) => {
            const scoreNum = typeof evalItem.competencyScore === 'number' 
              ? evalItem.competencyScore 
              : (typeof evalItem.score === 'number' ? evalItem.score * 20 : 50);
            const quality = evalItem.evidenceQuality || (scoreNum >= 75 ? 'STRONG' : scoreNum >= 50 ? 'PARTIAL' : 'NONE');
            
            return (
              <div key={i} className="bg-[#030304] rounded-2xl p-5 border border-white/[0.08]">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <h5 className="font-bold text-white text-sm tracking-tight">{evalItem.pillar}</h5>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      quality === 'STRONG' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                      quality === 'PARTIAL' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                      'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}>
                      {quality} EVIDENCE
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-white/80">{scoreNum}/100</span>
                    <div className="w-24 bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          scoreNum >= 75 ? 'bg-emerald-400' : scoreNum >= 55 ? 'bg-amber-400' : 'bg-rose-400'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, scoreNum))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-white/70 mb-3 leading-relaxed">{evalItem.feedback}</p>
                
                {evalItem.evidence && evalItem.evidence.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {evalItem.evidence.map((quote: string, qIdx: number) => (
                      <div key={qIdx} className="bg-white/[0.02] border-l-2 border-indigo-400 p-2.5 rounded-r-xl text-xs text-white/70 italic font-mono">
                        <strong className="text-indigo-300 not-italic">Verbatim Quote:</strong> "{quote}"
                      </div>
                    ))}
                  </div>
                )}

                {evalItem.missingEvidence && evalItem.missingEvidence.length > 0 && (
                  <div className="mt-2 text-[11px] text-rose-300/80 font-mono bg-rose-950/20 p-2 rounded-lg border border-rose-500/20">
                    <strong className="text-rose-300">Missing Evidence: </strong>
                    {Array.isArray(evalItem.missingEvidence) ? evalItem.missingEvidence.join('; ') : evalItem.missingEvidence}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

