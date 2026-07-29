import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing, Check, ChevronRight, PauseCircle, PlayCircle, FileCheck2,
  FileText, MapPin, MousePointer2, RefreshCw, Sparkles
} from 'lucide-react';
import { ApplicationLogo } from '../ApplicationLogo';
import { useTailr4uReducedMotion } from '../../motion/MotionSystem';
import './WorkflowSimulation.css';

const TIMELINE = [
  ['IDLE', 700, 'Opening the job page'],
  ['JOB_PAGE_VISIBLE', 1200, 'Reviewing a fictional Software Engineer role'],
  ['CURSOR_TO_EXTENSION', 1100, 'Moving to the tailr4u extension'],
  ['EXTENSION_OPENING', 950, 'Opening the extension workspace'],
  ['JOB_DETECTED', 850, 'Job detected'],
  ['JD_EXTRACTING', 1550, 'Extracting responsibilities, skills, and role details'],
  ['JD_VERIFIED', 1350, 'Job description verified'],
  ['TAILORING_STARTED', 850, 'Starting evidence-backed tailoring'],
  ['RESUME_ANALYZING', 2300, 'Applying minimal resume patches'],
  ['RESUME_READY', 1350, 'Tailored resume ready'],
  ['COVER_LETTER_GENERATING', 1900, 'Creating a cover letter from the same verified JD'],
  ['DOCUMENTS_READY', 1000, 'Resume and cover letter ready'],
  ['TRACKER_UPDATING', 1600, 'Moving documents into Job Tracker'],
  ['REMINDER_CREATED', 1350, 'Scheduling a recruiter follow-up'],
  ['COMPLETE', 2600, 'From job page to follow-up—without losing context']
];

const TOTAL_DURATION = TIMELINE.reduce((sum, [, duration]) => sum + duration, 0);
const STARTS = TIMELINE.reduce((result, [, duration], index) => {
  result.push(index ? result[index - 1] + TIMELINE[index - 1][1] : 0);
  return result;
}, []);

const GROUPS = [
  ['Capture', 'JOB_PAGE_VISIBLE'],
  ['Tailor', 'TAILORING_STARTED'],
  ['Cover Letter', 'COVER_LETTER_GENERATING'],
  ['Track', 'TRACKER_UPDATING']
];

const indexOf = state => Math.max(0, TIMELINE.findIndex(([name]) => name === state));
const atLeast = (state, threshold) => indexOf(state) >= indexOf(threshold);
const between = (state, start, end) => atLeast(state, start) && !atLeast(state, end);

function stateAtElapsed(elapsed) {
  const bounded = Math.max(0, Math.min(elapsed, TOTAL_DURATION - 1));
  for (let index = TIMELINE.length - 1; index >= 0; index -= 1) {
    if (bounded >= STARTS[index]) return TIMELINE[index][0];
  }
  return TIMELINE[0][0];
}

function groupFor(state) {
  if (atLeast(state, 'TRACKER_UPDATING')) return 'Track';
  if (atLeast(state, 'COVER_LETTER_GENERATING')) return 'Cover Letter';
  if (atLeast(state, 'TAILORING_STARTED')) return 'Tailor';
  return 'Capture';
}

function BrowserChrome({ state }) {
  const extensionActive = between(state, 'EXTENSION_OPENING', 'TAILORING_STARTED');
  return <div className="ws-browser-chrome">
    <div className="ws-tabs">
      <span className="ws-chrome-menu" aria-hidden="true">⌄</span>
      <span className="ws-tab"><span className="ws-site-favicon">N</span> Platform Engineer · Northstar Labs <i>×</i></span>
      <span className="ws-new-tab" aria-hidden="true">+</span>
      <span className="ws-window-actions" aria-hidden="true"><i>—</i><i>□</i><i>×</i></span>
    </div>
    <div className="ws-toolbar">
      <span className="ws-toolbar-action" aria-hidden="true">←</span>
      <span className="ws-toolbar-action muted" aria-hidden="true">→</span>
      <span className="ws-toolbar-action reload" aria-hidden="true">↻</span>
      <div className="ws-url"><span className="ws-tune">⌘</span><span>careers.northstarlabs.example/jobs/platform-engineer</span><span>☆</span></div>
      <span className="ws-puzzle" aria-hidden="true">✦</span>
      <button className={`ws-extension-pin ${extensionActive ? 'active' : ''}`} aria-label="Open pinned tailr4u Chrome extension"><ApplicationLogo size={22} /></button>
      <span className="ws-chrome-avatar">A</span>
      <span className="ws-kebab" aria-hidden="true">⋮</span>
    </div>
  </div>;
}

function JobPage({ state }) {
  const extracting = between(state, 'JD_EXTRACTING', 'TAILORING_STARTED');
  const verified = atLeast(state, 'JD_VERIFIED');
  return <div className="ws-job-page">
    <div className="ws-job-main">
      <span className="ws-demo-label">FICTIONAL JOB PAGE</span>
      <div className={`ws-highlight ${extracting || verified ? 'shown' : ''}`}><small>ROLE TITLE</small><h3>Platform Software Engineer</h3></div>
      <div className="ws-company"><span>N</span><div><strong>Northstar Labs</strong><p><MapPin size={12} /> Bengaluru · Hybrid</p></div></div>
      <p className="ws-job-copy">Build reliable APIs and distributed services for an intelligent workflow platform used by growing teams.</p>
      <h4>What you’ll work on</h4>
      <ul>
        <li className={extracting || verified ? 'marked' : ''}>Design production services using <b>Python and FastAPI</b>.</li>
        <li className={atLeast(state, 'JD_EXTRACTING') ? 'marked delay-1' : ''}>Build reliable data workflows with <b>PostgreSQL and Redis</b>.</li>
        <li className={verified ? 'marked delay-2' : ''}>Collaborate on <b>distributed system architecture</b>.</li>
      </ul>
      <div className={`ws-skill-row ${verified ? 'shown' : ''}`}><span>Python</span><span>FastAPI</span><span>PostgreSQL</span><span>3+ years</span></div>
    </div>
    <aside className="ws-job-aside"><button>Apply now</button><dl><dt>Experience</dt><dd>3+ years</dd><dt>Workplace</dt><dd>Hybrid</dd><dt>Employment</dt><dd>Full time</dd></dl></aside>
  </div>;
}

function ExtensionPopup({ state }) {
  const labels = {
    EXTENSION_OPENING: 'Scanning active page',
    JOB_DETECTED: 'Job detected',
    JD_EXTRACTING: 'Verifying job description',
    JD_VERIFIED: 'Requirements extracted'
  };
  const label = labels[state] || 'Requirements extracted';
  return <motion.aside className="ws-extension" initial={{ opacity: 0, y: -10, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}>
    <div className="ws-extension-head"><span><ApplicationLogo size={27} /><strong>tailr4u</strong></span><em>ACTIVE PAGE</em></div>
    <div className="ws-scan-state">
      <span className={atLeast(state, 'JD_VERIFIED') ? 'verified' : 'scanning'}>{atLeast(state, 'JD_VERIFIED') ? <Check size={15} /> : <Sparkles size={15} />}</span>
      <div><small>{label}</small><strong>{atLeast(state, 'JOB_DETECTED') ? 'Platform Software Engineer' : 'Reading page structure…'}</strong></div>
    </div>
    {atLeast(state, 'JD_EXTRACTING') && <div className="ws-extracted">
      <span>Python</span><span>FastAPI</span><span>PostgreSQL</span>
      <p><Check size={12} /> Role, company, skills, location, and experience verified</p>
    </div>}
    <button className={atLeast(state, 'JD_VERIFIED') ? 'ready' : ''}><Sparkles size={14} /> Tailor application <ChevronRight size={14} /></button>
    <small className="ws-context-id">JD CONTEXT · NS-PLATFORM-042</small>
  </motion.aside>;
}

function DemoCursor({ state, reduced }) {
  const cursor = useMemo(() => {
    if (state === 'CURSOR_TO_EXTENSION') return { left: '91%', top: '13%', click: false };
    if (state === 'EXTENSION_OPENING') return { left: '91%', top: '13%', click: true };
    if (state === 'JD_VERIFIED') return { left: '83%', top: '69%', click: false };
    if (state === 'TAILORING_STARTED') return { left: '83%', top: '69%', click: true };
    return { left: '58%', top: '55%', hidden: true };
  }, [state]);
  if (reduced || cursor.hidden) return null;
  return <motion.div className={`ws-cursor ${cursor.click ? 'clicking' : ''}`} animate={{ left: cursor.left, top: cursor.top }} transition={{ duration: .85, ease: [0.2, .8, .2, 1] }}><MousePointer2 size={24} fill="white" /><span>You</span></motion.div>;
}

function TailoringWorkspace({ state }) {
  const analyzing = state === 'RESUME_ANALYZING';
  const ready = atLeast(state, 'RESUME_READY');
  return <div className="ws-workspace">
    <div className="ws-appbar"><span><ApplicationLogo size={25} /><strong>tailr4u</strong></span><em><Check size={12} /> JD LOCKED · NS-PLATFORM-042</em></div>
    <div className="ws-workspace-grid">
      <aside className="ws-resume-list"><span>SELECTED RESUME</span><div><FileText size={22} /><p><strong>Alex_Morgan_Resume.pdf</strong><small>Original · 1 page</small></p><Check size={15} /></div><dl><dt>Processing</dt><dd className={analyzing ? 'active' : 'done'}>{analyzing ? 'Applying minimal patches' : 'Evidence verified'}</dd><dt>Policy</dt><dd>Candidate evidence only</dd></dl></aside>
      <ResumeTransformation ready={ready} analyzing={analyzing} />
      <div className="ws-scores">
        <Score label="Resume match" from={68} to={ready ? 92 : analyzing ? 81 : 68} color="blue" />
        <Score label="ATS score" from={74} to={ready ? 89 : analyzing ? 82 : 74} color="teal" />
        <span><Check size={13} /> Original experience preserved</span>
      </div>
    </div>
  </div>;
}

function Score({ label, to, color }) {
  return <div className={`ws-score ${color}`}><small>{label}</small><strong>{to}<em>/100</em></strong><div><motion.i animate={{ width: `${to}%` }} transition={{ duration: .65 }} /></div></div>;
}

function ResumeTransformation({ ready, analyzing }) {
  return <div className="ws-resume-paper">
    <header><strong>ALEX MORGAN</strong><small>Software Engineer</small></header>
    <section><b>SUMMARY</b><motion.p className={ready || analyzing ? 'patched' : ''}>Software engineer building reliable <mark>API platforms</mark> and intelligent workflows.</motion.p></section>
    <section><b>EXPERIENCE</b><p>Built production services with Python and FastAPI.</p><motion.p className={ready ? 'patched' : ''}>Improved API reliability with validated inputs and <mark>persistent PostgreSQL storage</mark>.</motion.p></section>
    <section><b>SKILLS</b><div className="ws-resume-skills"><motion.span layout>Python</motion.span><motion.span layout>FastAPI</motion.span><span>PostgreSQL</span><span>Redis</span></div></section>
    {analyzing && <span className="ws-analysis-line"><Sparkles size={12} /> Comparing evidence to verified requirements…</span>}
  </div>;
}

function DocumentsWorkspace({ state }) {
  const complete = atLeast(state, 'DOCUMENTS_READY');
  return <div className="ws-workspace">
    <div className="ws-appbar"><span><ApplicationLogo size={25} /><strong>tailr4u</strong></span><em><Check size={12} /> SAME VERIFIED JD</em></div>
    <div className="ws-documents-stage">
      <motion.div layoutId="demo-resume" className="ws-ready-document resume"><FileCheck2 size={20} /><strong>Tailored Resume</strong><small>Match 92 · ATS 89</small><span><Check size={12} /> Ready</span></motion.div>
      <motion.div layoutId="demo-letter" className="ws-letter-paper" initial={{ opacity: 0, x: 25 }} animate={{ opacity: 1, x: 0 }}>
        <span>COVER LETTER</span><strong>Dear Northstar hiring team,</strong>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.1 }}>My experience building reliable FastAPI services and persistent data workflows aligns directly with the Platform Engineer role.</motion.p>
        <small>Candidate evidence only</small>
      </motion.div>
      <div className="ws-generation-status">{complete ? <Check size={15} /> : <Sparkles size={15} />}<span><strong>{complete ? 'Both documents ready' : 'Generating from verified context'}</strong><small>JD CONTEXT · NS-PLATFORM-042</small></span></div>
    </div>
  </div>;
}

function TrackerWorkspace({ state }) {
  const reminder = atLeast(state, 'REMINDER_CREATED');
  const complete = state === 'COMPLETE';
  return <div className="ws-workspace">
    <div className="ws-appbar"><span><ApplicationLogo size={25} /><strong>tailr4u</strong> · Job Tracker</span><em><Check size={12} /> CONTEXT RETAINED</em></div>
    <div className="ws-tracker-stage">
      <div className="ws-tracker-card">
        <div className="ws-tracker-title"><span>N</span><p><strong>Platform Software Engineer</strong><small>Northstar Labs · Bengaluru</small></p><em>Ready to Apply</em></div>
        <div className="ws-tracker-docs">
          <motion.div layoutId="demo-resume"><FileCheck2 size={18} /><span><strong>Resume</strong><small>Ready · Match 92</small></span><Check size={14} /></motion.div>
          <motion.div layoutId="demo-letter"><FileText size={18} /><span><strong>Cover Letter</strong><small>Ready · Same verified JD</small></span><Check size={14} /></motion.div>
        </div>
        <div className="ws-tracker-meta"><span>JD NS-PLATFORM-042</span><span>2 documents</span><span>Next: Submit application</span></div>
      </div>
      <AnimatePresence>{reminder && <motion.div className="ws-reminder-created" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}><span><BellRing size={18} /></span><p><small>FOLLOW-UP SCHEDULED</small><strong>Check in with recruiter · 5 days after applying</strong></p><Check size={16} /></motion.div>}</AnimatePresence>
      {complete && <motion.div className="ws-complete-message" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Sparkles size={17} /><strong>From job page to follow-up—without losing context.</strong></motion.div>}
    </div>
  </div>;
}

function SimulationSurface({ state, reduced }) {
  if (atLeast(state, 'TRACKER_UPDATING')) return <TrackerWorkspace state={state} />;
  if (atLeast(state, 'COVER_LETTER_GENERATING')) return <DocumentsWorkspace state={state} />;
  if (atLeast(state, 'TAILORING_STARTED')) return <TailoringWorkspace state={state} />;
  return <div className="ws-browser"><BrowserChrome state={state} /><JobPage state={state} /><AnimatePresence>{between(state, 'EXTENSION_OPENING', 'TAILORING_STARTED') && <ExtensionPopup state={state} />}</AnimatePresence><DemoCursor state={state} reduced={reduced} /></div>;
}

export default function WorkflowSimulation() {
  const reduced = useTailr4uReducedMotion();
  const sectionRef = useRef(null);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef(null);
  const playedRef = useRef(false);
  const resumeAfterHiddenRef = useRef(false);
  const [state, setState] = useState('IDLE');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const seek = useCallback((nextState, shouldPlay = false) => {
    const nextIndex = indexOf(nextState);
    elapsedRef.current = STARTS[nextIndex];
    lastTickRef.current = null;
    setState(nextState);
    setProgress((STARTS[nextIndex] / TOTAL_DURATION) * 100);
    setPlaying(shouldPlay && !reduced);
  }, [reduced]);

  const replay = () => seek('IDLE', true);
  const skip = () => seek('COMPLETE', false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !playedRef.current) {
        playedRef.current = true;
        if (!reduced) setPlaying(true);
      }
    }, { threshold: .3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        resumeAfterHiddenRef.current = playing;
        lastTickRef.current = null;
        setPlaying(false);
      } else if (resumeAfterHiddenRef.current && !reduced) {
        resumeAfterHiddenRef.current = false;
        lastTickRef.current = null;
        setPlaying(true);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [playing, reduced]);

  useEffect(() => {
    if (!playing || reduced) return undefined;
    let frame;
    const tick = now => {
      if (lastTickRef.current == null) lastTickRef.current = now;
      elapsedRef.current += Math.min(now - lastTickRef.current, 80);
      lastTickRef.current = now;
      if (elapsedRef.current >= TOTAL_DURATION) {
        elapsedRef.current %= TOTAL_DURATION;
        lastTickRef.current = now;
      }
      setState(stateAtElapsed(elapsedRef.current));
      setProgress((elapsedRef.current / TOTAL_DURATION) * 100);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reduced]);

  const currentLabel = TIMELINE[indexOf(state)][2];
  const activeGroup = groupFor(state);

  return <div className="workflow-simulation" ref={sectionRef}>
    <div className="ws-controls">
      <div className="ws-stage-tabs" role="tablist" aria-label="Workflow stages">
        {GROUPS.map(([label, target]) => <button key={label} role="tab" aria-selected={activeGroup === label} onClick={() => seek(target, false)}>{label}</button>)}
      </div>
      <div className="ws-playback">
        <button onClick={() => playing ? setPlaying(false) : (state === 'COMPLETE' ? replay() : setPlaying(!reduced))} aria-label={playing ? 'Pause simulation' : 'Play simulation'}>{playing ? <PauseCircle size={17} /> : <PlayCircle size={17} />}{playing ? 'Pause' : 'Play'}</button>
        <button onClick={replay}><RefreshCw size={15} /> Replay</button>
        <button onClick={skip}>Skip to result</button>
      </div>
    </div>
    <div className="ws-frame">
      <SimulationSurface state={state} reduced={reduced} />
    </div>
    <div className="ws-timeline" aria-live="polite">
      <div className="ws-progress"><motion.i animate={{ width: `${progress}%` }} transition={{ duration: .12 }} /></div>
      <span><i className={playing ? 'live' : ''} /> {currentLabel}</span>
      <em>{indexOf(state) + 1} / {TIMELINE.length}</em>
    </div>
    {reduced && <p className="ws-reduced-note">Reduced motion is enabled. Use the stage controls to explore the workflow.</p>}
  </div>;
}
