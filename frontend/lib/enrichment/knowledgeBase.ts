import type { CandidateContext } from '@/lib/db';

/**
 * Builds a comprehensive, structured Candidate Knowledge Base from Resume, LinkedIn, and GitHub.
 * This is injected directly into the Agora MLLM (Gemini Live) agent instructions so the voice agent
 * has complete factual knowledge about the candidate's real background, codecraft, and experience.
 */
export function formatCandidateKnowledgeBase(
  candidateContext?: CandidateContext | null,
  candidateName: string = 'Candidate',
  targetRole: string = 'Engineering Role',
  rawResumeText?: string
): string {
  if (!candidateContext) {
    if (rawResumeText && rawResumeText.trim()) {
      return `--- CANDIDATE RESUME GROUND TRUTH ---\n${rawResumeText.slice(0, 2000)}`;
    }
    return '--- NO CANDIDATE PROFILE DATA AVAILABLE ---';
  }

  const sections: string[] = [];

  sections.push(`================================================================================
CANDIDATE KNOWLEDGE BASE (VERIFIED RESUME, LINKEDIN & GITHUB CONTEXT)
Candidate: ${candidateName} | Target Position: ${targetRole}
================================================================================`);

  // 1. Work Experience (from LinkedIn & Resume)
  const experiences = candidateContext.linkedin?.experience || candidateContext.experience || [];
  if (experiences.length > 0) {
    const expLines = experiences.map((e, idx) => {
      let line = `• ${e.title} at ${e.company}`;
      if (e.duration) line += ` (${e.duration})`;
      if (e.description) line += `\n  Details: ${e.description}`;
      return line;
    });
    sections.push(`[1. VERIFIED WORK EXPERIENCE & INDUSTRY ROLES]\n${expLines.join('\n\n')}`);
  } else if (candidateContext.resume?.experienceTitles && candidateContext.resume.experienceTitles.length > 0) {
    sections.push(`[1. WORK EXPERIENCE (FROM RESUME)]\n${candidateContext.resume.experienceTitles.map(t => `• ${t}`).join('\n')}`);
  }

  // 2. Verified GitHub Codebases & Repositories
  const repos = candidateContext.github?.repositories || candidateContext.githubProjects || [];
  if (repos.length > 0) {
    const repoLines = repos.slice(0, 6).map(r => {
      let header = `• ${r.name}`;
      const badges: string[] = [];
      if (r.language) badges.push(r.language);
      if ((r as any).stars) badges.push(`${(r as any).stars} stars`);
      if (r.isPinned) badges.push('Pinned on GitHub');
      if (badges.length > 0) header += ` (${badges.join(', ')})`;
      
      let body = '';
      if (r.description) body += `\n  Description: ${r.description}`;
      if ((r as any).readmeSnippet || (r as any).keyInsights) {
        body += `\n  Architecture & Codecraft: ${(r as any).readmeSnippet || (r as any).keyInsights}`;
      }
      return header + body;
    });
    sections.push(`[2. VERIFIED REPOSITORIES & CODEBASES (FROM GITHUB)]\n${repoLines.join('\n\n')}`);
  }

  // 3. Verified Projects (from Resume & LinkedIn)
  const resumeProjects = candidateContext.resume?.projects || [];
  const linkedinProjects = candidateContext.linkedin?.projects || candidateContext.projects || [];
  if (linkedinProjects.length > 0) {
    const projLines = linkedinProjects.map(p => {
      let line = `• ${p.title}`;
      if (p.description) line += `: ${p.description}`;
      if (p.url) line += ` (${p.url})`;
      return line;
    });
    sections.push(`[3. TECHNICAL PROJECTS (RESUME / PORTFOLIO)]\n${projLines.join('\n')}`);
  } else if (resumeProjects.length > 0) {
    sections.push(`[3. TECHNICAL PROJECTS (FROM RESUME)]\n${resumeProjects.map(p => `• ${p}`).join('\n')}`);
  }

  // 4. Education & Academic Background
  const edu = candidateContext.linkedin?.education || candidateContext.education || [];
  if (edu.length > 0) {
    const eduLines = edu.map(e => {
      let line = `• ${e.school}`;
      if (e.degree) line += ` — ${e.degree}`;
      if (e.fieldOfStudy) line += ` in ${e.fieldOfStudy}`;
      if (e.year) line += ` (${e.year})`;
      return line;
    });
    sections.push(`[4. EDUCATION & ACADEMIC CREDENTIALS]\n${eduLines.join('\n')}`);
  }

  // 5. Verified Skills (Corroborated across sources)
  const corroboratedSkills = candidateContext.crossSourceContext?.corroboratedSkills || [];
  if (corroboratedSkills.length > 0) {
    const skillLines = corroboratedSkills.map(s => `• ${s.skill} (Verified via: ${s.sources.join(' + ')})`);
    sections.push(`[5. VERIFIED TECHNICAL SKILLS]\n${skillLines.join('\n')}`);
  } else if (candidateContext.skills && candidateContext.skills.length > 0) {
    sections.push(`[5. TECHNICAL SKILLS]\n${candidateContext.skills.map(s => `• ${s}`).join(', ')}`);
  }

  // 6. Notable Verifiable Claims & Achievements
  const notableClaims = candidateContext.crossSourceContext?.notableClaims || [];
  const highlights = candidateContext.resume?.notableHighlights || [];
  if (notableClaims.length > 0) {
    const claimLines = notableClaims.map(c => `• "${c.claim}" (Probe focus: ${c.verificationFocus})`);
    sections.push(`[6. VERIFIABLE HIGHLIGHTS & CLAIMS TO PROBE]\n${claimLines.join('\n')}`);
  } else if (highlights.length > 0) {
    sections.push(`[6. NOTABLE HIGHLIGHTS]\n${highlights.map(h => `• ${h}`).join('\n')}`);
  }

  // 7. High-Value Technical Probing Hooks
  const techHooks = candidateContext.interviewContext?.technicalInterviewHooks || candidateContext.interviewHooks || [];
  if (techHooks.length > 0) {
    sections.push(`[7. PRE-FORMULATED TECHNICAL INTERVIEW HOOKS]\n${techHooks.map(h => `• ${h}`).join('\n')}`);
  }

  // 8. Topics Excluded from Interview (Noise/Mismatched Domains)
  const ignoredTopics = candidateContext.interviewContext?.ignoredOrLowRelevanceTopics || [];
  if (ignoredTopics.length > 0) {
    sections.push(`[8. TOPICS EXCLUDED FROM INTERVIEW (IRRELEVANT TO THIS ROLE)]\n${ignoredTopics.map(t => `• ${t}`).join('\n')}\n*RULE: Do NOT initiate questions on these topics unless candidate specifically brings them up.*`);
  }

  return sections.join('\n\n');
}

/**
 * Injects the Candidate Knowledge Base and the Strict Answer Validation Protocol into an agent instruction string.
 */
export function injectKnowledgeBaseIntoAgentInstructions(
  baseInstructions: string,
  candidateContext?: CandidateContext | null,
  candidateName: string = 'Candidate',
  targetRole: string = 'Engineering Role',
  rawResumeText?: string
): string {
  const kb = formatCandidateKnowledgeBase(candidateContext, candidateName, targetRole, rawResumeText);

  // If already injected, return as is
  if (baseInstructions.includes('CANDIDATE KNOWLEDGE BASE')) {
    return baseInstructions;
  }

  return `${baseInstructions.trim()}

${kb}

================================================================================
CRITICAL ANSWER VALIDATION & BEHAVIORAL PROTOCOL (MANDATORY)
================================================================================
The candidate speaking DOES NOT mean they answered the question.
You MUST evaluate the technical substance of EVERY answer before responding:

1. STRONG / VALID ANSWER:
   - Acknowledge briefly (1 short sentence max).
   - Probe deeper into architectural trade-offs or move to the next topic if sufficient evidence was collected.

2. PARTIAL ANSWER:
   - Ask a direct, targeted clarification probing the specific missing component (e.g., "You covered the data model, but how would you ensure atomic updates under concurrent traffic?").

3. VAGUE / HAND-WAVEY ANSWER:
   - Demand concrete mechanisms, numbers, or code-level implementation details (e.g., "Can you walk me through the exact locking or partitioning mechanism you would use?").

4. INCORRECT ANSWER:
   - Challenge the technical reasoning directly (e.g., "Wouldn't that approach cause a deadlock or split-brain if node A disconnects? Walk me through what happens during a network partition.").

5. IRRELEVANT ANSWER:
   - Firmly redirect the candidate back to the original question (e.g., "I want to bring us back to the concurrency question. How would you prevent two requests from modifying the same resource simultaneously?").

6. GIBBERISH / NONSENSE / UNINTELLIGIBLE:
   - NEVER say "makes sense", "got it", or "sounds good".
   - NEVER move forward to the next question.
   - Ask the candidate to repeat or clarify their technical approach (e.g., "I didn't quite catch your technical explanation there. Could you explain your approach again clearly?").

7. SILENCE / NO ANSWER:
   - Politely prompt the candidate to share their initial thoughts or architecture.

8. REPEATED NON-ANSWERS (After 2 attempts):
   - Acknowledge and transition cleanly without pretending they answered (e.g., "Understood, let's move to our next architectural topic.").

--- MULTI-AGENT PANEL RULES ---
- The CANDIDATE is the sole focus of this call. Always direct questions directly to ${candidateName}.
- NEVER converse with, validate, or respond to the other AI interviewer.
- NEVER invent or assume facts about the candidate that are not in the Knowledge Base.
- Keep turns concise (2-3 sentences max). Do NOT monologue.`;
}
