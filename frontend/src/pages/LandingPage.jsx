import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, BellRing, Check, LayoutDashboard, Moon, Zap, Sun
} from 'lucide-react';
import { ApplicationLogo } from '../components/ApplicationLogo';
import BrandLogo from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import { useTailr4uReducedMotion } from '../motion/MotionSystem';
import PublicAuthPanel from '../components/landing/PublicAuthPanel';
import FeatureStoryStack from '../components/landing/FeatureStoryStack';
import './LandingPage.css';

const WorkflowSimulation = lazy(() => import('../components/landing/WorkflowSimulation'));

function ResumePreview() {
  return <div className="lp-document">
    <div className="lp-doc-head"><span>ALEX MORGAN</span><em>92% match</em></div>
    <div className="lp-doc-rule" />
    <strong>SOFTWARE ENGINEER</strong>
    <p>Built reliable API workflows with <mark>FastAPI</mark>, PostgreSQL, and Redis.</p>
    <p>Designed <mark>multi-agent systems</mark> with persistent contextual memory.</p>
    <div className="lp-doc-note"><Zap size={13} /> 2 precise improvements ready</div>
  </div>;
}

function LetterPreview() {
  return <div className="lp-document lp-letter">
    <span className="lp-tech-label">ROLE-SPECIFIC DRAFT</span>
    <strong>Dear Hiring Team,</strong>
    <p>My experience building production API systems and reliable AI workflows directly supports your platform goals.</p>
    <p className="lp-muted-line">Grounded in 4 verified resume facts</p>
    <div className="lp-signature">Alex</div>
  </div>;
}

function TrackerPreview() {
  return <div className="lp-board">
    {['Saved', 'Interview', 'Offer'].map((stage, index) => <div className="lp-column" key={stage}>
      <span>{stage}</span>
      <div className={`lp-job lp-job-${index}`}>
        <strong>{['Platform Engineer', 'SDE — AI', 'Software Engineer'][index]}</strong>
        <small>{['Acme Labs', 'Northstar', 'Microsoft'][index]}</small>
      </div>
    </div>)}
  </div>;
}

function ReminderPreview() {
  return <div className="lp-reminders">
    {[['Today · 4:30 PM', 'Prepare system-design notes'], ['Tomorrow', 'Follow up with recruiter'], ['Friday', 'Submit tailored application']].map(([time, task], index) =>
      <div className="lp-reminder" key={task}><span className={index === 0 ? 'active' : ''}><BellRing size={15} /></span><div><small>{time}</small><strong>{task}</strong></div>{index === 2 && <Check size={16} />}</div>
    )}
  </div>;
}

function HeroVisual({ reduced }) {
  const visualRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const onMove = event => {
    if (reduced || window.matchMedia('(pointer: coarse)').matches) return;
    const rect = visualRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTilt({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 8,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * -8
    });
  };

  return <div
    ref={visualRef}
    className="lp-hero-visual"
    onPointerMove={onMove}
    onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    aria-label="Resume and job description flowing into the tailr4u application tracker"
  >
    <motion.div className="lp-orbit lp-orbit-jd" animate={reduced ? undefined : { y: [0, -7, 0] }} transition={{ duration: 4, repeat: Infinity }}>
      <span className="lp-tech-label">JOB DESCRIPTION</span>
      <strong>Software Engineer — AI</strong>
      <p>Python · FastAPI · Distributed systems</p>
    </motion.div>
    <motion.div className="lp-orbit lp-orbit-resume" style={{ rotateX: tilt.y, rotateY: tilt.x }}>
      <ResumePreview />
    </motion.div>
    <div className="lp-match"><span>ATS MATCH</span><strong>92</strong><em>/100</em></div>
    <svg className="lp-connector" viewBox="0 0 600 490" aria-hidden="true">
      <path d="M130 115 C270 90 210 260 340 250 S460 330 500 380" />
    </svg>
    <div className="lp-tracker-chip"><LayoutDashboard size={16} /><span><small>APPLICATION ADDED</small>Interview pipeline</span><Check size={15} /></div>
  </div>;
}

export default function LandingPage() {
  const { user, darkMode, toggleDarkMode } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useTailr4uReducedMotion();
  const [loadWorkflow, setLoadWorkflow] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const [scrolled, setScrolled] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const workflowRef = useRef(null);
  const authMode = ['/login', '/register', '/forgot-password', '/email-sent'].includes(location.pathname);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 30);
      setNavVisible(true);
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openApp = () => navigate(user ? '/dashboard' : '/login?redirect=%2Fdashboard');
  const scrollToWorkflow = () => document.getElementById('how-it-works')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  const scrollToSection = id => {
    if (authMode) {
      navigate('/');
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }), 40);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    document.title = 'Tailr4U — Stronger applications, grounded in your experience';
    return () => { document.title = 'Tailr4U'; };
  }, []);

  useEffect(() => {
    const sections = ['home', 'how-it-works']
      .map(id => document.getElementById(id))
      .filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActiveSection(visible.target.id);
    }, { rootMargin: '-18% 0px -58% 0px', threshold: [0, .15, .35, .6] });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [authMode]);

  useEffect(() => {
    const node = workflowRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setLoadWorkflow(true);
        observer.disconnect();
      }
    }, { rootMargin: '500px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div className="landing-page">
    <a className="lp-skip" href="#main-content">Skip to content</a>
    <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''} ${navVisible ? 'nav-visible' : 'nav-hidden'}`}>
      <Link to="/" className="lp-brand" aria-label="Tailr4U home">
        <BrandLogo size={36} />
      </Link>
      <nav className="lp-public-links" aria-label="Landing page sections">
        {[
          ['home', 'Home'],
          ['how-it-works', 'How It Works']
        ].map(([id, label]) => <button key={id} className={activeSection === id ? 'active' : ''} onClick={() => scrollToSection(id)} aria-current={activeSection === id ? 'page' : undefined}>{label}</button>)}
        <span className={`lp-nav-indicator lp-nav-indicator-${activeSection}`} />
      </nav>
      <nav className="lp-account-actions" aria-label="Account navigation">
        <button
          type="button"
          className="lp-theme-toggle"
          onClick={toggleDarkMode}
          aria-label={darkMode ? 'Use light theme' : 'Use dark theme'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {!user && <button className="lp-text-button" onClick={() => navigate(authMode ? '/' : '/login')}>
          {authMode ? 'Back' : 'Login'}
        </button>}
        <button className="lp-small-cta" onClick={openApp}>{user ? 'Continue to App' : 'Get Started'} <ArrowRight size={15} /></button>
      </nav>
    </header>

    <main id="main-content">
      <section id="home" className="lp-hero">
        <AnimatePresence mode="wait" initial={false}>
          {!authMode ? <motion.div key="landing-copy" className="lp-hero-copy" initial={reduced ? { opacity: 0 } : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 }} transition={{ duration: reduced ? .08 : .18 }}>
            <span className="lp-kicker"><Zap size={14} /> Your application, intelligently connected</span>
            <h1>Turn every job description into a <span>stronger application.</span></h1>
            <p>Tailor resumes, generate cover letters, track applications, and stay ahead of every recruiter follow-up from one intelligent workspace.</p>
            <div className="lp-actions">
              <button className="lp-primary-cta" onClick={openApp}>{user ? 'Open your dashboard' : 'Get started'} <ArrowRight size={18} /></button>
              <button className="lp-secondary-cta" onClick={scrollToWorkflow}>See how it works</button>
            </div>
            <small className="lp-trust"><Check size={14} /> Resume tailoring that preserves your real experience.</small>
          </motion.div> : <motion.div key="auth-context" className="lp-auth-context" initial={reduced ? { opacity: 0 } : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .08 : .18 }}>
            <span className="lp-kicker"><Zap size={14} /> One connected application workspace</span>
            <h1>Your next opportunity, <span>kept in context.</span></h1>
            <p>Return to your verified job descriptions, tailored documents, application pipeline, and recruiter follow-ups.</p>
            <div className="lp-auth-benefits"><span><Check size={15} /> Evidence-backed resume tailoring</span><span><Check size={15} /> Verified JD across every document</span><span><Check size={15} /> Applications and reminders connected</span></div>
          </motion.div>}
        </AnimatePresence>
        <div className="lp-hero-side">
          <motion.div className="lp-product-context" animate={{ scale: authMode ? .94 : 1, opacity: authMode ? .2 : 1 }} transition={{ duration: reduced ? .08 : .22 }} aria-hidden={authMode}><HeroVisual reduced={reduced} /></motion.div>
          <AnimatePresence>{authMode && <PublicAuthPanel />}</AnimatePresence>
        </div>
      </section>

      <section className="lp-value-strip" aria-label="Product outcomes">
        <span><strong>Exact preview</strong> before download</span>
        <span><strong>Verified JD</strong> across the pipeline</span>
        <span><strong>Strict ATS checks</strong> with repeat detection</span>
      </section>

      <section id="how-it-works" ref={workflowRef} className="lp-section lp-workflow">
        <div className="lp-section-heading">
          <span className="lp-tech-label">ONE CONNECTED WORKFLOW</span>
          <h2>From job page to follow-up,<br />without losing the context.</h2>
        </div>
        {loadWorkflow ? <Suspense fallback={<div className="h-[620px] rounded-[28px] border border-[var(--line)] bg-white/30 animate-pulse" aria-label="Loading interactive workflow" />}><WorkflowSimulation /></Suspense> : <div className="h-[620px] rounded-[28px] border border-[var(--line)] bg-white/30" aria-hidden="true" />}
      </section>

      <section className="lp-section lp-preview-section">
        <FeatureStoryStack />
      </section>

      <section className="lp-final-cta">
        <span className="lp-tech-label">YOUR NEXT APPLICATION STARTS HERE</span>
        <button className="lp-primary-cta" onClick={openApp}>{user ? 'Continue to dashboard' : 'Build a stronger application'} <ArrowRight size={18} /></button>
      </section>
    </main>

    <footer className="lp-footer">
      <Link to="/" className="lp-brand"><BrandLogo size={28} /></Link>
      <span>© {new Date().getFullYear()} Tailr4U</span>
      <nav aria-label="Footer navigation"><Link to="/support/faq">Help</Link><Link to="/support/contact">Contact</Link></nav>
    </footer>
  </div>;
}
