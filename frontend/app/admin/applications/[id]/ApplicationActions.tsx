"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ApplicationActions({ applicationId, currentStatus }: { applicationId: string, currentStatus: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const updateStatus = async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        router.refresh(); // Refresh the server component
      } else {
        alert("Failed to update status");
      }
    } catch (err) {
      alert("Error: " + err);
    }
    setLoading(false);
  };

  const isPostInterview = currentStatus === 'UNDER_REVIEW' || currentStatus === 'INTERVIEW_COMPLETED';

  return (
    <div className="bg-[#0a0a0d] p-6 sm:p-8 rounded-3xl border border-white/[0.08] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="font-sans font-bold text-lg text-white">
            {isPostInterview ? 'Hiring Decision & Final Outcome' : 'Screening & Pipeline Actions'}
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            {isPostInterview 
              ? 'Review the AI evidence scorecard above and record the hiring committee decision.' 
              : 'Move candidate across hiring stages or advance to multi-agent interview.'}
          </p>
        </div>
        <div className="font-mono text-xs px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/60">
          CURRENT: <span className="text-white font-bold">{currentStatus}</span>
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-3">
        {isPostInterview ? (
          <>
            <button 
              onClick={() => updateStatus('SELECTED')}
              disabled={loading}
              className="px-5 py-2.5 rounded-full font-mono text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>✓</span> Extend Job Offer (Hire)
            </button>
            
            <button 
              onClick={() => updateStatus('REJECTED')}
              disabled={loading}
              className="px-5 py-2.5 rounded-full font-mono text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>✕</span> Reject Candidate
            </button>

            <button 
              onClick={() => updateStatus('UNDER_REVIEW')}
              disabled={loading || currentStatus === 'UNDER_REVIEW'}
              className="px-5 py-2.5 rounded-full font-mono text-xs font-bold bg-white/[0.05] text-white/70 border border-white/[0.1] hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>💬</span> Keep Under Review
            </button>
          </>
        ) : (
          <>
            <button 
              onClick={() => updateStatus('SELECTED')}
              disabled={loading || currentStatus === 'SELECTED'}
              className="px-5 py-2.5 rounded-full font-mono text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              ✓ Select for Interview
            </button>
            
            <button 
              onClick={() => updateStatus('REJECTED')}
              disabled={loading || currentStatus === 'REJECTED'}
              className="px-5 py-2.5 rounded-full font-mono text-xs font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              ✕ Reject Candidate
            </button>

            {currentStatus === 'SELECTED' && (
              <button 
                onClick={() => router.push(`/admin/applications/${applicationId}/schedule`)}
                className="sm:ml-auto px-6 py-2.5 bg-white text-black font-sans font-bold text-xs rounded-full hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>Schedule Interview</span>
                <span>→</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

