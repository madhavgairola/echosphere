import fs from 'fs';
import path from 'path';

export interface Company {
  id: string;
  name: string;
  industry: string;
}

export interface Job {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requirements: string;
  stagesJson: string; // JSON array of strings
  mcpServerUrl?: string;
}

export interface GitHubRepoContext {
  name: string;
  fullName: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  topics?: string[];
  readmeSnippet?: string;
  url: string;
  updatedAt?: string;
}

export interface GitHubContext {
  username: string;
  profileUrl: string;
  name?: string;
  bio?: string;
  company?: string;
  location?: string;
  publicReposCount?: number;
  followers?: number;
  avatarUrl?: string;
  totalCommits?: number;
  recentCommits30Days?: number;
  commitVelocityNarrative?: string;
  technicalHighlights?: string[];
  githubProjects?: Array<{
    name: string;
    description?: string;
    language?: string;
    stars?: number;
    topics?: string[];
    keyInsights?: string;
    url?: string;
    isPinned?: boolean;
    candidateCommits?: number;
    isRecent?: boolean;
  }>;
  githubInterviewHooks?: string[];
  enrichedAt: string;
  rawProviderJson?: any;
}

export interface NormalizedResumeContext {
  textSnippet?: string;
  fileName?: string;
  driveUrl?: string;
  skills?: string[];
  experienceTitles?: string[];
  projects?: string[];
  notableHighlights?: string[];
}

export interface NormalizedLinkedInContext {
  profileUrl?: string;
  headline?: string;
  about?: string;
  experience?: Array<{
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }>;
  skills?: string[];
  education?: Array<{
    school: string;
    degree?: string;
    fieldOfStudy?: string;
    year?: string;
  }>;
  projects?: Array<{
    title: string;
    description?: string;
    url?: string;
  }>;
  certifications?: Array<{
    name: string;
    issuer?: string;
    year?: string;
  }>;
  careerProgression?: string;
  notableClaims?: string[];
}

export interface NormalizedGitHubContext {
  username?: string;
  profileUrl?: string;
  bio?: string;
  publicReposCount?: number;
  // Repositories are used solely as context to identify active/relevant work, never as candidate quality scores
  repositories?: Array<{
    name: string;
    description?: string;
    language?: string;
    topics?: string[];
    url?: string;
    isPinned?: boolean;
    readmeSnippet?: string;
  }>;
  activeProjects?: string[];
}

export interface CrossSourceContext {
  corroboratedSkills: Array<{
    skill: string;
    sources: ('resume' | 'linkedin' | 'github')[];
    confidence: 'HIGH' | 'MEDIUM';
    evidenceSnippet?: string;
  }>;
  corroboratedProjects: Array<{
    projectName: string;
    description: string;
    sources: ('resume' | 'linkedin' | 'github')[];
    details: string;
    evidenceSnippet?: string;
  }>;
  corroboratedExperience: Array<{
    role: string;
    company: string;
    duration?: string;
    sources: ('resume' | 'linkedin' | 'github')[];
    corroborationNotes?: string;
  }>;
  careerProgressionSummary?: string;
  notableClaims: Array<{
    claim: string;
    source: string;
    verificationFocus: string; // e.g. "Probe real-world concurrency benchmarks and scale handling"
  }>;
}

export interface InterviewContext {
  targetRole: string;
  highRelevanceEvidence: Array<{
    topic: string;
    relevance: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    evidenceSources: string[];
  }>;
  technicalInterviewHooks: string[];
  behavioralInterviewHooks: string[];
  projectsWorthProbing: Array<{
    name: string;
    relevanceLevel: 'HIGH' | 'MEDIUM';
    reasonToProbe: string;
    suggestedQuestions: string[];
    sourceUrl?: string;
  }>;
  ignoredOrLowRelevanceTopics?: string[];
}

export interface EnrichmentSourceLogging {
  rawProviderJson: {
    linkedin?: any;
    github?: any;
  };
  mappedCandidateContext: {
    headline: string | null;
    name?: string | null;
    bio?: string | null;
    experience: any[];
    education: any[];
    skills: string[];
    projects: any[];
    certifications: any[];
    organizations: string[];
    github: {
      username?: string | null;
      repositoryNames: string[];
      pinnedRepositories: string[];
      stars?: number;
      languages?: string[];
      commitCounts?: { total?: number; recent30Days?: number };
    };
  };
  geminiSynthesis: {
    careerProgression?: string | null;
    notableClaims?: Array<{ claim: string; source: string; verificationFocus: string }>;
    interviewHooks?: string[];
  };
  timestamp: string;
}

export interface CandidateContext {
  // --- 5 Core Normalized Pipeline Layers ---
  resume?: NormalizedResumeContext;
  linkedin?: NormalizedLinkedInContext;
  github?: NormalizedGitHubContext;
  crossSourceContext?: CrossSourceContext;
  interviewContext?: InterviewContext;

  // --- Backwards Compatibility Accessors ---
  headline?: string;
  about?: string;
  experience?: {
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }[];
  skills?: string[];
  education?: {
    school: string;
    degree?: string;
    fieldOfStudy?: string;
    year?: string;
  }[];
  projects?: {
    title: string;
    description?: string;
    url?: string;
  }[];
  certifications?: {
    name: string;
    issuer?: string;
    year?: string;
  }[];
  organizations?: string[];
  careerProgression?: string;
  notableClaims?: string[];
  interviewHooks?: string[];
  enrichmentSource?: string;
  enrichedAt?: string;
  rawProviderJson?: any;
  sourceLogging?: EnrichmentSourceLogging;

  // GitHub Context (backwards-compat)
  githubContext?: GitHubContext;
  totalCommits?: number;
  recentCommits30Days?: number;
  commitVelocityNarrative?: string;
  technicalHighlights?: string[];
  githubProjects?: Array<{
    name: string;
    description?: string;
    language?: string;
    stars?: number;
    topics?: string[];
    keyInsights?: string;
    url?: string;
    isPinned?: boolean;
    candidateCommits?: number;
    isRecent?: boolean;
  }>;
  githubInterviewHooks?: string[];
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  resumeDriveUrl?: string;
  candidateContext?: CandidateContext;
}

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  resumeText: string;
  resumeDriveUrl?: string;
  resumeFileName?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  relevantExperience?: string;
  additionalInfo?: string;
  status: string;
  decisionStage?: 'RESUME_SCREENING' | 'ROUND_1_TECHNICAL' | 'ROUND_2_SYSTEM_DESIGN' | 'ROUND_3_BEHAVIORAL' | 'FINAL_DECISION' | 'PENDING_HIRING_DECISION';
  decisionReason?: string;
  recommendedAlternativeRoles?: string[];
  evaluationScore?: number;
  evaluationSummary?: string;
  candidateContext?: CandidateContext;
}

export interface InterviewerProfile {
  interviewerId: string;
  name: string;
  role: string;
  department: string;
  voice: string; // 'Aoede' | 'Charon' | 'Fenrir' | 'Kore' | 'Puck'
  avatarUrl?: string;
  color: string;
  persona: {
    style: string;
    seniority: 'senior' | 'staff' | 'lead' | 'manager';
    focusAreas: string[];
    behavior: string[];
  };
}

export interface CompanyInterviewerPool {
  [categoryOrRole: string]: InterviewerProfile[];
}

export type FloorState = 
  | 'CANDIDATE_SPEAKING'
  | 'PRIMARY_SPEAKING'
  | 'CHALLENGER_SPEAKING'
  | 'HR_SPEAKING'
  | 'WAITING'
  | 'TRANSITIONING'
  | 'TECHNICAL_CLOSING'
  | 'HR_CLOSING';

export type AnswerClassification =
  | 'VALID_STRONG'
  | 'VALID_PARTIAL'
  | 'VAGUE'
  | 'INCORRECT'
  | 'IRRELEVANT'
  | 'GIBBERISH'
  | 'NO_ANSWER'
  | 'REPEATED_NON_ANSWER';

export interface StructuredFloorRequest {
  id: string;
  agent: 'primary' | 'challenger' | 'hr';
  agentId: string;
  agentName: string;
  requestFloor: boolean;
  reason: string;
  targetCompetency: string;
  priority: 'low' | 'medium' | 'high';
  proposedProbe?: string;
  timestamp: number;
  status: 'pending' | 'granted' | 'denied' | 'completed';
}

export interface FloorRequest {
  id: string;
  agentId: string;
  agentName: string;
  reason: string;
  urgency: 'normal' | 'high';
  proposedProbe?: string;
  timestamp: number;
}

export interface CompetencyTracker {
  competency: string;
  questionsAsked: string[];
  candidateResponses: string[];
  evidence: string[];
  evidenceQuality: 'STRONG' | 'PARTIAL' | 'VAGUE' | 'NONE';
  followUps: string[];
  sufficientEvidence: boolean;
  score?: number; // 0-100
  notes?: string;
}

export interface CompetencyEvidence {
  id: string;
  timestamp: number;
  round: 'technical' | 'hr';
  speaker: string;
  questionAsked: string;
  candidateUtterance: string;
  classification: AnswerClassification;
  verbatimQuote?: string;
  qualityScore: number;
  topic?: string;
}

export interface ActivePanelAgent {
  agentId: string;
  name: string;
  role: string;
  voice: string;
  color: string;
  isPrimary: boolean;
  isActive: boolean;
  hasFloor: boolean;
}

export interface InterviewState {
  interviewId: string;
  currentRound: 'technical' | 'hr';
  floorState: FloorState;
  currentTopic?: string;
  currentSpeaker?: string; // 'candidate' | agentId
  lastQuestion?: string;
  candidateAnswer?: string;
  conversationSummary: string;
  questionsAsked: string[];
  topicsCovered: string[];
  evidenceCollected: string[];
  structuredEvidence?: CompetencyEvidence[];
  competencyTrackers?: CompetencyTracker[];
  structuredFloorRequests?: StructuredFloorRequest[];
  agentFloorRequests: FloorRequest[];
  lastChallengerTurnTime?: number;
  lastChallengerTurnIndex?: number;
  roundProgress: number; // 0 to 100
  interviewStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'ROUND_COMPLETE' | 'PASSED' | 'FAILED' | 'COMPLETED';
  activeAgents: ActivePanelAgent[];
  updatedAt: string;
}

export interface Interview {
  id: string;
  applicationId: string;
  scheduledAt: string;
  status: string; // PENDING, IN_PROGRESS, COMPLETED, FAILED
  transcript?: { round: string, speaker: string, text: string }[];
  evaluations?: { round: string, decision: string, score: number, reason: string }[];
  suspiciousEvents?: { timestamp: string, type: string, details: string, severity?: string, score_impact?: number }[];
  proctoringReport?: any;
  scorecard?: any;
  interviewState?: InterviewState;
}

export interface InterviewBlueprint {
  id: string;
  interviewId: string;
  blueprintJson: string;
}

export interface EmailNotification {
  id: string;
  recipientEmail: string;
  recipientName: string;
  type: 'APPLICATION_RECEIVED' | 'INTERVIEW_INVITATION' | 'APPLICATION_REJECTED' | 'APPLICATION_OFFER' | 'APPLICATION_WAITLIST' | string;
  subject: string;
  bodyText: string;
  sentAt: string;
  metadata?: Record<string, any>;
}

export interface Database {
  companies: Company[];
  jobs: Job[];
  candidates: Candidate[];
  applications: Application[];
  interviews: Interview[];
  blueprints: InterviewBlueprint[];
  emails?: EmailNotification[];
  interviewerPool?: CompanyInterviewerPool;
}

const dbPath = path.join(process.cwd(), 'data.json');

const defaultDb: Database = {
  companies: [
    { id: 'c1', name: 'Nexora Labs', industry: 'AI Infrastructure & Developer Platform' }
  ],
  jobs: [
    {
      id: 'j1',
      companyId: 'c1',
      title: 'Senior Backend Engineer — Distributed Systems & Real-Time APIs',
      description: 'Nexora Labs builds the infrastructure behind intelligent products. We are seeking a Senior Backend Engineer to design and scale the distributed event pipelines, transactional services, and ultra-low-latency APIs that power our real-time AI platform.\n\nIn this role, you will lead the architecture of high-throughput backend microservices handling millions of concurrent WebSocket events, streaming audio frames, and distributed transactional state. You will work closely with our AI Systems and Core Platform teams to deliver resilient, sub-50ms p99 response times across our global edge network.\n\nKey Responsibilities:\n• Architect, deploy, and scale high-concurrency backend services in TypeScript/Node.js and Go across containerized Kubernetes clusters.\n• Design high-throughput, fault-tolerant event ingestion pipelines using Apache Kafka, Redis Pub/Sub, and PostgreSQL connection pooling.\n• Optimize database schemas, query plans, indexing strategies, and distributed cache invalidation layers.\n• Implement end-to-end distributed tracing (OpenTelemetry), health checks, and automated failover mechanics for mission-critical customer workloads.\n• Define API contracts, collaborate with frontend and ML engineers on streaming payload schemas, and drive engineering best practices.',
      requirements: 'Required Qualifications:\n• 3–6 years of professional backend engineering experience building and scaling distributed systems in production.\n• Strong proficiency in TypeScript, Node.js, and/or Go, with deep understanding of asynchronous event loops, non-blocking I/O, and concurrency patterns.\n• Deep hands-on experience with relational databases (PostgreSQL indexing, query optimization, connection pooling) and caching layers (Redis).\n• Proven experience designing high-throughput, low-latency REST and WebSocket APIs under strict SLAs.\n• Strong understanding of distributed systems principles: CAP theorem, eventual consistency, partition tolerance, and idempotent operations.\n\nPreferred Qualifications:\n• Experience with event streaming architectures using Apache Kafka, RabbitMQ, or AWS Kinesis.\n• Familiarity with containerized deployments on Kubernetes (EKS/GKE) and cloud infrastructure (AWS/GCP).\n• Prior experience with real-time media transport (WebRTC) or streaming LLM inference gateways.',
      stagesJson: JSON.stringify(['Core Concurrency & API Architecture', 'Distributed Systems & Database Scaling', 'Engineering Leadership & Cultural Alignment'])
    },
    {
      id: 'j2',
      companyId: 'c1',
      title: 'Staff Backend Engineer — Core Infrastructure & Architecture',
      description: 'As a Staff Backend Engineer at Nexora Labs, you will serve as a principal technical leader shaping the next generation of our global AI infrastructure. You will own the technical roadmap for our high-concurrency orchestration platform, multi-region database replication, and real-time inference streaming pipelines.\n\nYou will tackle some of our hardest distributed systems challenges: multi-region active-active failover, microsecond-level serialization overhead, state machine synchronization across edge clusters, and zero-downtime database schema migrations.\n\nKey Responsibilities:\n• Lead architectural strategy and technical standards across Nexora\'s distributed backend services and data infrastructure.\n• Design resilient multi-region architectures supporting 10x traffic growth with 99.99% availability SLAs.\n• Champion high-performance concurrency patterns, memory profiling, and network optimization across Go and Node.js microservices.\n• Mentor senior engineers, author detailed technical RFCs, and establish engineering guidelines for latency budgets and fault containment.\n• Partner with product management and executive leadership to align infrastructure investments with enterprise platform capabilities.',
      requirements: 'Required Qualifications:\n• 7+ years of software engineering experience with demonstrated technical leadership in large-scale distributed systems.\n• Deep expertise in distributed systems architecture, event-driven topologies, consensus mechanisms (Raft/Paxos), and high-throughput streaming.\n• Mastery of concurrency, memory management, and performance profiling in Go, TypeScript/Node.js, or Rust.\n• Extensive experience scaling PostgreSQL, distributed key-value stores (Redis clusters), and messaging systems (Kafka) to billions of monthly events.\n• Track record of driving complex architectural initiatives from conception to multi-region production rollout.\n\nPreferred Qualifications:\n• Experience designing mission-critical developer platforms or real-time communication backbones.\n• Expertise in multi-region Kubernetes deployments, service mesh architectures (Istio/Envoy), and disaster recovery design.\n• Strong written and verbal communication skills with experience publishing technical RFCs.',
      stagesJson: JSON.stringify(['System Architecture & Distributed Consensus', 'Scalability, Resiliency & Failure Modes', 'Technical Leadership & Organization Impact'])
    },
    {
      id: 'j3',
      companyId: 'c1',
      title: 'Senior Full Stack Engineer — Next.js & Developer Platform',
      description: 'Nexora Labs is creating the developer interfaces that make intelligent infrastructure easy to orchestrate. We are looking for a Senior Full Stack Engineer to lead the architecture and implementation of our customer-facing web applications, real-time collaboration rooms, and developer analytics consoles.\n\nYou will combine modern Next.js 15 App Router patterns, React Server Components, Tailwind CSS, and WebRTC streaming to deliver responsive, zero-lag user experiences used by engineering teams worldwide.\n\nKey Responsibilities:\n• Build high-performance frontend interfaces and full-stack API routes using Next.js 15, React, TypeScript, and Tailwind CSS.\n• Implement real-time WebRTC audio visualizers, live WebSocket telemetry displays, and collaborative state management.\n• Design modular, accessible component libraries and reusable design system primitives.\n• Optimize client-side bundle size, Core Web Vitals, and server-side rendering performance for ultra-fast page transitions.\n• Collaborate closely with product designers and backend engineers to translate complex distributed systems into clean, delightful UI workflows.',
      requirements: 'Required Qualifications:\n• 3–6 years of experience building modern full-stack web applications with React, Next.js, and TypeScript.\n• Deep proficiency with Next.js App Router, React Server Components, server actions, and modern state management patterns.\n• Strong foundation in browser APIs: WebRTC, WebSockets, Web Audio API, and DOM performance optimization.\n• Mastery of Tailwind CSS, responsive design, accessibility (WCAG), and modern frontend tooling.\n• Solid understanding of backend REST APIs, Node.js runtime fundamentals, and database query integration.\n\nPreferred Qualifications:\n• Experience building developer tools, interactive data visualization dashboards, or real-time voice/video applications.\n• Familiarity with client-side performance profiling and automated end-to-end testing (Playwright/Cypress).\n• Strong eye for typography, micro-interactions, and visual polish.',
      stagesJson: JSON.stringify(['Full Stack Architecture & Live Coding', 'WebRTC & Frontend Systems Deep Dive', 'Product Craft & Cultural Alignment'])
    },
    {
      id: 'j4',
      companyId: 'c1',
      title: 'AI / Machine Learning Engineer — Conversational Systems & LLM Infra',
      description: 'At Nexora Labs, our AI Platform team researches, evaluates, and deploys the intelligence models that power our multi-persona conversational agents and autonomous evaluation engines. We are seeking an AI/ML Engineer to push the boundaries of real-time conversational agents, streaming speech-to-speech pipelines, and grounded LLM evaluation.\n\nYou will work on low-latency inference orchestration (vLLM/TensorRT-LLM), multi-agent floor arbitration, hallucination guardrails, and retrieval-augmented synthesis pipelines.\n\nKey Responsibilities:\n• Design, evaluate, and deploy fine-tuned LLMs and multimodal agent pipelines tailored for specialized conversational personas.\n• Optimize real-time streaming audio intelligence pipelines integrating streaming ASR, low-latency LLM generation, and neural TTS.\n• Build grounded retrieval-augmented generation (RAG) workflows with semantic vector search, context caching, and factual verification.\n• Develop automated multi-round evaluation rubrics with calibrated confidence scoring and bias mitigation metrics.\n• Benchmark inference throughput and time-to-first-token (TTFT) across GPU compute clusters.',
      requirements: 'Required Qualifications:\n• 2–5 years of hands-on experience building, fine-tuning, and evaluating production ML models and LLM systems.\n• Strong proficiency in Python, PyTorch, Hugging Face Transformers, and modern ML engineering tooling.\n• Deep understanding of LLM architectures, prompt engineering, few-shot grounding, and RAG retrieval pipelines.\n• Solid foundation in machine learning system design, evaluation methodology, and metrics formulation.\n• Experience with vector databases (Pinecone, Qdrant, pgvector) and embedding models.\n\nPreferred Qualifications:\n• Experience with real-time conversational agents, voice/audio AI models, or full-duplex speech systems.\n• Hands-on experience with LLM serving engines (vLLM, TensorRT-LLM, Triton Inference Server).\n• Prior contributions to open-source AI frameworks or published research in NLP/Conversational AI.',
      stagesJson: JSON.stringify(['Machine Learning Fundamentals & Model Tuning', 'Conversational AI Architecture & RAG Systems', 'Research Rigor & Cross-Functional Alignment'])
    },
    {
      id: 'j5',
      companyId: 'c1',
      title: 'Senior Platform Engineer — Cloud Infrastructure & Kubernetes',
      description: 'Nexora Labs runs a globally distributed cloud footprint across multi-region AWS and GCP environments. We are seeking a Senior Platform Engineer based in our Singapore hub to build, automate, and harden the core cloud infrastructure that powers our real-time voice and data workloads.\n\nYou will own Kubernetes fleet management, GPU node autoscaling, Terraform Infrastructure as Code, CI/CD automation, and zero-trust security baselines across our global infrastructure.\n\nKey Responsibilities:\n• Architect and maintain multi-region Kubernetes (EKS/GKE) clusters running high-concurrency microservices and GPU inference nodes.\n• Build declarative Infrastructure as Code using Terraform and automated GitOps deployment pipelines (ArgoCD / GitHub Actions).\n• Implement comprehensive observability, alerting, and distributed tracing stacks using Prometheus, Grafana, OpenTelemetry, and Datadog.\n• Automate cloud networking, VPC peering, global load balancing, and edge CDN routing for sub-50ms latency.\n• Ensure enterprise-grade security hardening, KMS encryption, automated vulnerability patching, and SOC 2 / ISO 27001 compliance.',
      requirements: 'Required Qualifications:\n• 4–7 years of experience in Platform Engineering, DevOps, or Site Reliability Engineering.\n• Deep hands-on expertise with Kubernetes container orchestration, Helm charts, ingress controllers, and cluster autoscaling.\n• Mastery of Terraform and cloud infrastructure architecture on AWS or GCP.\n• Strong scripting and automation skills in Python, Go, or Bash.\n• Comprehensive understanding of Linux internals, TCP/IP networking, DNS, TLS termination, and distributed systems reliability.\n\nPreferred Qualifications:\n• Experience managing GPU workloads on Kubernetes (NVIDIA GPU Operator, CUDA driver provisioning).\n• Hands-on experience implementing SOC 2 Type II compliance controls and automated security scanning.\n• Experience with multi-region active-active architectures and disaster recovery testing.',
      stagesJson: JSON.stringify(['Cloud Infrastructure Architecture & Troubleshooting', 'Kubernetes & Platform Scaling Deep Dive', 'SRE Culture & Incident Leadership'])
    },
    {
      id: 'j6',
      companyId: 'c1',
      title: 'Product Manager — AI Platform & Developer Infrastructure',
      description: 'As a Product Manager for AI Platform at Nexora Labs, you will define the roadmap and developer experience for our core infrastructure products. You will work at the intersection of developer tooling, real-time voice intelligence, and high-scale distributed systems, turning complex capabilities into intuitive APIs and web platforms.\n\nYou will collaborate directly with our engineering teams, developer community, and enterprise customers to identify high-impact platform capabilities and guide them from concept through general availability.\n\nKey Responsibilities:\n• Own the product vision, strategy, and execution roadmap for Nexora\'s developer platform and AI infrastructure primitives.\n• Write clear, comprehensive product specifications (PRDs), API usability reviews, and developer journey maps.\n• Conduct user research and telemetry analysis to uncover developer friction and prioritize high-value features.\n• Partner with Engineering, AI Research, and Design to ship iterative, high-impact platform releases on predictable schedules.\n• Establish quantitative success metrics (adoption, latency, API reliability) and present platform progress to stakeholders.',
      requirements: 'Required Qualifications:\n• 4+ years of product management experience focused on developer platforms, API products, cloud infrastructure, or enterprise AI tools.\n• Strong technical literacy—ability to discuss distributed architecture, API design, and ML workflows with engineering leads.\n• Proven track record of taking complex technical products from 0 to 1 and scaling them to enterprise adoption.\n• Exceptional written communication skills: structured PRDs, crisp user stories, and data-backed trade-off rationale.\n• Analytical mindset with experience defining product telemetry and tracking operational KPIs.\n\nPreferred Qualifications:\n• Prior background in software engineering, computer science, or technical architecture.\n• Experience with AI developer tooling, LLM platforms, or real-time communication systems.',
      stagesJson: JSON.stringify(['Product Strategy & Technical Problem Solving', 'Developer Experience & API Design Deep Dive', 'Cross-Functional Execution & Leadership'])
    },
    {
      id: 'j7',
      companyId: 'c1',
      title: 'Product Designer — Developer Systems & Experience',
      description: 'Nexora Labs is looking for a thoughtful Product Designer to craft the user experience and interface systems across our developer consoles, real-time collaboration environments, and enterprise dashboards. We believe developer tools should be as beautiful, intuitive, and fast as the best consumer software.\n\nYou will own the end-to-end design process—from information architecture and wireframing to high-fidelity Figma components, interactive prototypes, and production design systems.\n\nKey Responsibilities:\n• Lead product design across candidate-facing interactive rooms, recruiter management portals, and developer console interfaces.\n• Design and maintain a cohesive, accessible design system with typography, color palettes, and component states in Figma.\n• Prototype micro-interactions, audio visualizations, and complex data flows to test and validate UX concepts.\n• Partner closely with frontend engineers to ensure design precision, responsive behavior, and pixel-perfect implementation.\n• Conduct usability testing and user research sessions to iteratively refine workflows.',
      requirements: 'Required Qualifications:\n• 3–6 years of product design experience working on complex SaaS platforms, developer tools, or data-dense web applications.\n• Strong portfolio demonstrating structured design thinking, elegant typography, high visual polish, and clean component systems.\n• Mastery of Figma (auto-layout, component variants, tokens, interactive prototyping).\n• Deep understanding of responsive layout principles, accessibility standards (WCAG 2.1 AA), and frontend implementation constraints.\n• Strong communication skills and ability to articulate design rationale clearly to technical partners.\n\nPreferred Qualifications:\n• Familiarity with modern frontend technologies (HTML, CSS, Tailwind CSS, React components).\n• Experience designing real-time collaboration tools, audio/video interfaces, or developer analytics.',
      stagesJson: JSON.stringify(['Design Portfolio & Systems Review', 'Interactive Problem Solving & Whiteboard Challenge', 'Collaboration & Craft Values'])
    }
  ],
  candidates: [
    { id: 'cand1', name: 'Alice Smith', email: 'alice@example.com', linkedinUrl: 'https://linkedin.com/in/alicesmith' },
    { id: 'cand2', name: 'Bob Johnson', email: 'bob@example.com', githubUrl: 'https://github.com/bobj' }
  ],
  applications: [
    { id: 'app1', jobId: 'j1', candidateId: 'cand1', resumeText: 'Alice Smith\n5 years of Python, FastAPI, and Postgres.', status: 'UNDER_REVIEW' },
    { id: 'app2', jobId: 'j3', candidateId: 'cand2', resumeText: 'Bob Johnson\nFull Stack Dev with 3 years Next.js experience.', status: 'APPLIED' }
  ],
  interviews: [],
  blueprints: [],
  emails: []
};

export function getDb(): Database {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2));
    return defaultDb;
  }
  const data = fs.readFileSync(dbPath, 'utf8');
  const parsed = JSON.parse(data);
  
  // Backwards compatibility for older data.json files
  if (!parsed.interviews) parsed.interviews = [];
  if (!parsed.blueprints) parsed.blueprints = [];
  
  return parsed;
}

export function saveDb(db: Database) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
