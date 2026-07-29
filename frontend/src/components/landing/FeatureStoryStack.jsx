import React, { useRef, useState } from 'react';
import {
  motion, useMotionValue, useMotionValueEvent, useReducedMotion,
  useScroll, useSpring, useTransform
} from 'framer-motion';
import {
  BellRing, Check, CheckCircle2, ChevronRight, Clock3, FileCheck2,
  FileText, Mail, Sparkles, UserRound
} from 'lucide-react';
import './FeatureStoryStack.css';

const stories = [
  {
    id: 'resume', number: '01', name: 'Resume',
    label: 'EVIDENCE-BACKED TAILORING',
    lines: ['Improve the fit.', 'Keep the truth.'],
    description: 'Review every proposed change before it becomes part of your resume.',
    accent: 'blue'
  },
  {
    id: 'letter', number: '02', name: 'Cover Letter',
    label: 'SAME VERIFIED JOB CONTEXT',
    lines: ['Write for the role.', 'Stay grounded in evidence.'],
    description: 'Create a focused letter from the same verified job description and candidate experience.',
    accent: 'violet'
  },
  {
    id: 'tracker', number: '03', name: 'Job Tracker',
    label: 'ONE APPLICATION WORKSPACE',
    lines: ['Every opportunity.', 'Exactly where it stands.'],
    description: 'Keep documents, recruiter context, and next actions connected to the right application.',
    accent: 'green'
  },
  {
    id: 'reminders', number: '04', name: 'Reminders',
    label: 'FOLLOW-UP INTELLIGENCE',
    lines: ['Remember the moment.', 'Make the next move.'],
    description: 'Schedule recruiter follow-ups and interview preparation without losing application context.',
    accent: 'orange'
  }
];

function ResumeStoryVisual({ active }) {
  return <div className="fs-resume-visual" aria-label="Tailored resume preview with highlighted evidence and a 92 percent match score">
    <div className="fs-resume-sheet">
      <header><strong>ALEX MORGAN</strong><span>Software Engineer</span></header>
      <section><b>SUMMARY</b><p>Software engineer building reliable <mark>API platforms</mark> and intelligent workflows.</p></section>
      <section><b>EXPERIENCE</b><p>Built production services using <mark>Python and FastAPI</mark> with persistent PostgreSQL storage.</p></section>
      <section><b>SKILLS</b><div><span>Python</span><span>FastAPI</span><span>PostgreSQL</span><span>Redis</span></div></section>
      <aside><Sparkles size={13} /> 2 precise improvements ready</aside>
    </div>
    <motion.div className="fs-match-orb" animate={active ? { scale: [1, 1.035, 1] } : { scale: 1 }} transition={{ duration: 2.4, repeat: active ? Infinity : 0 }}><small>MATCH</small><strong>92</strong><em>/100</em></motion.div>
    <span className="fs-preserved"><Check size={13} /> Original experience preserved</span>
  </div>;
}

function LetterStoryVisual() {
  const [improved, setImproved] = useState(true);
  return <div className="fs-letter-visual" aria-label="Cover letter generated from the verified job description">
    <div className="fs-letter-toolbar"><span><FileText size={15} /> Cover Letter</span><em><Check size={12} /> VERIFIED JD</em></div>
    <div className="fs-letter-sheet">
      <span className="fs-mono">NORTHSTAR LABS · PLATFORM ENGINEER</span>
      <strong>Dear Hiring Team,</strong>
      <motion.p key={improved ? 'improved' : 'original'} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
        {improved
          ? 'My experience building reliable FastAPI services and persistent data workflows directly supports the platform challenges described in this role.'
          : 'I am writing to apply for the Platform Engineer position and believe my background may be a good fit.'}
      </motion.p>
      <div className="fs-letter-lines"><i /><i /><i /></div>
      <small>Candidate evidence only</small>
    </div>
    <div className="fs-compare-toggle"><button className={!improved ? 'active' : ''} onClick={() => setImproved(false)}>Original</button><button className={improved ? 'active' : ''} onClick={() => setImproved(true)}>Improved</button></div>
  </div>;
}

function TrackerStoryVisual() {
  const [ready, setReady] = useState(false);
  return <div className="fs-tracker-visual" aria-label="Job Tracker application moving from saved to ready to apply">
    <div className="fs-tracker-columns">
      {['Saved', 'Tailoring', 'Ready to Apply'].map((stage, index) => <div key={stage} className={`fs-tracker-column ${ready && index === 2 ? 'active' : ''}`}>
        <span>{stage}</span>
        {((!ready && index === 1) || (ready && index === 2)) && <motion.article layoutId="northstar-story-card" transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
          <header><i>N</i><div><strong>Platform Engineer</strong><small>Northstar Labs</small></div></header>
          <div><span><FileCheck2 size={14} /> Resume <Check size={12} /></span><span><FileText size={14} /> Letter <Check size={12} /></span></div>
          <footer><UserRound size={12} /> Maya Chen · Recruiter</footer>
        </motion.article>}
      </div>)}
    </div>
    <button className="fs-demo-action" onClick={() => setReady(value => !value)}>{ready ? 'Move back' : 'Mark ready to apply'} <ChevronRight size={14} /></button>
  </div>;
}

function ReminderStoryVisual() {
  const [complete, setComplete] = useState(false);
  return <div className="fs-reminder-visual" aria-label="Recruiter follow-up reminder demo">
    <div className="fs-calendar-card"><span>JUL</span><strong>31</strong><small>Thursday</small></div>
    <motion.article animate={{ opacity: complete ? .62 : 1 }}>
      <header><span><BellRing size={17} /></span><div><small>RECRUITER FOLLOW-UP</small><strong>Check in with Maya at Northstar</strong></div></header>
      <p><Clock3 size={13} /> 10:30 AM · 5 days after applying</p>
      <div><button>Snooze</button><button className={complete ? 'complete' : ''} onClick={() => setComplete(value => !value)}>{complete ? <CheckCircle2 size={14} /> : <Check size={14} />}{complete ? 'Completed' : 'Mark complete'}</button></div>
    </motion.article>
    <span className="fs-reminder-context"><Mail size={13} /> Platform Engineer · Northstar Labs</span>
  </div>;
}

const visualFor = (id, active) => {
  if (id === 'resume') return <ResumeStoryVisual active={active} />;
  if (id === 'letter') return <LetterStoryVisual />;
  if (id === 'tracker') return <TrackerStoryVisual />;
  return <ReminderStoryVisual />;
};

const poses = [
  { x: -70, y: 32, rotate: -6, scale: 1 },
  { x: 64, y: 28, rotate: 5, scale: 1 },
  { x: -34, y: 17, rotate: -3, scale: 1 },
  { x: 36, y: 8, rotate: 2, scale: 1 }
];

function StoryCard({ story, index, active, progress, reduced }) {
  const side = index % 2 ? 1 : -1;
  const base = poses[index];
  const deckPosition = useTransform(progress, value => (value * 3) - index);
  // Negative values are upcoming cards below the stage. Zero is the active
  // card. Positive values are completed cards settling into the rear stack.
  const x = useTransform(deckPosition, [-1, -.72, -.12, 0, .18, 1, 3], [
    side * 18, side * 14, side * 5, 0, base.x * .45, base.x, base.x * 1.12
  ]);
  const y = useTransform(deckPosition, [-1, -.72, -.12, 0, .18, 1, 3], [
    210, 180, 38, 0, -10, -30, -45
  ]);
  const rotate = useTransform(deckPosition, [-1, -.72, -.12, 0, .18, 1, 3], [
    side * 1.5, side * 1.2, side * .4, 0, base.rotate * .48, base.rotate, base.rotate * 1.15
  ]);
  const scale = useTransform(deckPosition, [-1, 0, 3], [1, 1, 1]);
  const opacity = useTransform(deckPosition, [-1, -.72, -.18, 0, .18, 1, 3], [
    0, 0, .72, 1, .92, .78, .58
  ]);
  const zIndex = useTransform(deckPosition, [-1, -.02, 0, .02, 1, 3], [
    10 + index, 44, 60, 48, 34, 20
  ]);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const tiltX = useSpring(pointerY, { stiffness: 260, damping: 30, mass: .9 });
  const tiltY = useSpring(pointerX, { stiffness: 260, damping: 30, mass: .9 });

  const movePointer = event => {
    if (!active || reduced) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - rect.left) / rect.width - .5) * 6);
    pointerY.set(((event.clientY - rect.top) / rect.height - .5) * -4);
  };
  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return <motion.article
      className={`fs-story-card fs-${story.accent} ${index % 2 ? 'reverse' : ''} ${active ? 'active' : 'inactive'}`}
      aria-hidden={!active}
      style={reduced ? {
        x: active ? 0 : base.x * .55,
        y: active ? 0 : base.y,
        rotate: active ? 0 : base.rotate * .65,
        scale: active ? 1 : base.scale,
        opacity: active ? 1 : .82,
        zIndex: active ? 50 : 20 - index
      } : {
        x, y, rotate, scale, opacity, zIndex,
        rotateX: active ? tiltX : 0,
        rotateY: active ? tiltY : 0
      }}
      onPointerMove={movePointer}
      onPointerLeave={resetPointer}
      transition={{ type: 'spring', stiffness: 260, damping: 30, mass: .9 }}
    >
      <div className="fs-story-copy">
        <div className="fs-story-meta"><span>{story.label}</span><em>{story.number} / 04</em></div>
        <h3>{story.lines.map(line => <span key={line}>{line}</span>)}</h3>
        <p>{story.description}</p>
        <span className="fs-chapter-name">{story.name}</span>
      </div>
      <div className="fs-story-visual">
        {visualFor(story.id, active)}
      </div>
    </motion.article>;
}

export default function FeatureStoryStack() {
  const rootRef = useRef(null);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: rootRef, offset: ['start start', 'end end'] });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 260, damping: 30, mass: .9 });
  // Each chapter owns one third of the scroll runway. Keep its card fixed for
  // the first 60% of that runway, then use the remaining 40% for the physical
  // card transition. This makes trackpad scrolling deliberate without
  // intercepting native wheel/touch events or trapping the page.
  const pacedProgress = useTransform(
    smoothProgress,
    [0, .20, 1 / 3, .533333, 2 / 3, .866667, 1],
    [0, 0, 1 / 3, 1 / 3, 2 / 3, 2 / 3, 1]
  );

  useMotionValueEvent(pacedProgress, 'change', value => {
    setActive(Math.min(3, Math.max(0, Math.round(value * 3))));
  });

  const selectCard = index => {
    setActive(index);
    if (reduced) return;
    const root = rootRef.current;
    if (!root) return;
    const travel = root.offsetHeight - window.innerHeight;
    window.scrollTo({ top: root.offsetTop + (travel * index / 3), behavior: 'smooth' });
  };

  return <div className="feature-story-stack" ref={rootRef}>
    <div className="fs-sticky-stage">
    <header className="fs-deck-heading">
      <span>THE REAL PRODUCT, AT A GLANCE</span>
      <h2>Scroll through the complete application story.</h2>
    </header>
    <aside className="fs-progress" aria-label={`Active feature: ${stories[active].name}`} aria-live="polite">
      <i><motion.b animate={{ height: `${((active + 1) / stories.length) * 100}%` }} /></i>
      {stories.map((story, index) => <button key={story.id} className={active === index ? 'active' : ''} onClick={() => selectCard(index)}><span>{story.number}</span>{story.name}</button>)}
    </aside>
    <div className="fs-card-deck">
      {stories.map((story, index) => <StoryCard key={story.id} story={story} index={index} active={active === index} progress={pacedProgress} reduced={reduced} />)}
    </div>
    </div>
  </div>;
}
