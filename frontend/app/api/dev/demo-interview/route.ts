import { NextResponse } from 'next/server';
import { getDb, saveDb, Candidate, Application, Interview, InterviewBlueprint } from '@/lib/db';

export async function POST() {
  try {
    const db = getDb();

    // 1. Ensure target job exists (j1)
    let job = db.jobs.find(j => j.id === 'j1');
    if (!job) {
      job = {
        id: 'j1',
        companyId: 'c1',
        title: 'Senior Backend Engineer — Distributed Systems & Real-Time APIs',
        description: 'Design and scale distributed event pipelines, transactional services, and ultra-low-latency APIs powering real-time AI platform.',
        requirements: '3-6 years of distributed backend systems, Go/Node.js, Kafka, Redis, PostgreSQL.',
        stagesJson: JSON.stringify(['Core Concurrency & Architecture', 'Distributed Systems & Scaling', 'Engineering Leadership & Culture'])
      };
      db.jobs.unshift(job);
    }

    // 2. Seed Dedicated Demo Candidate: Alex Rivera
    const candidateId = 'demo-cand-test';
    const applicationId = 'demo-app-test';
    const interviewId = 'demo-interview-test';
    const blueprintId = 'demo-blueprint-test';

    const candidate: Candidate = {
      id: candidateId,
      name: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      githubUrl: 'https://github.com/alexrivera-eng',
      linkedinUrl: 'https://linkedin.com/in/alex-rivera-distributed',
      candidateContext: {
        headline: 'Staff Infrastructure Engineer — Distributed Systems & Event Streaming',
        about: 'Specialized in high-throughput low-latency stream processing, Raft consensus protocols, and WebRTC streaming media backbones.',
        skills: ['Distributed Systems', 'Kafka', 'Go', 'Node.js', 'PostgreSQL', 'Redis', 'WebRTC', 'Kubernetes'],
        experience: [
          {
            title: 'Senior Distributed Systems Engineer',
            company: 'Vortex Cloud Inc.',
            duration: '2021 — Present (3.5 yrs)',
            description: 'Architected real-time event streaming cluster handling 1.8M events/sec using Go, Apache Kafka, and RocksDB with p99 latency < 12ms.'
          },
          {
            title: 'Backend Infrastructure Engineer',
            company: 'Nexus Scale Labs',
            duration: '2019 — 2021 (2 yrs)',
            description: 'Implemented high-concurrency WebSocket gateways and distributed cache invalidation layers across multi-region Redis clusters.'
          }
        ],
        projects: [
          {
            title: 'Chronos-Raft: Embedded High-Throughput Consensus Engine in Go',
            description: 'A lock-free Go implementation of Raft consensus with vectorized batch log replication.',
            url: 'https://github.com/alexrivera-eng/chronos-raft'
          },
          {
            title: 'FlowMesh: Sub-10ms WebRTC Media Pipeline Ingestion',
            description: 'Real-time media relay proxy with adaptive jitter buffers and acoustic frame synchronization.',
            url: 'https://github.com/alexrivera-eng/flowmesh-webrtc'
          }
        ]
      }
    };

    // Upsert candidate
    const candIdx = db.candidates.findIndex(c => c.id === candidateId);
    if (candIdx >= 0) db.candidates[candIdx] = candidate;
    else db.candidates.push(candidate);

    // 3. Seed Application
    const application: Application = {
      id: applicationId,
      jobId: 'j1',
      candidateId: candidateId,
      resumeText: `Alex Rivera\nSenior Backend & Infrastructure Engineer\nEmail: alex.rivera@example.com | Phone: +1-555-0192\n\nPROFESSIONAL SUMMARY:\nSeasoned Distributed Systems Engineer with 5+ years building sub-50ms real-time event streaming engines, lock-free concurrency in Go, and multi-region data platforms.\n\nCORE SKILLS:\n• Distributed Systems Architecture, Raft Consensus, Event-Driven Topologies\n• Go (Golang), TypeScript/Node.js, C++\n• Apache Kafka, Redis Clusters, PostgreSQL Optimization\n• WebRTC, WebSockets, Low-Latency Real-Time Audio\n\nEXPERIENCE:\n• Vortex Cloud Inc. (2021 - Present): Senior Systems Engineer\n  - Built event pipeline processing 1.8M events/sec.\n  - Reduced p99 latency from 45ms to 11ms.\n• Nexus Scale Labs (2019 - 2021): Backend Engineer\n  - Scaled WebSocket connection pooling to 250,000 active nodes.`,
      status: 'UNDER_REVIEW',
      decisionStage: 'ROUND_1_TECHNICAL',
      candidateContext: candidate.candidateContext
    };

    const appIdx = db.applications.findIndex(a => a.id === applicationId);
    if (appIdx >= 0) db.applications[appIdx] = application;
    else db.applications.push(application);

    // 4. Seed 2-Round Interview Blueprint
    const blueprintData = {
      interview_rounds: [
        {
          round_name: "Round 1: Technical Panel (Systems & Concurrency)",
          round_type: "technical",
          purpose: "Evaluate core distributed systems design, lock-free concurrency in Go, Kafka partition throughput, and Raft consensus.",
          interviewers: [
            {
              name: "Priya Nair",
              role: "Principal Infrastructure Lead",
              voice: "Aoede",
              color: "#3B82F6",
              is_primary: true,
              agent_uid: 9991,
              instructions: `You are Priya Nair, Principal Infrastructure Lead at Nexora Labs. You are the Primary Technical Interviewer interviewing Alex Rivera for the Senior Backend Engineer role.
You drive the technical interview and ask core architectural and implementation questions.
Focus areas:
- Distributed concurrency & lock-free Go primitives
- High-throughput Kafka event streaming & backpressure
- Factual verification of their Chronos-Raft engine and FlowMesh WebRTC projects

You are technically rigorous, calm, concise, and conversational.
Ask one question at a time.
Direct all questions to Alex. When Alex answers, validate their technical reasoning before moving on.
Do not invent candidate facts. Follow the Answer Validation Protocol strictly.`,
              greeting_message: "Hi Alex, welcome to Nexora Labs. I'm Priya, leading our Core Infrastructure team, and I'm joined by Arjun. We're excited to dive into your background in distributed systems and real-time streaming architectures. To get started, could you walk us through the concurrency model of your Chronos-Raft engine and how you handled batch log replication?"
            },
            {
              name: "Arjun Malhotra",
              role: "Staff Distributed Systems Specialist",
              voice: "Charon",
              color: "#8B5CF6",
              is_primary: false,
              agent_uid: 9992,
              instructions: `You are Arjun Malhotra, Staff Distributed Systems Specialist at Nexora Labs.
You are the secondary technical interviewer probing deeper architectural failure modes, trade-offs, and scalability limits.
Focus areas:
- Distributed consensus guarantees & split-brain prevention
- Partition rebalancing storms, consumer lag, and disk saturation
- Cache invalidation stampedes and eventual consistency edge cases

Do not repeat questions already asked.
When the backend grants you the floor, ask one sharp, focused technical probe directly to Alex.
Direct all questions to Alex. Follow the Answer Validation Protocol strictly.`,
              greeting_message: ""
            }
          ],
          topics: [
            "Raft Consensus & Split-Brain Prevention",
            "Kafka Partitioning & Backpressure Handling",
            "Lock-Free Concurrency in Go",
            "Zero-Downtime Cache Invalidation"
          ]
        },
        {
          round_name: "Round 2: HR, Culture & Engineering Leadership",
          round_type: "hr",
          purpose: "Evaluate collaborative problem solving, incident retrospective ownership, technical mentorship, and cross-functional communication.",
          interviewers: [
            {
              name: "Sarah Jenkins",
              role: "VP of Engineering Culture & People",
              voice: "Puck",
              color: "#F59E0B",
              is_primary: true,
              agent_uid: 9993,
              instructions: `You are Sarah Jenkins, VP of Engineering Culture & People at Nexora Labs.
You are conducting the second round of Alex Rivera's interview, focusing on engineering ownership, incident retrospectives, and cross-functional collaboration.
Ask one thoughtful question at a time and listen attentively to Alex's answers.`,
              greeting_message: "Hello Alex, wonderful to meet you! Priya and Arjun shared great notes from the technical round. In this section, I'd love to understand more about your leadership approach, how you navigate high-severity production incidents, and how you mentor engineers on your team."
            }
          ],
          topics: [
            "Incident Ownership & Blameless Post-Mortems",
            "Technical Mentorship & Code Review Standards",
            "Cross-Functional Product Collaboration",
            "Working Under High-SLA Production Constraints"
          ]
        }
      ],
      rubric: {
        "Technical Depth & Concurrency": "Demonstrates mastery of Go concurrency, memory barriers, lock-free channels, and low-level thread synchronization.",
        "Distributed Systems Architecture": "Understands partition tolerance, Raft consensus guarantees, backpressure, and caching trade-offs.",
        "Problem Decomposition & Rigor": "Structured reasoning, quantitative throughput estimation, and awareness of edge-case failure modes.",
        "Communication & Ownership Mindset": "Articulate, structured communication, proactive ownership of production outages, and blameless retrospectives."
      }
    };

    const blueprint: InterviewBlueprint = {
      id: blueprintId,
      interviewId: interviewId,
      blueprintJson: JSON.stringify(blueprintData, null, 2)
    };

    const bpIdx = db.blueprints.findIndex(b => b.id === blueprintId);
    if (bpIdx >= 0) db.blueprints[bpIdx] = blueprint;
    else db.blueprints.push(blueprint);

    // 5. Seed Clean Interview Record
    const interview: Interview = {
      id: interviewId,
      applicationId: applicationId,
      scheduledAt: new Date().toISOString(),
      status: 'SCHEDULED',
      transcript: [],
      evaluations: [],
      suspiciousEvents: []
    };

    const intIdx = db.interviews.findIndex(i => i.id === interviewId);
    if (intIdx >= 0) db.interviews[intIdx] = interview;
    else db.interviews.push(interview);

    saveDb(db);

    return NextResponse.json({
      success: true,
      message: 'Demo test interview initialized successfully',
      candidateId,
      applicationId,
      interviewId,
      blueprintId,
      blueprint: blueprintData
    });
  } catch (error: any) {
    console.error('Failed to seed demo interview:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
